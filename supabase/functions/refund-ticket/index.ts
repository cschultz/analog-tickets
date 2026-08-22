import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  colors,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roles) {
      throw new Error('Admin access required');
    }

    const { ticketId, reason, amount } = await req.json();

    if (!ticketId) {
      throw new Error('Missing required field: ticketId');
    }

    // Fetch ticket and registration
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('tickets')
      .select('*, registrations(*)')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error('Ticket not found');
    }

    const registration = ticket.registrations;

    // Validate ticket can be refunded
    if (ticket.status === 'refunded') {
      throw new Error('Ticket has already been refunded');
    }

    if (ticket.status !== 'active') {
      throw new Error('Ticket cannot be refunded. Status must be active.');
    }

    if (registration.payment_status !== 'paid') {
      throw new Error('Cannot refund unpaid registration');
    }

    if (!registration.stripe_session_id) {
      throw new Error('No Stripe session ID found for this registration');
    }

    // Determine refund amount (use custom amount if provided, otherwise full ticket price)
    const refundAmount = amount ? Math.round(amount * 100) : ticket.unit_price;
    
    // Validate refund amount
    if (refundAmount <= 0) {
      throw new Error('Refund amount must be greater than 0');
    }
    
    if (refundAmount > ticket.unit_price) {
      throw new Error(`Refund amount cannot exceed ticket price ($${(ticket.unit_price / 100).toFixed(2)})`);
    }

    const isPartialRefund = refundAmount < ticket.unit_price;

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Get payment intent from session
    const session = await stripe.checkout.sessions.retrieve(registration.stripe_session_id);
    
    if (!session.payment_intent) {
      throw new Error('No payment intent found for this session');
    }

    const paymentIntentId = typeof session.payment_intent === 'string' 
      ? session.payment_intent 
      : session.payment_intent.id;

    // Create Stripe refund with idempotency key
    const idempotencyKey = `refund_ticket_${ticketId}_${Date.now()}`;
    const stripeRefund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: refundAmount,
        metadata: {
          registration_id: registration.id,
          ticket_id: ticketId,
          admin_id: user.id,
          reason: reason || '',
          partial_refund: isPartialRefund ? 'true' : 'false',
        },
      },
      {
        idempotencyKey,
      }
    );

    // Update ticket status (only mark as refunded if full refund)
    const newTicketStatus = isPartialRefund ? 'active' : 'refunded';
    const { error: updateError } = await supabaseClient
      .from('tickets')
      .update({
        status: newTicketStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId);

    if (updateError) {
      throw new Error(`Failed to update ticket: ${updateError.message}`);
    }

    // Create refund record
    const { error: refundError } = await supabaseClient
      .from('refunds')
      .insert({
        registration_id: registration.id,
        ticket_id: ticketId,
        stripe_refund_id: stripeRefund.id,
        amount: refundAmount,
        reason: reason || null,
        admin_id: user.id,
      });

    if (refundError) {
      console.error('Failed to create refund record:', refundError);
    }

    // Check total refunds for this registration and update registration status
    const { data: allRefunds } = await supabaseClient
      .from('refunds')
      .select('amount')
      .eq('registration_id', registration.id);

    const totalRefundedAmount = (allRefunds || []).reduce((sum, r) => sum + r.amount, 0);
    const registrationTotal = registration.total_amount;

    let newPaymentStatus = registration.payment_status;
    if (totalRefundedAmount >= registrationTotal) {
      newPaymentStatus = 'refunded';
      console.log(`Registration ${registration.id} fully refunded (${totalRefundedAmount} >= ${registrationTotal})`);
    } else if (totalRefundedAmount > 0) {
      newPaymentStatus = 'partially_refunded';
      console.log(`Registration ${registration.id} partially refunded (${totalRefundedAmount} of ${registrationTotal})`);
    }

    if (newPaymentStatus !== registration.payment_status) {
      const { error: statusUpdateError } = await supabaseClient
        .from('registrations')
        .update({ payment_status: newPaymentStatus })
        .eq('id', registration.id);
      
      if (statusUpdateError) {
        console.error('Failed to update registration payment_status:', statusUpdateError);
      } else {
        console.log(`Updated registration ${registration.id} payment_status to ${newPaymentStatus}`);
      }
    }

    // Fetch updated ticket
    const { data: updatedTicket } = await supabaseClient
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    // Fetch event details for email
    const { data: eventDetails } = await supabaseClient
      .from('event_details')
      .select('title, event_date')
      .eq('id', ticket.event_id)
      .single();

    // Fetch email signature settings
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Send refund notification email
    const recipientEmail = ticket.holder_email || registration.email;
    const recipientName = ticket.holder_name || registration.name;
    const recipientFirstName = getFirstName(recipientName);
    const refundAmountFormatted = (refundAmount / 100).toFixed(2);
    const refundTypeText = isPartialRefund ? 'Partial Refund' : 'Refund';
    const eventTitle = eventDetails?.title || 'Cosmico';
    
    if (recipientEmail) {
      try {
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
        
        await resend.emails.send({
          from: 'The Cosmico Team <hello@example.invalid>',
          to: [recipientEmail],
          subject: `Your Ticket Has Been ${isPartialRefund ? 'Partially ' : ''}Refunded`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: ${colors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${colors.background}; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="100%" style="max-width: 600px; background-color: ${colors.surface}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      <tr>
                        <td style="background: linear-gradient(135deg, ${colors.darkBg} 0%, #0C0C0F 100%); padding: 40px 30px; text-align: center;">
                          <h1 style="color: ${colors.accentGold}; margin: 0; font-size: 28px; font-weight: 600;">${escapeHtml(eventTitle)}</h1>
                          <p style="color: ${colors.accentBlue}; margin: 10px 0 0;">${refundTypeText} Confirmation</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Hi ${escapeHtml(recipientFirstName)},
                          </p>
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Your ticket ${isPartialRefund ? 'partial ' : ''}refund has been processed. Here are the details:
                          </p>
                          <table width="100%" style="background-color: ${colors.background}; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 10px 20px;">
                                <p style="color: #666; font-size: 14px; margin: 0;">Event</p>
                                <p style="color: ${colors.darkBg}; font-size: 16px; font-weight: 600; margin: 5px 0 0;">${escapeHtml(eventTitle)}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 20px;">
                                <p style="color: #666; font-size: 14px; margin: 0;">Ticket Type</p>
                                <p style="color: ${colors.darkBg}; font-size: 16px; font-weight: 600; margin: 5px 0 0;">${escapeHtml(ticket.ticket_type)}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 20px;">
                                <p style="color: #666; font-size: 14px; margin: 0;">Refund Amount</p>
                                <p style="color: ${colors.darkBg}; font-size: 16px; font-weight: 600; margin: 5px 0 0;">$${refundAmountFormatted}${isPartialRefund ? ' (partial)' : ''}</p>
                              </td>
                            </tr>
                            ${reason ? `
                            <tr>
                              <td style="padding: 10px 20px;">
                                <p style="color: #666; font-size: 14px; margin: 0;">Reason</p>
                                <p style="color: ${colors.darkBg}; font-size: 16px; margin: 5px 0 0;">${escapeHtml(reason)}</p>
                              </td>
                            </tr>
                            ` : ''}
                          </table>
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                            The refund will be credited to your original payment method within 5-10 business days, depending on your bank.
                          </p>
                          ${isPartialRefund ? `
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                            <strong>Note:</strong> Your ticket remains valid for the event.
                          </p>
                          ` : ''}
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 20px 0 0;">
                            If you have any questions, please don't hesitate to reach out to us.
                          </p>
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 30px 0 0;">
                            ${escapeHtml(signatureLine)}<br>${escapeHtml(signatureName)}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: ${colors.darkBg}; padding: 30px; text-align: center;">
                          <p style="color: ${colors.accentBlue}; font-size: 14px; margin: 0;">
                            © ${new Date().getFullYear()} Cosmico. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        });
        
        console.log('Refund notification email sent to:', recipientEmail);
      } catch (emailError) {
        console.error('Failed to send refund notification email:', emailError);
        // Don't fail the refund if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ticket: updatedTicket,
        refund: stripeRefund,
        isPartialRefund,
        message: `Ticket ${isPartialRefund ? 'partially ' : ''}refunded successfully`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Refund ticket error:', error);
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
