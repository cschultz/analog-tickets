import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-TRANSFER-OTP] ${step}${detailsStr}`);
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

    const { ticketId, verifiedEmail } = await req.json();

    if (!ticketId || !verifiedEmail) {
      throw new Error('Missing required fields: ticketId, verifiedEmail');
    }

    logStep('OTP request received', { ticketId, email: verifiedEmail.substring(0, 3) + '***' });

    // Fetch the ticket with registration info to get phone number
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('tickets')
      .select('*, registrations(email, name, phone)')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error('Ticket not found');
    }

    // Gifted/comp tickets ($0) are non-transferable
    if (ticket.is_transferable === false) {
      throw new Error('This ticket is non-transferable. Complimentary and gifted tickets cannot be transferred.');
    }

    // Verify ownership
    const ticketOwnerEmail = ticket.owner_email || ticket.holder_email || ticket.registrations?.email;
    if (!ticketOwnerEmail || ticketOwnerEmail.toLowerCase() !== verifiedEmail.toLowerCase()) {
      throw new Error('You can only transfer tickets that belong to you.');
    }

    // Rate limit: max 5 OTP requests per ticket per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentOtps } = await supabaseClient
      .from('transfer_otp_codes')
      .select('id')
      .eq('ticket_id', ticketId)
      .gte('created_at', oneHourAgo);

    if (recentOtps && recentOtps.length >= 5) {
      throw new Error('Too many verification code requests. Please try again later.');
    }

    // Generate 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));

    // Determine delivery method: SMS if phone on file, otherwise email
    const phoneOnFile = ticket.registrations?.phone;
    const hasValidPhone = phoneOnFile && phoneOnFile.replace(/[^0-9]/g, '').length >= 10;
    const method = hasValidPhone ? 'sms' : 'email';
    const sentTo = hasValidPhone ? phoneOnFile : verifiedEmail;

    // Store OTP
    const { error: insertError } = await supabaseClient
      .from('transfer_otp_codes')
      .insert({
        ticket_id: ticketId,
        initiated_by_email: verifiedEmail.toLowerCase(),
        code: otpCode,
        method,
        sent_to: sentTo,
      });

    if (insertError) {
      logStep('Failed to store OTP', { error: insertError });
      throw new Error('Failed to generate verification code. Please try again.');
    }

    // Send the OTP
    if (method === 'sms') {
      await sendOtpViaSms(otpCode, phoneOnFile);
      logStep('OTP sent via SMS', { phone: phoneOnFile.substring(0, 3) + '***' });
    } else {
      await sendOtpViaEmail(otpCode, verifiedEmail, ticket.holder_name || 'there');
      logStep('OTP sent via email', { email: verifiedEmail.substring(0, 3) + '***' });
    }

    // Mask the delivery destination for the response
    let maskedDestination: string;
    if (method === 'sms') {
      const digits = phoneOnFile.replace(/[^0-9]/g, '');
      maskedDestination = '***' + digits.slice(-4);
    } else {
      const [local, domain] = verifiedEmail.split('@');
      maskedDestination = local.substring(0, 2) + '***@' + domain;
    }

    return new Response(
      JSON.stringify({
        success: true,
        method,
        maskedDestination,
        message: method === 'sms' 
          ? `A 6-digit code has been sent to ${maskedDestination}`
          : `A 6-digit code has been sent to ${maskedDestination}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Send transfer OTP error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendOtpViaSms(code: string, phone: string) {
  const simplyTextKey = Deno.env.get('SIMPLYTEXT_API_KEY');
  if (!simplyTextKey) {
    console.error('SIMPLYTEXT_API_KEY not configured, falling back to email');
    return false;
  }

  const message = `Your Cosmico ticket transfer verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share this code with anyone.\n\nIf you did not request this, please ignore this message.`;

  const response = await fetch('https://api-app2.simpletexting.com/v2/api/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${simplyTextKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contactPhone: phone.replace(/[^0-9+]/g, ''),
      text: message,
      mode: 'SINGLE_SMS',
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`SMS send failed [${response.status}]:`, errBody);
    return false;
  }

  return true;
}

async function sendOtpViaEmail(code: string, email: string, name: string) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return;

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
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px; font-weight: normal;">Ticket Transfer Verification</h2>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                Hi ${name},
              </p>
              <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                You've requested to transfer a ticket. Use the code below to authorize this transfer:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto 30px auto;">
                <tr>
                  <td style="background-color: #f5f5f0; border-radius: 8px; padding: 20px 40px; text-align: center;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a; font-family: monospace;">${code}</span>
                  </td>
                </tr>
              </table>
              <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
                This code expires in <strong>10 minutes</strong>.
              </p>
              <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 0;">
                If you did not request this transfer, you can safely ignore this email. Your ticket remains secure.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f0; padding: 20px; text-align: center;">
              <p style="color: #888888; font-size: 12px; margin: 0;">
                Cosmico 2026 · Wildhaven Sonoma
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
        from: 'Cosmico <hello@example.invalid>',
        to: [email],
        subject: `Your transfer verification code: ${code}`,
        html: emailHtml,
      }),
    });
  } catch (error) {
    console.error('Error sending OTP email:', error);
  }
}
