import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (message: string, data?: any) => {
  console.log(`[assign-ticket] ${message}`, data ? JSON.stringify(data) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, holderName, holderEmail, verifiedEmail } = await req.json();
    log("Assign request received", { ticketId, holderName, holderEmail, verifiedEmail });

    // Validate inputs
    if (!ticketId || typeof ticketId !== "string") {
      throw new Error("Ticket ID is required");
    }

    if (!holderName || typeof holderName !== "string" || holderName.trim().length === 0) {
      throw new Error("Holder name is required");
    }

    if (holderName.trim().length > 100) {
      throw new Error("Name must be less than 100 characters");
    }

    if (!verifiedEmail || typeof verifiedEmail !== "string") {
      throw new Error("Verified email is required");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the ticket with registration info
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("tickets")
      .select("*, registrations!inner(email)")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      log("Ticket fetch error", ticketError);
      throw new Error("Ticket not found");
    }

    log("Ticket found", { ticketId, ownerEmail: ticket.owner_email, registrationEmail: ticket.registrations?.email });

    // Verify the user owns this ticket
    // Check both owner_email (new field) and registration email (fallback for older tickets)
    const ownerEmail = ticket.owner_email?.toLowerCase() || ticket.registrations?.email?.toLowerCase();
    if (ownerEmail !== verifiedEmail.toLowerCase()) {
      log("Ownership mismatch", { ownerEmail, verifiedEmail });
      throw new Error("You don't have permission to assign this ticket");
    }

    // Check if ticket has already been checked in
    if (ticket.checked_in_at) {
      throw new Error("Cannot assign a ticket that has already been checked in");
    }

    // Check for duplicate names within the same registration (excluding current ticket)
    const { data: existingTickets, error: duplicateError } = await supabaseClient
      .from("tickets")
      .select("id, holder_name")
      .eq("registration_id", ticket.registration_id)
      .neq("id", ticketId);

    if (duplicateError) {
      log("Duplicate check error", duplicateError);
      throw new Error("Failed to check for duplicate names");
    }

    const normalizedNewName = holderName.trim().toLowerCase();
    const duplicateTicket = existingTickets?.find(
      (t) => t.holder_name.toLowerCase() === normalizedNewName
    );

    if (duplicateTicket) {
      throw new Error("A ticket with this name already exists in your order. Please use a different name.");
    }

    // Update the ticket holder info (NOT owner_email - that stays the same for assign)
    const updateData: any = {
      holder_name: holderName.trim(),
      updated_at: new Date().toISOString(),
    };

    // Optionally update holder_email if provided
    if (holderEmail && typeof holderEmail === "string") {
      updateData.holder_email = holderEmail.trim().toLowerCase();
    }

    const { error: updateError } = await supabaseClient
      .from("tickets")
      .update(updateData)
      .eq("id", ticketId);

    if (updateError) {
      log("Update error", updateError);
      throw new Error("Failed to assign ticket");
    }

    log(`Ticket ${ticketId} assigned to "${holderName.trim()}" by owner ${verifiedEmail}`);

    // If the assignee was given their own email, notify them with their QR + a
    // /my-tickets magic link so they can self-serve check-in and add to wallet.
    const assigneeEmail = holderEmail?.trim().toLowerCase();
    if (assigneeEmail && assigneeEmail !== verifiedEmail.toLowerCase()) {
      try {
        await sendAssigneeNotification({
          toEmail: assigneeEmail,
          toName: holderName.trim(),
          fromName: ticket.holder_name || "A friend",
          ticketId,
          ticketType: ticket.ticket_type,
          purchaserEmail: verifiedEmail.toLowerCase(),
        });
        log("Assignee notification sent", { ticketId, assigneeEmail });
      } catch (notifyErr: any) {
        // Don't fail the assignment if email fails — just log.
        log("Assignee notification failed", notifyErr?.message || notifyErr);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Ticket assigned successfully",
        holderName: holderName.trim(),
        holderEmail: assigneeEmail || null,
        notified: !!assigneeEmail,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    log("Error in assign-ticket", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

const TICKET_NAMES: Record<string, string> = {
  tier_1_krewe_3day: "Krewe — 3 Day Pass",
  tier_1_vip_3day: "VIP — 3 Day Pass",
  tier_1_ga_2day: "GA — 2 Day Pass",
  tier_1_ga_friday: "GA — Friday",
  tier_1_ga_saturday: "GA — Saturday",
  early_bird_krewe_3day: "Krewe — 3 Day Pass",
  early_bird_vip_3day: "VIP — 3 Day Pass",
  early_bird_ga_2day: "GA — 2 Day Pass",
  youth_2day: "Youth — 2 Day Pass",
  youth_saturday: "Youth — Saturday",
  child_free: "Child (0–12)",
  patrons_premier: "Premier Patron",
  patrons_ultimate: "Ultimate Patron",
  artist_guest: "Artist Guest",
};

function ticketDateRange(ticketType: string): string {
  if (ticketType === "tier_1_ga_saturday" || ticketType === "youth_saturday") return "Saturday, May 16, 2026";
  if (ticketType === "tier_1_ga_friday") return "Friday, May 15, 2026";
  if (
    ticketType === "ga_2day" || ticketType === "tier_1_ga_2day" ||
    ticketType === "early_bird_ga_2day" || ticketType === "youth_2day" || ticketType === "child_free"
  ) return "Fri, May 15 – Sat, May 16, 2026";
  return "Fri, May 15 – Sun, May 17, 2026";
}

async function sendAssigneeNotification(args: {
  toEmail: string;
  toName: string;
  fromName: string;
  ticketId: string;
  ticketType: string;
  purchaserEmail: string;
}) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    log("RESEND_API_KEY not configured");
    return;
  }

  const ticketLabel = TICKET_NAMES[args.ticketType] || args.ticketType;
  const validWhen = ticketDateRange(args.ticketType);
  const myTicketsUrl = "https://example.invalid/my-tickets";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Cosmico ticket</title></head>
<body style="margin:0;padding:0;background:#f5f0e4;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f0e4;">
    <tr><td align="center" style="padding:48px 20px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#faf6ec;border:1px solid #d9d2c2;">
        <tr><td style="padding:36px 36px 8px 36px;">
          <p style="margin:0 0 6px 0;color:#6b6256;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Cosmico · May 15–17, 2026</p>
          <h1 style="margin:0 0 18px 0;color:#1a1a1a;font-size:26px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;line-height:1.3;">You've been given a ticket, ${args.toName.split(/\s+/)[0]}.</h1>
          <p style="margin:0 0 14px 0;color:#4a4338;font-size:15px;line-height:1.6;">
            <strong>${args.fromName}</strong> assigned you a <strong>${ticketLabel}</strong> for Cosmico at Wildhaven Sonoma.
          </p>
          <p style="margin:0 0 24px 0;color:#4a4338;font-size:14px;line-height:1.6;font-family:Georgia,serif;font-style:italic;">
            Valid ${validWhen}.
          </p>
        </td></tr>

        <tr><td style="padding:0 36px 28px 36px;">
          <div style="background:#1a1a1a;color:#f5f0e4;padding:14px 18px;margin:0 0 18px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">
            Your QR code lives here
          </div>
          <p style="margin:0 0 18px 0;color:#4a4338;font-size:14px;line-height:1.6;">
            Sign in to <strong>My Tickets</strong> with this email address (<strong>${args.toEmail}</strong>) and your last name. You'll find your QR code, the option to add it to Apple Wallet, and full event info.
          </p>
          <p style="margin:0 0 22px 0;">
            <a href="${myTicketsUrl}" style="display:inline-block;background:#1a1a1a;color:#f5f0e4;text-decoration:none;padding:14px 26px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Open My Tickets</a>
          </p>
          <p style="margin:0 0 6px 0;color:#6b6256;font-size:12px;line-height:1.6;">
            Your full QR code with scan instructions will also be emailed to you 7 days before the festival. No app required — a screenshot works at the gate.
          </p>
        </td></tr>

        <tr><td style="padding:0 36px 36px 36px;border-top:1px solid #d9d2c2;">
          <p style="margin:18px 0 6px 0;color:#6b6256;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">A note on transfers</p>
          <p style="margin:0 0 6px 0;color:#6b6256;font-size:12px;line-height:1.6;">
            This ticket was <em>assigned</em> to you by ${args.fromName} (${args.purchaserEmail}). They remain the original purchaser. If you can't make it, ask them to reassign or transfer it.
          </p>
        </td></tr>

        <tr><td style="padding:20px 36px;background:#1a1a1a;color:#9c9485;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:0.14em;">Cosmico · Wildhaven Sonoma · May 15–17, 2026</p>
          <p style="margin:8px 0 0 0;font-size:11px;"><a href="mailto:hello@example.invalid" style="color:#d9d2c2;text-decoration:underline;">hello@example.invalid</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [args.toEmail],
      reply_to: args.purchaserEmail,
      subject: `${args.fromName} gave you an Cosmico ticket`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error: ${res.status} ${text}`);
  }
}
