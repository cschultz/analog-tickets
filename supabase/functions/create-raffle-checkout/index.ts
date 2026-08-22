import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStripeClient } from "../_shared/stripe-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Compliance: every entrant gets exactly ONE entry. The donation amount is
// optional and does NOT affect entries or odds. Donations support Launch Pad
// Foundation (501(c)(3)).
const ENTRIES_PER_PERSON = 1;
const MIN_DONATION_CENTS = 100; // $1 minimum for Stripe
const MAX_DONATION_CENTS = 1000000; // $10,000 sanity cap

function syncMarketing(
  supabase: ReturnType<typeof createClient>,
  { email, firstName, phone }: { email: string; firstName?: string | null; phone?: string | null }
) {
  try {
    supabase.functions
      .invoke("sync-flodesk", {
        body: {
          email,
          firstName: firstName || undefined,
          segmentIds: ["6930a0da231c07add766b8a0"],
        },
      })
      .catch((e) => console.error("[create-raffle-checkout] sync-flodesk failed:", e));

    if (phone) {
      supabase.functions
        .invoke("sync-simpletexting", {
          body: { phone, email, firstName: firstName || undefined, listName: "Cosmico Full List" },
        })
        .catch((e) => console.error("[create-raffle-checkout] sync-simpletexting failed:", e));
    }
  } catch (e) {
    console.error("[create-raffle-checkout] syncMarketing error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { donationAmount, email, firstName, lastName, phone, tier } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // donationAmount is in cents. Validate.
    const amountCents = Math.round(Number(donationAmount));
    if (!Number.isFinite(amountCents) || amountCents < MIN_DONATION_CENTS || amountCents > MAX_DONATION_CENTS) {
      return new Response(
        JSON.stringify({ error: "Invalid donation amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Reuse the most recent partial entry (created at hero email capture) if one
    // exists, so we don't end up with duplicate raffle_entries rows per user.
    const cleanEmail = email.trim().toLowerCase();
    const { data: partial } = await supabaseAdmin
      .from("raffle_entries")
      .select("id")
      .eq("email", cleanEmail)
      .eq("payment_status", "partial")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let entry: { id: string };
    if (partial) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("raffle_entries")
        .update({
          phone: phone || null,
          first_name: firstName || null,
          last_name: lastName || null,
          tier: tier || "custom",
          entries_count: ENTRIES_PER_PERSON,
          donation_amount: amountCents,
          payment_status: "pending",
        })
        .eq("id", partial.id)
        .select("id")
        .single();
      if (updateError) {
        console.error("Update error:", updateError);
        throw new Error("Failed to update raffle entry");
      }
      entry = updated;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("raffle_entries")
        .insert({
          email: cleanEmail,
          phone: phone || null,
          first_name: firstName || null,
          last_name: lastName || null,
          tier: tier || "custom",
          entries_count: ENTRIES_PER_PERSON,
          donation_amount: amountCents,
          payment_status: "pending",
        })
        .select("id")
        .single();
      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error("Failed to create raffle entry");
      }
      entry = inserted;
    }

    // Create Stripe checkout session with a dynamic price for the donation
    const stripe = getStripeClient();
    const origin = req.headers.get("origin") || "https://example.invalid";
    const dollars = Math.round(amountCents / 100);

    const session = await stripe.checkout.sessions.create({
      customer_email: email.trim().toLowerCase(),
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "Cosmico — Optional Donation",
            description: "Donation to Launch Pad Foundation (501(c)(3)). Sweepstakes entry granted free of charge — donations do not affect odds.",
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      payment_intent_data: {
        description: `Cosmico - Optional donation to Launch Pad Foundation (sweepstakes entry granted free of charge)`,
      },
      success_url: `${origin}/win?success=true&entries=${ENTRIES_PER_PERSON}&email=${encodeURIComponent(email.trim().toLowerCase())}&name=${encodeURIComponent(firstName || "")}&donation=${dollars}`,
      cancel_url: `${origin}/win?canceled=true`,
      metadata: {
        raffle_entry_id: entry.id,
        tier: tier || "custom",
        entries_count: ENTRIES_PER_PERSON.toString(),
        email: email.trim().toLowerCase(),
        first_name: firstName || "",
        phone: phone || "",
        donation_amount_cents: amountCents.toString(),
      },
    });

    // Update entry with stripe session id
    await supabaseAdmin
      .from("raffle_entries")
      .update({ stripe_session_id: session.id })
      .eq("id", entry.id);

    console.log(`Raffle checkout created: ${entry.id}, donation: $${dollars}, session: ${session.id}`);

    // Server-side marketing sync (reliable; client-side fire-and-forget was being cancelled by Stripe redirect)
    syncMarketing(supabaseAdmin, { email: cleanEmail, firstName, phone });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating raffle checkout:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to create checkout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
