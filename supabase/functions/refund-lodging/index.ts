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

    const { bookingId, reason, amount } = await req.json();

    if (!bookingId) {
      throw new Error('Missing required field: bookingId');
    }

    // Fetch lodging booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from('lodging_bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Lodging booking not found');
    }

    // Validate booking can be refunded
    if (booking.payment_status === 'refunded') {
      throw new Error('Booking has already been refunded');
    }

    if (booking.payment_status !== 'paid') {
      throw new Error('Cannot refund unpaid booking');
    }

    if (!booking.stripe_session_id) {
      throw new Error('No Stripe session ID found for this booking');
    }

    // Determine refund amount (use custom amount if provided, otherwise full booking price)
    const refundAmount = amount ? Math.round(amount * 100) : booking.total_amount;
    
    // Validate refund amount
    if (refundAmount <= 0) {
      throw new Error('Refund amount must be greater than 0');
    }
    
    if (refundAmount > booking.total_amount) {
      throw new Error(`Refund amount cannot exceed booking price ($${(booking.total_amount / 100).toFixed(2)})`);
    }

    const isPartialRefund = refundAmount < booking.total_amount;

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Get payment intent from session
    const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
    
    if (!session.payment_intent) {
      throw new Error('No payment intent found for this session');
    }

    const paymentIntentId = typeof session.payment_intent === 'string' 
      ? session.payment_intent 
      : session.payment_intent.id;

    // Create Stripe refund with idempotency key
    const idempotencyKey = `refund_lodging_${bookingId}_${Date.now()}`;
    const stripeRefund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: refundAmount,
        metadata: {
          lodging_booking_id: bookingId,
          admin_id: user.id,
          reason: reason || '',
          partial_refund: isPartialRefund ? 'true' : 'false',
        },
      },
      {
        idempotencyKey,
      }
    );

    // Update booking status (only mark as refunded if full refund)
    const newPaymentStatus = isPartialRefund ? 'partially_refunded' : 'refunded';
    const { error: updateError } = await supabaseClient
      .from('lodging_bookings')
      .update({
        payment_status: newPaymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      throw new Error(`Failed to update booking: ${updateError.message}`);
    }

    // If full refund, release inventory back
    if (!isPartialRefund) {
      // Release assigned unit back to available
      if (booking.assigned_unit_id) {
        await supabaseClient
          .from('accommodation_units')
          .update({ inventory_status: 'available' })
          .eq('id', booking.assigned_unit_id);
        console.log(`Released unit ${booking.assigned_unit_id} back to available`);
      }
      
      // Increment zone inventory count
      await supabaseClient.rpc('increment_zone_inventory', { 
        p_zone_key: booking.zone_key, 
        p_quantity: booking.quantity 
      });
      console.log(`Incremented zone ${booking.zone_key} inventory by ${booking.quantity}`);
    }

    // Create refund record (if refunds table supports lodging)
    const { error: refundError } = await supabaseClient
      .from('refunds')
      .insert({
        registration_id: booking.registration_id,
        lodging_booking_id: bookingId,
        stripe_refund_id: stripeRefund.id,
        amount: refundAmount,
        reason: reason || null,
        admin_id: user.id,
      });

    if (refundError) {
      console.error('Failed to create refund record:', refundError);
      // Continue even if refund record fails - the Stripe refund is processed
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabaseClient
      .from('lodging_bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    // Fetch event details for email
    const { data: eventDetails } = await supabaseClient
      .from('event_details')
      .select('title, event_date')
      .eq('id', booking.event_id)
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
    const recipientEmail = booking.email;
    const recipientFirstName = getFirstName(recipientEmail.split('@')[0]);
    const refundAmountFormatted = (refundAmount / 100).toFixed(2);
    const refundTypeText = isPartialRefund ? 'Partial Refund' : 'Refund';
    const eventTitle = eventDetails?.title || 'Cosmico';
    const zoneName = booking.zone_key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    
    if (recipientEmail) {
      try {
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
        
        await resend.emails.send({
          from: 'The Cosmico Team <hello@example.invalid>',
          to: [recipientEmail],
          subject: `Your Lodging Has Been ${isPartialRefund ? 'Partially ' : ''}Refunded`,
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
                          <p style="color: ${colors.accentBlue}; margin: 10px 0 0;">Lodging ${refundTypeText} Confirmation</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Hi ${escapeHtml(recipientFirstName)},
                          </p>
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Your lodging ${isPartialRefund ? 'partial ' : ''}refund has been processed. Here are the details:
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
                                <p style="color: #666; font-size: 14px; margin: 0;">Accommodation</p>
                                <p style="color: ${colors.darkBg}; font-size: 16px; font-weight: 600; margin: 5px 0 0;">${escapeHtml(zoneName)}</p>
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
        
        console.log('Lodging refund notification email sent to:', recipientEmail);
      } catch (emailError) {
        console.error('Failed to send lodging refund notification email:', emailError);
        // Don't fail the refund if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        booking: updatedBooking,
        refund: stripeRefund,
        isPartialRefund,
        message: `Lodging ${isPartialRefund ? 'partially ' : ''}refunded successfully`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Refund lodging error:', error);
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
