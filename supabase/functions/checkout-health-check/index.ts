import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: { status: string; message?: string };
    stripeConfig: { status: string; message?: string };
    activeEvent: { status: string; eventTitle?: string; message?: string };
    ticketInventory: { status: string; ticketTypes?: string[]; message?: string };
    stripePriceIds: { status: string; missing?: string[]; message?: string };
  };
  timestamp: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const result: HealthCheckResult = {
    status: "healthy",
    checks: {
      database: { status: "unknown" },
      stripeConfig: { status: "unknown" },
      activeEvent: { status: "unknown" },
      ticketInventory: { status: "unknown" },
      stripePriceIds: { status: "unknown" },
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Check 1: Database connectivity
    try {
      const { error } = await supabaseClient
        .from("event_details")
        .select("id")
        .limit(1);
      
      if (error) {
        result.checks.database = { status: "fail", message: error.message };
        result.status = "unhealthy";
      } else {
        result.checks.database = { status: "pass" };
      }
    } catch (e) {
      result.checks.database = { status: "fail", message: String(e) };
      result.status = "unhealthy";
    }

    // Check 2: Stripe configuration
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      result.checks.stripeConfig = { status: "fail", message: "STRIPE_SECRET_KEY not configured" };
      result.status = "unhealthy";
    } else if (!stripeKey.startsWith("sk_")) {
      result.checks.stripeConfig = { status: "fail", message: "Invalid Stripe key format" };
      result.status = "unhealthy";
    } else {
      result.checks.stripeConfig = { status: "pass" };
    }

    // Check 3: Active event exists
    try {
      const { data: event, error } = await supabaseClient
        .from("event_details")
        .select("id, title")
        .eq("title", "Cosmico 2026")
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) {
        result.checks.activeEvent = { status: "fail", message: error.message };
        result.status = "unhealthy";
      } else if (!event) {
        result.checks.activeEvent = { status: "fail", message: "No active 'Cosmico 2026' event found" };
        result.status = "unhealthy";
      } else {
        result.checks.activeEvent = { status: "pass", eventTitle: event.title };
      }
    } catch (e) {
      result.checks.activeEvent = { status: "fail", message: String(e) };
      result.status = "unhealthy";
    }

    // Check 4: Ticket inventory exists (uses database ticket_types table)
    // Check 5: Stripe price IDs are configured for purchasable tickets
    if (result.checks.activeEvent.status === "pass") {
      try {
        const { data: eventData } = await supabaseClient
          .from("event_details")
          .select("id")
          .eq("title", "Cosmico 2026")
          .eq("is_active", true)
          .single();

        if (!eventData) {
          result.checks.ticketInventory = { status: "fail", message: "Could not fetch event for inventory check" };
          result.checks.stripePriceIds = { status: "fail", message: "Could not fetch event for price ID check" };
          result.status = "degraded";
        } else {
          // Fetch active ticket types from database (single source of truth)
          const { data: ticketTypesData, error: ticketTypesError } = await supabaseClient
            .from("ticket_types")
            .select("key, stripe_price_id, price")
            .eq("event_id", eventData.id)
            .eq("is_active", true);

          if (ticketTypesError) {
            result.checks.ticketInventory = { status: "fail", message: `Failed to fetch ticket types: ${ticketTypesError.message}` };
            result.checks.stripePriceIds = { status: "fail", message: `Failed to fetch ticket types: ${ticketTypesError.message}` };
            result.status = "degraded";
          } else if (!ticketTypesData || ticketTypesData.length === 0) {
            result.checks.ticketInventory = { status: "fail", message: "No active ticket types found in database" };
            result.checks.stripePriceIds = { status: "fail", message: "No active ticket types found in database" };
            result.status = "degraded";
          } else {
            // Filter for inventory check (exclude free tickets)
            const paidTicketTypes = ticketTypesData.filter(t => t.price > 0);
            const ticketTypeKeys = paidTicketTypes.map(t => t.key);
            const missingTypes: string[] = [];

            for (const ticketType of ticketTypeKeys) {
              const { data } = await supabaseClient
                .from("ticket_inventory")
                .select("ticket_type")
                .eq("ticket_type", ticketType)
                .eq("event_id", eventData.id)
                .limit(1);

              if (!data || data.length === 0) {
                missingTypes.push(ticketType);
              }
            }

            if (missingTypes.length > 0) {
              result.checks.ticketInventory = { 
                status: "fail", 
                message: `Missing inventory for: ${missingTypes.join(", ")}` 
              };
              result.status = "degraded";
            } else {
              result.checks.ticketInventory = { status: "pass", ticketTypes: ticketTypeKeys };
            }

            // Check 5: Verify stripe_price_id exists for purchasable ticket types
            // Purchasable = non-free, non-youth (youth uses price_data), non-child tickets
            const purchasableTickets = ticketTypesData.filter(t => 
              t.price > 0 && 
              !t.key.startsWith("youth_") && 
              !t.key.startsWith("child_")
            );
            
            const missingPriceIds = purchasableTickets
              .filter(t => !t.stripe_price_id)
              .map(t => t.key);

            if (missingPriceIds.length > 0) {
              result.checks.stripePriceIds = {
                status: "fail",
                missing: missingPriceIds,
                message: `Missing stripe_price_id for: ${missingPriceIds.join(", ")}`,
              };
              // This is CRITICAL - checkout will fail without price IDs
              result.status = "unhealthy";
            } else {
              result.checks.stripePriceIds = { status: "pass" };
            }
          }
        }
      } catch (e) {
        result.checks.ticketInventory = { status: "fail", message: String(e) };
        result.checks.stripePriceIds = { status: "fail", message: String(e) };
        result.status = "degraded";
      }
    }

    // Log result for monitoring
    console.log(`[checkout-health-check] Status: ${result.status}`, JSON.stringify(result.checks));

    // If unhealthy, create admin notification
    if (result.status === "unhealthy") {
      try {
        const serviceClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        await serviceClient.from("admin_notifications").insert({
          type: "checkout_health_check",
          title: "🚨 Checkout System Unhealthy",
          message: `Checkout health check failed. Checks: ${JSON.stringify(result.checks)}`,
          metadata: result,
        });
      } catch (notifyError) {
        console.error("[checkout-health-check] Failed to create admin notification:", notifyError);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: result.status === "unhealthy" ? 503 : 200,
    });
  } catch (error) {
    console.error("[checkout-health-check] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        status: "unhealthy",
        error: String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 503,
      }
    );
  }
});
