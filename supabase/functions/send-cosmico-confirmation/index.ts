import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TICKET_NAMES: Record<string, string> = {
  tier_1_krewe_3day: "Krewe — 3 Day Pass",
  tier_1_vip_3day: "VIP — 3 Day Pass",
  tier_1_ga_2day: "GA — 2 Day Pass",
  tier_1_ga_friday: "GA — Friday",
  tier_1_ga_saturday: "GA — Saturday",
};

const isGa2DayTicket = (ticketType: string): boolean => {
  return ticketType === 'ga_2day' || ticketType === 'tier_1_ga_2day';
};

const isSingleDayTicket = (ticketType: string): boolean => {
  return ticketType.includes('friday') || ticketType.includes('saturday');
};

const getEventDateInfo = (ticketType: string) => {
  if (isSingleDayTicket(ticketType)) {
    if (ticketType.includes('friday')) {
      return { dateRange: 'Friday, May 15, 2026' };
    }
    return { dateRange: 'Saturday, May 16, 2026' };
  }
  if (isGa2DayTicket(ticketType)) {
    return { dateRange: 'May 15–16, 2026' };
  }
  return { dateRange: 'May 15–17, 2026' };
};

const getFirstName = (fullName: string): string => {
  return fullName.split(' ')[0] || fullName;
};

const generateEmailHtml = (
  name: string,
  ticketType: string,
  quantity: number,
  totalAmount: number
) => {
  const ticketName = TICKET_NAMES[ticketType] || ticketType;
  const formattedTotal = `$${(totalAmount / 100).toFixed(0)}`;
  const firstName = getFirstName(name);
  const { dateRange } = getEventDateInfo(ticketType);
  const ticketWord = quantity > 1 ? 'tickets' : 'ticket';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're in — Cosmico</title>
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #f5f0e8; color: #2f2f2f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f0e8;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 8px;">
              <p style="margin: 0; font-size: 18px; font-weight: 400; letter-spacing: 0.15em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                COSMICO
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <p style="margin: 0; font-size: 13px; color: #888; font-style: italic;">
                You're officially part of it.
              </p>
            </td>
          </tr>

          <!-- Opening -->
          <tr>
            <td style="padding-bottom: 28px;">
              <p style="margin: 0; font-size: 22px; color: #2f2f2f; font-weight: 400;">
                You're in, ${firstName}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                Your ${quantity > 1 ? quantity + ' ' : ''}${ticketName} ${ticketWord} ${quantity > 1 ? 'are' : 'is'} confirmed. We're glad you're coming.
              </p>
            </td>
          </tr>

          <!-- Order Details -->
          <tr>
            <td style="padding-bottom: 36px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #d4cdc0; border-bottom: 1px solid #d4cdc0;">
                <tr>
                  <td style="padding: 20px 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 6px 0; color: #888; font-size: 14px;">Ticket</td>
                        <td align="right" style="padding: 6px 0; color: #2f2f2f; font-size: 14px;">${ticketName}${quantity > 1 ? ' × ' + quantity : ''}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #888; font-size: 14px;">When</td>
                        <td align="right" style="padding: 6px 0; color: #2f2f2f; font-size: 14px;">${dateRange}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #888; font-size: 14px;">Where</td>
                        <td align="right" style="padding: 6px 0; color: #2f2f2f; font-size: 14px;">
                          <a href="https://maps.google.com/?q=Wildhaven+Sonoma,+Healdsburg,+CA" style="color: #3C6189; text-decoration: none;">Wildhaven, Healdsburg, CA</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #888; font-size: 14px;">Total</td>
                        <td align="right" style="padding: 6px 0; color: #2f2f2f; font-size: 16px; font-weight: 600;">${formattedTotal}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What You Just Joined -->
          <tr>
            <td style="padding-bottom: 36px;">
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                This isn't just a festival.<br>
                It's a weekend built around music, connection, and showing up.
              </p>
            </td>
          </tr>

          <!-- Bring Your Crew -->
          <tr>
            <td style="padding-bottom: 36px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Bring Your Crew
              </p>
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                You're in. Thank you.
              </p>
              <p style="margin: 16px 0 0 0; font-size: 16px; color: #444; line-height: 1.7;">
                One small ask — Cosmico is better with friends.<br>
                This year, we're building crews.
              </p>
              <p style="margin: 16px 0 0 0; font-size: 16px; color: #444; line-height: 1.7;">
                If there's someone who should be here with you, bring them.<br>
                And if they need a little convincing… send them our way.
              </p>
              <p style="margin: 16px 0 0 0; font-size: 16px; color: #444; line-height: 1.7;">
                We'll take good care of them.
              </p>
            </td>
          </tr>

          <!-- What's Next -->
          <tr>
            <td style="padding-bottom: 36px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                What's Next
              </p>
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                Lineup and schedule announcements are coming soon — you'll be the first to know.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 16px; color: #444; line-height: 1.7;">
                Lodging at Wildhaven will open for booking in the coming weeks. Keep an eye on your inbox.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 16px; color: #444; line-height: 1.7;">
                We'll send more details as we get closer to May.
              </p>
            </td>
          </tr>

          <!-- Your Ticket -->
          <tr>
            <td style="padding-bottom: 36px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Your Ticket
              </p>
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                Your ${ticketWord} with QR codes will be delivered to your inbox 7 days before the event.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 15px; color: #888; line-height: 1.7;">
                We do this to protect the community and make sure every ticket reaches its rightful owner.
              </p>
            </td>
          </tr>

          <!-- Stay in the Loop -->
          <tr>
            <td style="padding-bottom: 36px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Stay in the Loop
              </p>
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                Follow along on <a href="https://www.instagram.com/analogreunion" style="color: #3C6189; text-decoration: none;">Instagram @analogreunion</a> for lineup drops, behind-the-scenes moments, and all the good stuff leading up to May.
              </p>
            </td>
          </tr>

          <!-- Questions -->
          <tr>
            <td style="padding-bottom: 40px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Questions?
              </p>
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                Have a question about the vibe, where to stay, or what to expect?<br>
                Just hit reply. We actually read these.
              </p>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding-bottom: 40px;">
              <p style="margin: 0; font-size: 16px; color: #444; line-height: 1.7;">
                See you in May,<br>
                Chris &amp; Anne
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 24px; border-top: 1px solid #d4cdc0;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #aaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Cosmico
              </p>
              <p style="margin: 0; font-size: 11px; color: #bbb;">
                Produced by the Launch Pad Foundation, a 501(c)(3) public charity.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { registrationId } = await req.json();

    if (!registrationId) {
      throw new Error("Registration ID is required");
    }

    console.log(`[send-cosmico-confirmation] Processing registration: ${registrationId}`);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: registration, error: fetchError } = await supabaseClient
      .from("registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (fetchError || !registration) {
      console.error(`[send-cosmico-confirmation] Registration not found:`, fetchError);
      throw new Error("Registration not found");
    }

    console.log(`[send-cosmico-confirmation] Sending email to: ${registration.email}`);

    const emailHtml = generateEmailHtml(
      registration.name,
      registration.ticket_type,
      registration.quantity,
      registration.total_amount
    );

    const senderConfig = await getEmailSenderConfig('guest');

    const emailResponse = await resend.emails.send({
      from: senderConfig.fromAddress,
      to: [registration.email],
      reply_to: senderConfig.replyTo || 'hello@example.invalid',
      subject: "You're in — Cosmico",
      html: emailHtml,
    });

    console.log(`[send-cosmico-confirmation] Email sent successfully:`, emailResponse);

    await supabaseClient.from("email_logs").insert({
      registration_id: registrationId,
      email_type: "cosmico_confirmation",
      status: "sent",
      email_content: `Cosmico confirmation sent to ${registration.email}`,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("[send-cosmico-confirmation] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
