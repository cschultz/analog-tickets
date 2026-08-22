import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CONFIRM-TRANSFER] ${step}${detailsStr}`);
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

    const { token } = await req.json();

    if (!token) {
      throw new Error('Verification token is required');
    }

    logStep('Processing transfer confirmation', { token: token.substring(0, 8) + '...' });

    // Find the pending transfer
    const { data: pendingTransfer, error: fetchError } = await supabaseClient
      .from('pending_ticket_transfers')
      .select('*, tickets(id, holder_name, holder_email, transfer_count, original_purchaser_email, ticket_type, registrations(email))')
      .eq('verification_token', token)
      .is('completed_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (fetchError || !pendingTransfer) {
      logStep('Pending transfer not found or expired', { error: fetchError });
      throw new Error('This transfer link is invalid or has expired. Please ask the ticket holder to initiate a new transfer.');
    }

    const ticket = pendingTransfer.tickets;
    if (!ticket) {
      throw new Error('Associated ticket not found');
    }

    // Double-check ticket is still valid
    const { data: currentTicket } = await supabaseClient
      .from('tickets')
      .select('status, checked_in_at, transfer_count')
      .eq('id', pendingTransfer.ticket_id)
      .single();

    if (!currentTicket || currentTicket.status !== 'active') {
      throw new Error('This ticket is no longer available for transfer.');
    }

    if (currentTicket.checked_in_at) {
      throw new Error('This ticket has already been checked in and cannot be transferred.');
    }

    const originalPurchaserEmail = ticket.original_purchaser_email || ticket.registrations?.email;

    // Update the ticket with new holder info and transfer ownership
    const { error: updateError } = await supabaseClient
      .from('tickets')
      .update({
        holder_name: pendingTransfer.new_holder_name,
        holder_email: pendingTransfer.new_holder_email,
        owner_email: pendingTransfer.new_holder_email, // Transfer ownership to new holder
        transfer_count: currentTicket.transfer_count + 1,
        original_purchaser_email: originalPurchaserEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pendingTransfer.ticket_id);

    if (updateError) {
      logStep('Failed to update ticket', { error: updateError });
      throw new Error('Failed to complete transfer. Please try again or contact support.');
    }

    // Mark pending transfer as completed
    await supabaseClient
      .from('pending_ticket_transfers')
      .update({
        completed_at: new Date().toISOString(),
      })
      .eq('id', pendingTransfer.id);

    logStep('Transfer completed successfully', { 
      ticketId: pendingTransfer.ticket_id,
      newHolder: pendingTransfer.new_holder_name 
    });

    // Send confirmation email to new holder
    await sendTransferConfirmationEmail(supabaseClient, {
      toEmail: pendingTransfer.new_holder_email,
      toName: pendingTransfer.new_holder_name,
      ticketType: ticket.ticket_type,
    });

    // Notify original purchaser if different
    if (originalPurchaserEmail && 
        originalPurchaserEmail.toLowerCase() !== pendingTransfer.old_holder_email?.toLowerCase()) {
      await notifyOriginalPurchaser(supabaseClient, {
        originalPurchaserEmail,
        oldHolderName: pendingTransfer.old_holder_name,
        newHolderName: pendingTransfer.new_holder_name,
        ticketType: ticket.ticket_type,
      });
    }

    // Notify previous holder
    if (pendingTransfer.old_holder_email) {
      await notifyPreviousHolder(supabaseClient, {
        toEmail: pendingTransfer.old_holder_email,
        toName: pendingTransfer.old_holder_name || 'Ticket Holder',
        newHolderName: pendingTransfer.new_holder_name,
        ticketType: ticket.ticket_type,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Transfer confirmed! The ticket is now in your name.',
        newHolderName: pendingTransfer.new_holder_name,
        ticketType: ticket.ticket_type
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Confirm transfer error:', error);
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

async function sendTransferConfirmationEmail(supabase: any, data: {
  toEmail: string;
  toName: string;
  ticketType: string;
}) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;

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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">COSMICO</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">Transfer Complete!</h2>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                Hi ${data.toName},
              </p>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                Great news! The ticket transfer has been completed. You are now the holder of a <strong>${ticketTypeDisplay}</strong> ticket for Cosmico 2026.
              </p>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                Your official tickets will be emailed to you 7 days before the event. See you there!
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
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'The Cosmico Team <hello@example.invalid>',
        to: [data.toEmail],
        subject: 'Your ticket transfer is complete!',
        html: emailHtml,
      }),
    });
  } catch (error) {
    console.error('Error sending confirmation email:', error);
  }
}

async function notifyOriginalPurchaser(supabase: any, data: {
  originalPurchaserEmail: string;
  oldHolderName: string | null;
  newHolderName: string;
  ticketType: string;
}) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;

  const ticketTypeDisplay = data.ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; background-color: #faf9f6; font-family: Georgia, serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf9f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">COSMICO</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">Ticket Transfer Notification</h2>
              <p style="color: #4a4a4a; line-height: 1.6;">
                A ticket from your original purchase has been transferred:
              </p>
              <table style="background-color: #f5f5f0; padding: 20px; border-radius: 4px; margin: 20px 0; width: 100%;">
                <tr><td style="color: #4a4a4a; padding: 5px 0;"><strong>Ticket:</strong> ${ticketTypeDisplay}</td></tr>
                <tr><td style="color: #4a4a4a; padding: 5px 0;"><strong>From:</strong> ${data.oldHolderName || 'Original holder'}</td></tr>
                <tr><td style="color: #4a4a4a; padding: 5px 0;"><strong>To:</strong> ${data.newHolderName}</td></tr>
              </table>
              <p style="color: #888888; font-size: 14px;">
                If you did not authorize this, contact hello@example.invalid immediately.
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
    await fetch('https://api.resend.com/emails', {
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
  } catch (error) {
    console.error('Error notifying original purchaser:', error);
  }
}

async function notifyPreviousHolder(supabase: any, data: {
  toEmail: string;
  toName: string;
  newHolderName: string;
  ticketType: string;
}) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;

  const ticketTypeDisplay = data.ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; background-color: #faf9f6; font-family: Georgia, serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf9f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">COSMICO</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">Transfer Complete</h2>
              <p style="color: #4a4a4a; line-height: 1.6;">
                Hi ${data.toName},
              </p>
              <p style="color: #4a4a4a; line-height: 1.6;">
                Your ticket transfer is complete. Your <strong>${ticketTypeDisplay}</strong> ticket has been transferred to <strong>${data.newHolderName}</strong>.
              </p>
              <p style="color: #888888; font-size: 14px;">
                If you did not authorize this, contact hello@example.invalid immediately.
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
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'The Cosmico Team <hello@example.invalid>',
        to: [data.toEmail],
        subject: 'Your ticket transfer is complete',
        html: emailHtml,
      }),
    });
  } catch (error) {
    console.error('Error notifying previous holder:', error);
  }
}
