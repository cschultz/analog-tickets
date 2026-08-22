import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PatronsEmailRequest {
  name: string;
  email: string;
  packageType: "ultimate" | "premier";
  sessionId?: string;
}

const PATRONS_PACKAGES = {
  ultimate: {
    name: "Ultimate Patrons Package",
    amount: 10000,
    tickets: 8,
    benefits: [
      "8 Krewe passes for you and your closest friends",
      "Stage-side glamping tent with premium bedding",
      "On-demand shuttle service to Healdsburg hotel",
      "Reserved VIP parking",
      "Exclusive patron-only experiences",
      "Artist meet-and-greet opportunities",
      "Recognition as a Founding Patron",
    ],
  },
  premier: {
    name: "Premier Patrons Package",
    amount: 5000,
    tickets: 4,
    benefits: [
      "4 Krewe passes for you and your crew",
      "Stage-side glamping tent with premium bedding",
      "Reserved VIP parking",
      "Exclusive patron-only experiences",
      "Recognition as a Founding Patron",
    ],
  },
};

const generatePatronsEmailHtml = (
  name: string,
  packageType: "ultimate" | "premier"
) => {
  const packageDetails = PATRONS_PACKAGES[packageType];
  const formattedAmount = `$${packageDetails.amount.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`;
  const isUltimate = packageType === "ultimate";

  const benefitsList = packageDetails.benefits
    .map(
      (benefit) => `
      <tr>
        <td style="padding: 8px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr>
              <td style="width: 24px; vertical-align: top; color: #c9a86c;">✦</td>
              <td style="color: #f5f0e8; font-size: 14px; line-height: 1.6;">${benefit}</td>
            </tr>
          </table>
        </td>
      </tr>
    `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to the Analog Family</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a2339; color: #f5f0e8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a2339;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          
          <!-- Header with Special Patron Badge -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <h1 style="margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 0.1em; color: #f5f0e8;">
                COSMICO
              </h1>
            </td>
          </tr>

          <!-- Patron Crown Badge -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <div style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, rgba(201, 168, 108, 0.3), rgba(201, 168, 108, 0.1)); display: inline-block; line-height: 100px; border: 2px solid rgba(201, 168, 108, 0.5);">
                <span style="font-size: 48px;">${isUltimate ? "👑" : "⭐"}</span>
              </div>
            </td>
          </tr>

          <!-- Main Message -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <h2 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; color: #c9a86c;">
                ${isUltimate ? "Ultimate Patron" : "Premier Patron"}
              </h2>
              <h3 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 300; color: #f5f0e8;">
                Welcome to the Analog Family, ${name}
              </h3>
              <p style="margin: 0; font-size: 16px; color: #a8b5c4; line-height: 1.6; max-width: 400px;">
                Your extraordinary generosity makes Cosmico possible. You are now a founding member of something truly special.
              </p>
            </td>
          </tr>

          <!-- Contribution Summary -->
          <tr>
            <td style="padding-bottom: 30px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, rgba(201, 168, 108, 0.15), rgba(201, 168, 108, 0.05)); border-radius: 12px; border: 1px solid rgba(201, 168, 108, 0.3);">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #a8b5c4;">Your Contribution</p>
                          <p style="margin: 0; font-size: 36px; font-weight: 300; color: #c9a86c;">${formattedAmount}</p>
                        </td>
                        <td align="right" style="vertical-align: bottom;">
                          <p style="margin: 0; font-size: 14px; color: #f5f0e8;">${packageDetails.name}</p>
                          <p style="margin: 4px 0 0 0; font-size: 12px; color: #a8b5c4;">${packageDetails.tickets} Krewe Passes Included</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Benefits Card -->
          <tr>
            <td style="padding-bottom: 30px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #c9a86c;">
                      Your Patron Benefits
                    </h3>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${benefitsList}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Event Details Card -->
          <tr>
            <td style="padding-bottom: 30px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #c9a86c;">
                      See You at the Reunion
                    </h3>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 12px 0;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">📅</span>
                              </td>
                              <td>
                                <p style="margin: 0; color: #f5f0e8; font-size: 16px; font-weight: 500;">May 15–17, 2026</p>
                                <p style="margin: 4px 0 0 0; color: #a8b5c4; font-size: 14px;">Friday through Sunday</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">📍</span>
                              </td>
                              <td>
                                <p style="margin: 0; color: #f5f0e8; font-size: 16px; font-weight: 500;">Wildhaven</p>
                                <p style="margin: 4px 0 0 0; color: #a8b5c4; font-size: 14px;">Near Healdsburg, California</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- About Your Tickets Card -->
          <tr>
            <td style="padding-bottom: 30px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: rgba(59, 130, 246, 0.1); border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.2);">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width: 50px; vertical-align: top;">
                          <span style="font-size: 28px;">🎟️</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #60a5fa;">
                            About Your Tickets
                          </h3>
                          <p style="margin: 0; font-size: 14px; color: #f5f0e8; line-height: 1.7;">
                            <strong>Your ${isUltimate ? "8" : "4"} Krewe passes with QR codes will be delivered 7 days before the event.</strong>
                          </p>
                          <p style="margin: 12px 0 0 0; font-size: 13px; color: #a8b5c4; line-height: 1.7;">
                            Why? To protect our community from scalping and ensure every ticket reaches its rightful owner. This is how we keep Analog for the people who truly want to be there.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What's Next Card -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: rgba(201, 168, 108, 0.1); border-radius: 12px; border: 1px solid rgba(201, 168, 108, 0.2);">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #c9a86c;">
                      What Happens Next
                    </h3>
                    <ul style="margin: 0; padding: 0 0 0 20px; color: #a8b5c4; font-size: 14px; line-height: 1.8;">
                      <li style="margin-bottom: 8px;"><strong style="color: #f5f0e8;">Personal Welcome:</strong> A member of our team will reach out within 48 hours to welcome you personally and discuss your patron experience.</li>
                      <li style="margin-bottom: 8px;"><strong style="color: #f5f0e8;">VIP Lodging:</strong> Your exclusive stage-side glamping tent will be arranged and confirmed in the coming weeks.</li>
                      <li style="margin-bottom: 8px;"><strong style="color: #f5f0e8;">Priority Access:</strong> You will receive first invitations to patron-only experiences and artist meet-and-greets.</li>
                      <li style="margin-bottom: 8px;"><strong style="color: #f5f0e8;">Tax Documentation:</strong> As a contribution to the Launch Pad Foundation (501c3), a portion may be tax-deductible. Documentation will be provided.</li>
                      <li><strong style="color: #f5f0e8;">Your Tickets:</strong> Your passes with QR codes will arrive 7 days before the event — watch your inbox!</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Personal Note -->
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 450px;">
                <tr>
                  <td style="padding: 20px; border-left: 3px solid #c9a86c;">
                    <p style="margin: 0; font-size: 15px; color: #f5f0e8; font-style: italic; line-height: 1.7;">
                      "Your belief in what we are building means everything. Cosmico is more than a festival — it is a gathering of kindred spirits, and you are now at the heart of it. We cannot wait to welcome you home."
                    </p>
                    <p style="margin: 16px 0 0 0; font-size: 13px; color: #c9a86c;">
                      — The Analog Team
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 30px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #a8b5c4;">
                Cosmico · A new home. The same soul.
              </p>
              <p style="margin: 0 0 16px 0; font-size: 11px; color: #6b7a8c;">
                Analog is produced by the Launch Pad Foundation, a 501(c)(3) public charity.
              </p>
              <p style="margin: 0; font-size: 11px; color: #6b7a8c;">
                Questions? Reach out to us at <a href="mailto:hello@example.invalid" style="color: #c9a86c; text-decoration: none;">hello@example.invalid</a>
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
    const { name, email, packageType, sessionId }: PatronsEmailRequest = await req.json();

    if (!name || !email || !packageType) {
      throw new Error("Name, email, and packageType are required");
    }

    if (!["ultimate", "premier"].includes(packageType)) {
      throw new Error("Invalid package type");
    }

    console.log(`[send-patrons-confirmation] Sending ${packageType} confirmation to: ${email}`);

    // Generate email HTML
    const emailHtml = generatePatronsEmailHtml(name, packageType as "ultimate" | "premier");
    const packageDetails = PATRONS_PACKAGES[packageType as keyof typeof PATRONS_PACKAGES];

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [email],
      subject: `Welcome to the Analog Family — ${packageDetails.name}`,
      html: emailHtml,
    });

    console.log(`[send-patrons-confirmation] Email sent successfully:`, emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("[send-patrons-confirmation] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
