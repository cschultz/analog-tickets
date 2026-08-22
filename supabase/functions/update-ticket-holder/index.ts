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
    const { ticketId, newName, verifiedEmail } = await req.json();

    // Validate inputs
    if (!ticketId || typeof ticketId !== "string") {
      throw new Error("Ticket ID is required");
    }

    if (!newName || typeof newName !== "string" || newName.trim().length === 0) {
      throw new Error("New name is required");
    }

    if (newName.trim().length > 100) {
      throw new Error("Name must be less than 100 characters");
    }

    if (!verifiedEmail || typeof verifiedEmail !== "string") {
      throw new Error("Verified email is required");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the ticket and verify ownership
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("tickets")
      .select("*, registrations!inner(email)")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket fetch error:", ticketError);
      throw new Error("Ticket not found");
    }

    // Verify the user owns this ticket
    // Prefer owner_email for transferred/managed tickets, then fall back to holder/registration email.
    const normalizedVerifiedEmail = verifiedEmail.toLowerCase().trim();
    const ownerEmail = (
      ticket.owner_email ||
      ticket.holder_email ||
      ticket.registrations?.email ||
      ""
    )
      .toLowerCase()
      .trim();

    if (!ownerEmail || ownerEmail !== normalizedVerifiedEmail) {
      console.error("Email mismatch:", { ownerEmail, verifiedEmail: normalizedVerifiedEmail });
      throw new Error("You don't have permission to update this ticket");
    }

    // Check if ticket has already been checked in
    if (ticket.checked_in_at) {
      throw new Error("Cannot update a ticket that has already been checked in");
    }

    // Check for duplicate names within the same registration
    const { data: existingTickets, error: duplicateError } = await supabaseClient
      .from("tickets")
      .select("id, holder_name")
      .eq("registration_id", ticket.registration_id)
      .neq("id", ticketId);

    if (duplicateError) {
      console.error("Duplicate check error:", duplicateError);
      throw new Error("Failed to check for duplicate names");
    }

    const normalizedNewName = newName.trim().toLowerCase();
    const duplicateTicket = existingTickets?.find(
      (t) => t.holder_name?.toLowerCase() === normalizedNewName
    );

    if (duplicateTicket) {
      throw new Error("A ticket with this name already exists in your order. Please use a different name.");
    }

    // Update the ticket holder name
    const { error: updateError } = await supabaseClient
      .from("tickets")
      .update({
        holder_name: newName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to update ticket holder name");
    }

    console.log(`Ticket ${ticketId} holder name updated to "${newName.trim()}" by ${verifiedEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Ticket holder name updated successfully" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in update-ticket-holder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
