import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Look up the invite token
    const { data: invite, error: inviteError } = await supabaseClient
      .from("lodging_invite_tokens")
      .select("*, registrations(id, name, email, ticket_type, quantity)")
      .eq("token", token)
      .maybeSingle();

    if (inviteError) {
      console.error("[validate-lodging-invite] Error looking up token:", inviteError);
      return new Response(
        JSON.stringify({ valid: false, error: "Unable to validate invite" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!invite) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid or expired invite link" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if already used
    if (invite.used_at) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "This invite has already been used",
          message: "If you need to make changes to your lodging, please contact us."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "This invite has expired",
          message: "Please contact us to request a new invite."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check if user already has lodging
    const { data: existingLodging } = await supabaseClient
      .from("lodging_bookings")
      .select("id")
      .eq("registration_id", invite.registration_id)
      .eq("payment_status", "paid")
      .maybeSingle();

    if (existingLodging) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "You already have lodging booked",
          message: "You've already purchased lodging for this event."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const registration = invite.registrations;
    if (!registration) {
      return new Response(
        JSON.stringify({ valid: false, error: "No registration found for this invite" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Return validated info
    return new Response(
      JSON.stringify({
        valid: true,
        email: invite.email,
        name: registration.name,
        ticketType: registration.ticket_type,
        quantity: registration.quantity,
        registrationId: registration.id,
        tokenId: invite.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[validate-lodging-invite] Error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
