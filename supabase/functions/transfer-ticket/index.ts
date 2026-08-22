import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TRANSFERS = 2;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TRANSFER-TICKET] ${step}${detailsStr}`);
};

// Check if ticket type is a 2-day GA pass (only Friday & Saturday)
const isGa2DayTicket = (ticketType: string): boolean => {
  return ticketType === 'ga_2day' || ticketType === 'tier_1_ga_2day';
};

// Get the appropriate date display based on ticket type
const getEventDateDisplay = (ticketType: string): string => {
  if (isGa2DayTicket(ticketType)) {
    return 'May 15-16';
  }
  return 'May 15-17';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { ticketId, newHolderName, newHolderEmail, verifiedEmail, otpId } = await req.json();

    if (!ticketId || !newHolderName || !newHolderEmail) {
      throw new Error('Missing required fields: ticketId, newHolderName, newHolderEmail');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newHolderEmail)) {
      throw new Error('Invalid email format for new holder');
    }

    logStep('Processing transfer request', { ticketId, newHolderName, newHolderEmail: newHolderEmail.substring(0, 3) + '***' });

    // Check for auth header (logged in user)
    let isAdmin = false;
    let userId: string | null = null;
    let userEmail: string | null = null;

    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseClient.auth.getUser(token);
      
      if (user) {
        userId = user.id;
        userEmail = user.email || null;
        
        // Check if user is admin
        const { data: roles } = await supabaseClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        isAdmin = !!roles;
        logStep('User authenticated', { userId, isAdmin });
      }
    }

    // For self-service, use verifiedEmail from order lookup flow
    const ownershipEmail = userEmail || verifiedEmail;

    if (!isAdmin && !ownershipEmail) {
      throw new Error('Authentication required. Please log in or verify your email.');
    }

    // Fetch ticket with registration info
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('tickets')
      .select('*, registrations(email, name)')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      logStep('Ticket not found', { error: ticketError });
      throw new Error('Ticket not found');
    }

    // Validate ticket can be transferred
    if (ticket.status !== 'active') {
      throw new Error('Ticket cannot be transferred. Status must be active.');
    }

    if (ticket.checked_in_at) {
      throw new Error('Ticket cannot be transferred. It has already been checked in.');
    }

    // Gifted/comp tickets ($0) are non-transferable
    if (ticket.is_transferable === false) {
      throw new Error('This ticket is non-transferable. Complimentary and gifted tickets cannot be transferred.');
    }

    // Check transfer limit (unless admin)
    if (!isAdmin && ticket.transfer_count >= MAX_TRANSFERS) {
      throw new Error(`Ticket has reached maximum transfer limit of ${MAX_TRANSFERS}. Contact support for assistance.`);
    }

    // For non-admins, verify ownership using owner_email (or fallback to holder_email/registration email)
    const ticketOwnerEmail = ticket.owner_email || ticket.holder_email || ticket.registrations?.email;
    if (!isAdmin) {
      if (!ticketOwnerEmail || ticketOwnerEmail.toLowerCase() !== ownershipEmail.toLowerCase()) {
        logStep('Unauthorized transfer attempt', { 
          ticketOwner: ticketOwnerEmail?.substring(0, 3) + '***', 
          requester: ownershipEmail?.substring(0, 3) + '***' 
        });
        throw new Error('You can only transfer tickets that belong to you.');
      }
      logStep('Ownership verified', { email: ownershipEmail?.substring(0, 3) + '***' });
    }

    // Check if there's already a pending transfer for this ticket
    const { data: existingPending } = await supabaseClient
      .from('pending_ticket_transfers')
      .select('id')
      .eq('ticket_id', ticketId)
      .is('completed_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingPending) {
      throw new Error('There is already a pending transfer for this ticket. Please wait for it to expire or cancel it first.');
    }

    // For non-admin self-service transfers, require OTP verification
    if (!isAdmin) {
      if (!otpId) {
        throw new Error('Identity verification required. Please verify your identity with a one-time code before transferring.');
      }

      // Validate the OTP was verified
      const { data: otpRecord, error: otpError } = await supabaseClient
        .from('transfer_otp_codes')
        .select('*')
        .eq('id', otpId)
        .eq('ticket_id', ticketId)
        .eq('initiated_by_email', ownershipEmail.toLowerCase())
        .not('verified_at', 'is', null)
        .maybeSingle();

      if (otpError || !otpRecord) {
        logStep('OTP verification not found', { otpId });
        throw new Error('Identity verification failed. Please verify your identity again.');
      }

      // Check OTP was verified within the last 15 minutes (session window)
      const verifiedAt = new Date(otpRecord.verified_at);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      if (verifiedAt < fifteenMinutesAgo) {
        throw new Error('Your verification has expired. Please verify your identity again.');
      }

      logStep('OTP verification confirmed', { otpId });
    }

    // Generate verification token
    const verificationToken = crypto.randomUUID().replace(/-/g, '');

    // Store old holder info for notification
    const oldHolderName = ticket.holder_name;
    const oldHolderEmail = ticket.holder_email;
    const originalPurchaserEmail = ticket.original_purchaser_email || ticket.registrations?.email;

    // Both admin AND self-service transfers complete immediately.
    // Self-service requires OTP (verified above); admin is implicitly trusted.
    // Senders get a 30-min undo link in their confirmation email.
    const newEmailNorm = newHolderEmail.trim().toLowerCase();
    const newNameTrim = newHolderName.trim();
    const transferMethod = isAdmin ? 'admin' : 'self_service';

    const { error: updateError } = await supabaseClient
      .from('tickets')
      .update({
        holder_name: newNameTrim,
        holder_email: newEmailNorm,
        owner_email: newEmailNorm, // Transfer ownership so /my-tickets RLS lets new holder in
        transfer_count: ticket.transfer_count + 1,
        original_purchaser_email: originalPurchaserEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId);

    if (updateError) {
      logStep('Failed to update ticket', { error: updateError });
      throw new Error(`Failed to update ticket: ${updateError.message}`);
    }

    // Generate undo token (30 min window) for self-service so sender can reverse a typo/mistake
    const undoToken = !isAdmin ? crypto.randomUUID().replace(/-/g, '') : null;
    const undoExpiresAt = !isAdmin ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;

    const { data: transferRow } = await supabaseClient
      .from('ticket_transfers')
      .insert({
        ticket_id: ticketId,
        old_holder_name: oldHolderName,
        old_holder_email: oldHolderEmail,
        new_holder_name: newNameTrim,
        new_holder_email: newEmailNorm,
        admin_id: userId, // null for self-service (column is now nullable)
        transfer_method: transferMethod,
        undo_token: undoToken,
        undo_expires_at: undoExpiresAt,
      })
      .select('id')
      .single();

    const siteUrl = Deno.env.get('SITE_URL') || 'https://example.invalid';
    const myTicketsUrl = `${siteUrl}/my-tickets`;

    // Notify recipient — full handoff with /my-tickets link (QR appears 7 days out per existing logic)
    await sendRecipientNotification(supabaseClient, {
      toEmail: newEmailNorm,
      toName: newNameTrim,
      fromName: oldHolderName || 'A ticket holder',
      ticketType: ticket.ticket_type,
      myTicketsUrl,
    });

    // For self-service, send sender a confirmation with undo link
    if (!isAdmin && undoToken && oldHolderEmail) {
      const undoLink = `${siteUrl}/undo-transfer?token=${undoToken}`;
      await sendSenderConfirmation(supabaseClient, {
        toEmail: oldHolderEmail,
        toName: oldHolderName || 'there',
        recipientName: newNameTrim,
        recipientEmail: newEmailNorm,
        ticketType: ticket.ticket_type,
        undoLink,
      });
    }

    // Notify original purchaser if different from current holder
    if (originalPurchaserEmail && originalPurchaserEmail.toLowerCase() !== oldHolderEmail?.toLowerCase()) {
      await notifyOriginalPurchaser(supabaseClient, {
        originalPurchaserEmail,
        oldHolderName,
        newHolderName: newNameTrim,
        ticketType: ticket.ticket_type,
      });
    }

    logStep('Transfer completed', { transferMethod, transferId: transferRow?.id });

    const { data: updatedTicket } = await supabaseClient
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        ticket: updatedTicket,
        message: `Ticket transferred to ${newNameTrim}. They can manage it at ${myTicketsUrl}.`,
        requiresVerification: false,
        transferMethod,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Transfer ticket error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function sendRecipientNotification(_supabase: any, data: {
  toEmail: string;
  toName: string;
  fromName: string;
  ticketType: string;
  myTicketsUrl: string;
}) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;

  const ticketTypeDisplay = data.ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const eventDateDisplay = getEventDateDisplay(data.ticketType);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#faf9f6;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;padding:40px 20px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#1a1a1a;padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px;font-weight:normal;">COSMICO</h1></td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#1a1a1a;margin:0 0 20px;font-size:22px;font-weight:normal;">Your ticket is ready, ${data.toName}</h2>
        <p style="color:#4a4a4a;line-height:1.6;margin:0 0 20px;"><strong>${data.fromName}</strong> just transferred a <strong>${ticketTypeDisplay}</strong> ticket to you for Cosmico.</p>
        <p style="color:#4a4a4a;line-height:1.6;margin:0 0 30px;">It's already in your name. View your ticket and add it to your wallet here:</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px;"><tr><td style="background:#1a1a1a;border-radius:4px;">
          <a href="${data.myTicketsUrl}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;letter-spacing:1px;">VIEW MY TICKET</a>
        </td></tr></table>
        <p style="color:#888;font-size:14px;line-height:1.6;margin:0;">Use the email this was sent to when you sign in. Your QR code is released 7 days before the event.</p>
      </td></tr>
      <tr><td style="background:#f5f5f0;padding:20px;text-align:center;"><p style="color:#888;font-size:12px;margin:0;">Cosmico · ${eventDateDisplay} · Wildhaven Sonoma</p></td></tr>
    </table></td></tr></table></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'The Cosmico Team <hello@example.invalid>',
        reply_to: 'hello@example.invalid',
        to: [data.toEmail],
        subject: `${data.fromName} transferred a ticket to you`,
        html,
      }),
    });
    if (!res.ok) console.error('Recipient notify failed:', await res.text());
  } catch (e) {
    console.error('Recipient notify error:', e);
  }
}

async function sendSenderConfirmation(_supabase: any, data: {
  toEmail: string;
  toName: string;
  recipientName: string;
  recipientEmail: string;
  ticketType: string;
  undoLink: string;
}) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;

  const ticketTypeDisplay = data.ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#faf9f6;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;padding:40px 20px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#1a1a1a;padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px;font-weight:normal;">COSMICO</h1></td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#1a1a1a;margin:0 0 20px;font-size:22px;font-weight:normal;">Transfer complete</h2>
        <p style="color:#4a4a4a;line-height:1.6;margin:0 0 20px;">Hi ${data.toName}, your <strong>${ticketTypeDisplay}</strong> ticket has been transferred to:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;border-radius:4px;margin:0 0 20px;"><tr><td style="padding:20px;">
          <p style="color:#4a4a4a;margin:0 0 6px;"><strong>${data.recipientName}</strong></p>
          <p style="color:#888;margin:0;font-size:14px;">${data.recipientEmail}</p>
        </td></tr></table>
        <p style="color:#4a4a4a;line-height:1.6;margin:0 0 20px;">Wrong recipient? You have <strong>30 minutes</strong> to undo this transfer:</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td style="border:1px solid #1a1a1a;border-radius:4px;">
          <a href="${data.undoLink}" style="display:inline-block;padding:12px 28px;color:#1a1a1a;text-decoration:none;font-size:14px;letter-spacing:1px;">UNDO TRANSFER</a>
        </td></tr></table>
        <p style="color:#888;font-size:14px;line-height:1.6;margin:0;">After 30 minutes, contact hello@example.invalid for help.</p>
      </td></tr>
    </table></td></tr></table></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'The Cosmico Team <hello@example.invalid>',
        reply_to: 'hello@example.invalid',
        to: [data.toEmail],
        subject: `Ticket transferred to ${data.recipientName}`,
        html,
      }),
    });
    if (!res.ok) console.error('Sender confirm failed:', await res.text());
  } catch (e) {
    console.error('Sender confirm error:', e);
  }
}

async function notifyOriginalPurchaser(supabase: any, data: {
  originalPurchaserEmail: string;
  oldHolderName: string | null;
  newHolderName: string;
  ticketType: string;
}) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return;
  }

  const ticketTypeDisplay = data.ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const eventDateDisplay = getEventDateDisplay(data.ticketType);

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #faf9f6; font-family: Georgia, serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf9f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <tr>
            <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: normal; letter-spacing: 2px;">COSMICO</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px; font-weight: normal;">Ticket Transfer Notification</h2>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                Hello,
              </p>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                This is a notification that a ticket from your original purchase has been transferred.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f0; border-radius: 4px; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="color: #4a4a4a; margin: 0 0 10px 0;"><strong>Ticket Type:</strong> ${ticketTypeDisplay}</p>
                    <p style="color: #4a4a4a; margin: 0 0 10px 0;"><strong>Previous Holder:</strong> ${data.oldHolderName || 'Original purchaser'}</p>
                    <p style="color: #4a4a4a; margin: 0;"><strong>Transferred To:</strong> ${data.newHolderName}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                If you did not authorize this transfer, please contact us immediately at hello@example.invalid.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f0; padding: 20px; text-align: center;">
              <p style="color: #888888; font-size: 12px; margin: 0;">
                Cosmico 2026 · ${eventDateDisplay} · Wildhaven Sonoma
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'The Cosmico Team <hello@example.invalid>',
        to: [data.originalPurchaserEmail],
        subject: 'A ticket from your purchase has been transferred',
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      console.error('Failed to send notification email:', await res.text());
    } else {
      console.log('Original purchaser notified:', data.originalPurchaserEmail);
    }
  } catch (error) {
    console.error('Error sending notification email:', error);
  }
}
