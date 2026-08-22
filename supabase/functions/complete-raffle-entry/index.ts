import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Server-side marketing sync. Invokes sync-flodesk and (optionally) sync-simpletexting
 * via the supabase admin client. We don't await — but unlike the browser, the edge
 * runtime keeps these promises alive after the response is sent.
 */
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
      .catch((e) => console.error("[complete-raffle-entry] sync-flodesk failed:", e));

    if (phone) {
      supabase.functions
        .invoke("sync-simpletexting", {
          body: { phone, email, firstName: firstName || undefined, listName: "Cosmico Full List" },
        })
        .catch((e) => console.error("[complete-raffle-entry] sync-simpletexting failed:", e));
    }
  } catch (e) {
    console.error("[complete-raffle-entry] syncMarketing error:", e);
  }
}

/**
 * Promotes a partial raffle entry (created at hero email capture) to a
 * confirmed free entry, OR inserts a fresh free entry when no partial exists.
 *
 * Anon clients cannot SELECT/UPDATE raffle_entries (RLS), so the page calls
 * this function with the service role to deduplicate by email.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName, phone } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Look for the most recent partial entry for this email and promote it.
    const { data: partial } = await supabase
      .from("raffle_entries")
      .select("id")
      .eq("email", cleanEmail)
      .eq("payment_status", "partial")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (partial) {
      const { error } = await supabase
        .from("raffle_entries")
        .update({
          first_name: firstName || null,
          last_name: lastName || null,
          phone: phone || null,
          payment_status: "free",
        })
        .eq("id", partial.id);
      if (error) throw error;
      syncMarketing(supabase, { email: cleanEmail, firstName, phone });
      return new Response(
        JSON.stringify({ status: "promoted", id: partial.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No partial — also avoid duplicate if a free entry already exists.
    const { data: existingFree } = await supabase
      .from("raffle_entries")
      .select("id")
      .eq("email", cleanEmail)
      .in("payment_status", ["free", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingFree) {
      // Already entered — just update contact info if provided.
      await supabase
        .from("raffle_entries")
        .update({
          first_name: firstName || null,
          last_name: lastName || null,
          phone: phone || null,
        })
        .eq("id", existingFree.id);
      syncMarketing(supabase, { email: cleanEmail, firstName, phone });
      return new Response(
        JSON.stringify({ status: "already_entered", id: existingFree.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("raffle_entries")
      .insert({
        email: cleanEmail,
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        tier: "free",
        entries_count: 1,
        donation_amount: 0,
        payment_status: "free",
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Server-side marketing sync (fire-and-forget but reliable from edge runtime)
    syncMarketing(supabase, { email: cleanEmail, firstName, phone });

    return new Response(
      JSON.stringify({ status: "inserted", id: inserted.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[complete-raffle-entry] error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
