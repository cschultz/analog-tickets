import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompGuest {
  first_name: string;
  last_name?: string;
  email?: string;
  ticket_type: string;
  guest_of_name?: string;
  guest_of_type?: string;
  comp_type?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify admin via JWT
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { guests, event_id, send_email = true } = await req.json();

    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return new Response(JSON.stringify({ error: "At least one guest is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!event_id) {
      return new Response(JSON.stringify({ error: "Event ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side guard: refuse to issue tickets against any event that is not the
    // currently active + published event. Prevents stale client caches or multiple
    // active rows from misrouting comps to the wrong event.
    const { data: activeEvent, error: activeEventErr } = await supabase
      .from("event_details")
      .select("id, title, status, is_active")
      .eq("is_active", true)
      .eq("status", "published")
      .order("event_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeEventErr || !activeEvent) {
      return new Response(
        JSON.stringify({ error: "No active published event configured. Cannot issue comp tickets." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (activeEvent.id !== event_id) {
      return new Response(
        JSON.stringify({
          error: `Event mismatch: comp tickets can only be issued for the active published event ("${activeEvent.title}"). Refresh the page and try again.`,
          expected_event_id: activeEvent.id,
          received_event_id: event_id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate guests
    for (const guest of guests) {
      if (!guest.first_name?.trim()) {
        return new Response(JSON.stringify({ error: "All guests must have a first name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!guest.ticket_type?.trim()) {
        return new Response(JSON.stringify({ error: "All guests must have a ticket type" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Validate ticket types
    const uniqueTypes = [...new Set(guests.map((g: CompGuest) => g.ticket_type))];
    const { data: validTypes } = await supabase
      .from("ticket_inventory")
      .select("ticket_type")
      .in("ticket_type", uniqueTypes);

    const validTypeSet = new Set(validTypes?.map(t => t.ticket_type) || []);
    for (const type of uniqueTypes) {
      if (!validTypeSet.has(type)) {
        return new Response(JSON.stringify({ error: `Invalid ticket type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get admin profile
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    const results: { name: string; email?: string; registration_id: string; email_sent: boolean }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const guest of guests as CompGuest[]) {
      try {
        const fullName = `${guest.first_name} ${guest.last_name || ""}`.trim();
        const hasEmail = !!guest.email?.trim();
        const guestEmail = hasEmail
          ? guest.email!.trim()
          : `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@no-email.comp`;

        // Create zero-dollar registration
        const { data: registration, error: regError } = await supabase
          .from("registrations")
          .insert({
            name: fullName,
            email: guestEmail,
            ticket_type: guest.ticket_type,
            total_amount: 0,
            payment_status: "comp",
            event_id,
            quantity: 1,
            metadata: {
              is_comp: true,
              comp_source: "guest_list",
              comp_type: guest.comp_type || "Guest List",
              guest_of_name: guest.guest_of_name || null,
              guest_of_type: guest.guest_of_type || null,
              issued_by_admin_id: user.id,
              issued_by_admin_email: adminProfile?.email || user.email,
              comp_notes: guest.notes || null,
              has_email: hasEmail,
            },
          })
          .select()
          .single();

        if (regError) throw regError;

        // Create ticket record
        await supabase.from("tickets").insert({
          registration_id: registration.id,
          holder_name: fullName,
          holder_email: hasEmail ? guestEmail : null,
          ticket_type: guest.ticket_type,
          unit_price: 0,
          status: "active",
          event_id,
          owner_email: hasEmail ? guestEmail : null,
        });

        let emailSent = false;

        // Send ticket email only if guest has a real email
        if (hasEmail && send_email) {
          try {
            const emailRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-ticket-email`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                },
                body: JSON.stringify({ registrationId: registration.id }),
              }
            );
            emailSent = emailRes.ok;
            if (!emailSent) {
              console.error(`Failed to send comp ticket email for ${fullName}: ${emailRes.status}`);
            }
          } catch (emailErr) {
            console.error("Email send error:", emailErr);
          }
        }

        results.push({
          name: fullName,
          email: hasEmail ? guestEmail : undefined,
          registration_id: registration.id,
          email_sent: emailSent,
        });

        // Audit log
        await supabase.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          admin_email: adminProfile?.email || user.email,
          action: "issue_comp_ticket",
          entity_type: "registration",
          entity_id: registration.id,
          entity_name: fullName,
          new_value: {
            ticket_type: guest.ticket_type,
            comp_type: guest.comp_type,
            guest_of: guest.guest_of_name,
            email_sent: emailSent,
          },
        });
      } catch (guestError) {
        const guestName = `${guest.first_name} ${guest.last_name || ""}`.trim();
        console.error(`Error issuing comp for ${guestName}:`, guestError);
        errors.push({ name: guestName, error: (guestError as Error).message });
      }
    }

    // Increment comp_quantity per ticket type
    const compCounts: Record<string, number> = {};
    for (const r of results) {
      const guest = (guests as CompGuest[]).find(
        g => `${g.first_name} ${g.last_name || ""}`.trim() === r.name
      );
      if (guest) {
        compCounts[guest.ticket_type] = (compCounts[guest.ticket_type] || 0) + 1;
      }
    }

    for (const [ticketType, count] of Object.entries(compCounts)) {
      const { data: current } = await supabase
        .from("ticket_inventory")
        .select("comp_quantity")
        .eq("ticket_type", ticketType)
        .single();

      if (current) {
        await supabase
          .from("ticket_inventory")
          .update({ comp_quantity: (current.comp_quantity || 0) + count })
          .eq("ticket_type", ticketType);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        issued: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("issue-comp-ticket error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
