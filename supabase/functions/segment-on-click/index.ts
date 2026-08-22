import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Segment IDs for click-based audiences
const FLODESK_CLICKER_SEGMENT_ID = ''; // Will be set by user or created dynamically
const FLODESK_HIGH_INTENT_SEGMENT_NAME = 'Cosmico - Link Clickers';

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, action, source } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, any> = {};

    // --- Flodesk: Add to "Link Clickers" segment ---
    const flodeskApiKey = Deno.env.get("FLODESK_API_KEY");
    if (flodeskApiKey) {
      try {
        const authHeader = "Basic " + btoa(flodeskApiKey + ":");

        // Use the create/update subscriber endpoint with segment_ids
        // This adds them to the segment (or creates them if new)
        const flodeskBody: Record<string, unknown> = {
          email: email.toLowerCase().trim(),
        };

        // First, get or find the clicker segment
        // We'll use the subscribers endpoint with segment_ids to add them
        const segmentRes = await fetch("https://api.flodesk.com/v1/segments", {
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
        });

        let clickerSegmentId = "";
        if (segmentRes.ok) {
          const segData = await segmentRes.json();
          const segments = segData.data || segData || [];
          const existing = Array.isArray(segments)
            ? segments.find((s: any) => s.name === FLODESK_HIGH_INTENT_SEGMENT_NAME)
            : null;
          if (existing) {
            clickerSegmentId = existing.id;
          }
        }

        if (!clickerSegmentId) {
          // Create the segment
          const createRes = await fetch("https://api.flodesk.com/v1/segments", {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: FLODESK_HIGH_INTENT_SEGMENT_NAME }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            clickerSegmentId = created.id;
            console.log(`Created Flodesk segment: ${clickerSegmentId}`);
          } else {
            const errText = await createRes.text();
            console.error("Failed to create Flodesk segment:", errText);
          }
        }

        if (clickerSegmentId) {
          // Add subscriber to the clicker segment
          const addRes = await fetch("https://api.flodesk.com/v1/subscribers", {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: email.toLowerCase().trim(),
              segment_ids: [clickerSegmentId],
            }),
          });

          const addData = await addRes.text();
          results.flodesk = {
            success: addRes.ok,
            segment_id: clickerSegmentId,
            status: addRes.status,
          };
          console.log(`Flodesk segment add for ${email}: ${addRes.status}`);
        } else {
          results.flodesk = { success: false, error: "Could not find or create segment" };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error("Flodesk segment error:", msg);
        results.flodesk = { success: false, error: msg };
      }
    }

    // --- SimpleTexting: Add tag/group for clickers ---
    const stApiKey = Deno.env.get("SIMPLYTEXT_API_KEY");
    if (stApiKey) {
      try {
        // SimpleTexting doesn't have a direct "add to group by email" endpoint,
        // but we can add a contact to a group using their phone number.
        // For now, we'll log this for manual follow-up or future API enhancement.
        // The SimpleTexting API requires phone number for group operations.
        results.simpletexting = {
          success: true,
          note: "Click tracked in database. SimpleTexting group updates require phone number (not available from email click events).",
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.simpletexting = { success: false, error: msg };
      }
    }

    // --- Log the click event in our database for lead scoring ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Update newsletter_leads with click data
    const { error: updateError } = await supabase
      .from("newsletter_leads")
      .update({
        last_clicked_at: new Date().toISOString(),
        click_count: supabase.rpc ? undefined : 1, // Will use raw SQL increment below
      })
      .eq("email", email.toLowerCase().trim());

    // Increment click count with raw update
    await supabase.rpc("increment_lead_click_count", {
      p_email: email.toLowerCase().trim(),
    }).catch(() => {
      // RPC might not exist yet, that's OK - we still set last_clicked_at
      console.log("increment_lead_click_count RPC not available, skipping count increment");
    });

    if (updateError) {
      console.error("DB update error:", updateError);
    }

    // Also log as an intent signal
    await supabase.from("cart_intent_signals").upsert(
      {
        session_id: `email-click-${email}-${Date.now()}`,
        signal_type: "email_link_click",
        email: email.toLowerCase().trim(),
        created_at: new Date().toISOString(),
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        email,
        action: action || "link_click",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in segment-on-click:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
