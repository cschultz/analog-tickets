import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RaffleConfirmationRequest {
  email: string;
  firstName?: string;
  donationAmount?: number; // in dollars (not cents)
}

const generateHtml = (firstName: string | undefined, donationAmount: number) => {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const donationLine =
    donationAmount > 0
      ? `<p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.7; color: #2a2a2a;">
           Thank you for your optional <strong>$${donationAmount}</strong> gift to the Launch Pad Foundation. Your generosity supports analog gatherings that reconnect people to themselves, their communities, and nature. As Launch Pad is a 501(c)(3) public charity, your donation may be tax-deductible.
         </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're entered — Cosmico VIP Giveaway</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #e8ddc9; color: #2a2a2a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e8ddc9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width: 560px; background-color: #ffffff;">
          <!-- Header band -->
          <tr>
            <td style="background-color: #1a2840; padding: 32px 40px; text-align: left;">
              <p style="margin: 0 0 8px 0; font-size: 11px; letter-spacing: 0.18em; color: #d4a849; text-transform: uppercase;">Cosmico · Giveaway</p>
              <h1 style="margin: 0; font-size: 28px; line-height: 1.1; color: #ffffff; text-transform: uppercase; font-weight: 700;">You're in.</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 40px;">
              <p style="margin: 0 0 18px 0; font-size: 16px; line-height: 1.6; color: #2a2a2a;">${greeting}</p>

              <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.7; color: #2a2a2a;">
                Your entry into the <strong>Cosmico VIP Weekend Giveaway</strong> is officially in. We'll be in touch.
              </p>

              ${donationLine}

              <!-- Prize summary -->
              <div style="background-color: #f5efe2; padding: 22px 24px; margin: 24px 0;">
                <p style="margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.16em; color: #5a6478; text-transform: uppercase;">What you could win</p>
                <ul style="margin: 0; padding: 0 0 0 18px; font-size: 14px; line-height: 1.8; color: #2a2a2a;">
                  <li>Two (2) 3-Day VIP Passes to Cosmico 2026</li>
                  <li>On-site glamping tent stay at Wildhaven Sonoma</li>
                  <li>Sundrop Sauna ritual experience for two</li>
                  <li>72-hour Rivian weekend getaway</li>
                </ul>
                <p style="margin: 14px 0 0 0; font-size: 12px; color: #5a6478;">ARV: $2,500 · 1 winner · Travel not included</p>
              </div>

              <!-- Key details -->
              <p style="margin: 0 0 10px 0; font-size: 11px; letter-spacing: 0.16em; color: #5a6478; text-transform: uppercase;">A few details</p>
              <ul style="margin: 0 0 24px 0; padding: 0 0 0 18px; font-size: 14px; line-height: 1.8; color: #2a2a2a;">
                <li>Sweepstakes ends <strong>May 8, 2026 at 11:59 PM PT</strong>.</li>
                <li>Winner is selected at random within 3 days after the close date.</li>
                <li>You'll be notified by email — please respond within 48 hours.</li>
                <li>Open to U.S. residents, age 18+.</li>
              </ul>

              <!-- Tax notice -->
              <div style="border-left: 3px solid #d4a849; padding: 12px 16px; background-color: #fafafa; margin: 0 0 24px 0;">
                <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #5a6478;">
                  <strong style="color: #2a2a2a;">If you win:</strong> The prize ARV exceeds $600, so by law the winner will be required to complete IRS Form W-9 before receiving the prize, and Launch Pad Foundation will issue Form 1099 for the prize value. The winner is responsible for all applicable federal, state, and local taxes.
                </p>
              </div>

              <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.7; color: #2a2a2a;">
                <a href="https://example.invalid/giveaway-rules" style="color: #1a2840; text-decoration: underline;">Read the full Official Rules →</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; background-color: #f5efe2; border-top: 1px solid #e0d9c8;">
              <p style="margin: 0 0 10px 0; font-size: 11px; line-height: 1.6; color: #5a6478;">
                NO PURCHASE OR DONATION NECESSARY TO ENTER OR WIN. A purchase or donation will not increase your chances of winning. Void where prohibited.
              </p>
              <p style="margin: 0 0 10px 0; font-size: 11px; line-height: 1.6; color: #5a6478;">
                Sponsored by <strong>Launch Pad Foundation</strong>, a 501(c)(3) public charity.
              </p>
              <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #5a6478;">
                This promotion is in no way sponsored, endorsed, administered by, or associated with Facebook, Instagram, or Meta Platforms, Inc.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, donationAmount = 0 }: RaffleConfirmationRequest = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = generateHtml(firstName, donationAmount);

    const result = await resend.emails.send({
      from: "Cosmico <hello@example.invalid>",
      to: [email.trim().toLowerCase()],
      subject: "You're entered — Cosmico VIP Giveaway",
      html,
    });

    console.log("Raffle confirmation sent:", result);
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending raffle confirmation:", error);
    return new Response(JSON.stringify({ error: error?.message || "Failed to send" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
