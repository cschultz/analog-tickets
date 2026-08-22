import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { generateMetaEventId, sendMetaCapiInitiateCheckout } from "../_shared/meta-capi-utils.ts";
import { checkRateLimitDb } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

// Patron package configuration interface
interface PatronPackageConfig {
  priceId: string;
  name: string;
  amount: number;
}

// Database patron type row interface
interface PatronTypeRow {
  key: string;
  label: string;
  price: number;
  stripe_price_id: string | null;
}

// Fetch patron packages from database
// deno-lint-ignore no-explicit-any
async function fetchPatronPackages(
  supabaseClient: any
): Promise<Record<string, PatronPackageConfig>> {
  // Get active Cosmico 2026 event
  const { data: event } = await supabaseClient
    .from("event_details")
    .select("id")
    .eq("title", "Cosmico 2026")
    .eq("is_active", true)
    .single();

  if (!event) {
    console.error("[create-patrons-checkout] Event not found");
    return {};
  }

  const { data: patronTypes, error } = await supabaseClient
    .from("ticket_types")
    .select("key, label, price, stripe_price_id")
    .eq("event_id", event.id)
    .eq("is_active", true)
    .like("key", "patrons_%");

  if (error || !patronTypes) {
    console.error("[create-patrons-checkout] Failed to fetch patron types:", error);
    return {};
  }

  const config: Record<string, PatronPackageConfig> = {};
  for (const pt of patronTypes as PatronTypeRow[]) {
    // Map database key to API key (patrons_ultimate -> ultimate)
    const apiKey = pt.key.replace("patrons_", "");
    if (pt.stripe_price_id) {
      config[apiKey] = {
        priceId: pt.stripe_price_id,
        name: pt.label,
        amount: pt.price / 100, // Convert cents to dollars for display
      };
    }
  }
  return config;
}

// Input validation schema
const requestSchema = z.object({
  packageType: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  email: z.string().email("Invalid email format").max(255, "Email too long"),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
});

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting check (DB-backed)
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    
    const rateLimitResult = await checkRateLimitDb(
      clientIp, 
      "create-patrons-checkout", 
      RATE_LIMIT_MAX_REQUESTS, 
      RATE_LIMIT_WINDOW_SECONDS
    );
    
    if (!rateLimitResult.allowed) {
      console.warn(`[create-patrons-checkout] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil((rateLimitResult.resetsAt.getTime() - Date.now()) / 1000)
        }),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((rateLimitResult.resetsAt.getTime() - Date.now()) / 1000).toString()
          }, 
          status: 429 
        }
      );
    }

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);
    
    if (!validationResult.success) {
      console.error("[create-patrons-checkout] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { packageType, name, email, fbp, fbc } = validationResult.data;
    
    // Generate meta_event_id for CAPI Purchase deduplication
    const metaEventId = generateMetaEventId("purchase");
    const icEventId = generateMetaEventId("ic");

    console.log("[create-patrons-checkout] Starting checkout", { packageType, email, metaEventId });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch patron packages from database
    const PATRONS_PACKAGES = await fetchPatronPackages(supabaseClient);

    const selectedPackage = PATRONS_PACKAGES[packageType];
    if (!selectedPackage) {
      console.error("[create-patrons-checkout] Invalid package type:", packageType);
      return new Response(
        JSON.stringify({ error: "Invalid package type selected." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check for existing customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("[create-patrons-checkout] Found existing customer", { customerId });
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: [
        {
          price: selectedPackage.priceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/ticket-success?session_id={CHECKOUT_SESSION_ID}&package=${packageType}`,
      cancel_url: `${origin}/tickets`,
      metadata: {
        package_type: packageType,
        package_name: selectedPackage.name,
        buyer_name: name,
        buyer_email: email,
        meta_event_id: metaEventId,
        fbp: fbp || "",
        fbc: fbc || "",
        client_ip: clientIp !== "unknown" ? clientIp : "",
        client_user_agent: (req.headers.get("user-agent") || "").substring(0, 500),
        event_source_url: "https://example.invalid",
      },
      payment_intent_data: {
        description: `Cosmico - ${selectedPackage.name}`,
        metadata: {
          package_type: packageType,
          package_name: selectedPackage.name,
          buyer_name: name,
        },
      },
    });

    console.log("[create-patrons-checkout] Session created", { sessionId: session.id });

    // Fire server-side InitiateCheckout CAPI (non-blocking)
    sendMetaCapiInitiateCheckout({
      event_id: icEventId,
      email,
      first_name: name?.split(" ")[0] || undefined,
      last_name: name?.split(" ").slice(1).join(" ") || undefined,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      external_id: customerId || undefined,
      client_ip: clientIp !== "unknown" ? clientIp : undefined,
      client_user_agent: req.headers.get("user-agent") || undefined,
      value: selectedPackage.amount,
      currency: "USD",
      content_ids: [packageType],
      content_name: selectedPackage.name,
      event_source_url: "https://example.invalid",
    }).catch((err) => console.error("[create-patrons-checkout] CAPI IC error:", err));

    return new Response(JSON.stringify({ url: session.url, metaEventId, icEventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[create-patrons-checkout] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again later." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
