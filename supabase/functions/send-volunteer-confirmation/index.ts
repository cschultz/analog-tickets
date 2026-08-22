import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { 
  corsHeaders, 
  colors, 
  escapeHtml, 
  getFirstName 
} from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const participationLabels: Record<string, string> = {
  volunteer: "Volunteer",
  band_musician: "Band or Musician",
  artisan_vendor: "Artisan or Vendor",
  partner: "Partner",
};

interface VolunteerConfirmationRequest {
  name: string;
  email: string;
  participationType: string;
  phone?: string;
  city?: string;
  message?: string;
}

function generateEmailHtml(name: string, participationType: string): string {
  const firstName = getFirstName(name);
  const participationLabel = participationLabels[participationType] || participationType;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${colors.text}; background: ${colors.background}; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: ${colors.surface}; }
          .header { background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGold} 100%); color: ${colors.background}; padding: 40px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-family: Georgia, serif; }
          .header p { margin: 10px 0 0; font-size: 16px; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .intro { font-size: 16px; color: ${colors.text}; margin-bottom: 20px; }
          .highlight-box { background: #FFF9F0; border: 2px solid ${colors.primaryGold}; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .next-steps { background: ${colors.surfaceAlt}; border-left: 4px solid ${colors.primaryGold}; padding: 20px; margin: 20px 0; }
          .next-steps h3 { margin: 0 0 15px; color: ${colors.primary}; font-size: 16px; }
          .next-steps ul { margin: 0; padding-left: 20px; }
          .next-steps li { margin-bottom: 10px; color: ${colors.textMuted}; }
          .footer { text-align: center; padding: 30px 20px; color: ${colors.textMuted}; font-size: 14px; border-top: 1px solid ${colors.border}; background: ${colors.surfaceAlt}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Cosmico</h1>
            <p>Thanks for Your Interest!</p>
          </div>
          <div class="content">
            <p class="intro">Hi ${escapeHtml(firstName)},</p>
            
            <p>Thank you for expressing your interest in getting involved with Cosmico! We're thrilled that you want to be part of our community.</p>
            
            <div class="highlight-box">
              <p style="margin: 0; font-size: 14px; color: ${colors.textMuted};">You signed up as:</p>
              <p style="margin: 8px 0 0; font-size: 18px; font-weight: 600; color: ${colors.primary};">${escapeHtml(participationLabel)}</p>
            </div>
            
            <p>We've received your submission and our team will review it. We'll be in touch when opportunities open up that match your interests.</p>
            
            <div class="next-steps">
              <h3>What happens next?</h3>
              <ul>
                <li>We'll review your submission and reach out when we have opportunities that match your interests</li>
                <li>Volunteer applications typically open in Spring 2026</li>
                <li>Build weekends are usually the 2-3 weekends before the festival</li>
                <li>Follow us on social media to stay connected with the community</li>
              </ul>
            </div>
            
            <p style="margin-top: 30px;">In the meantime, feel free to explore our website to learn more about what makes Cosmico special. We can't wait to create something magical together!</p>
            
            <p style="margin-top: 30px;">
              With gratitude,<br>
              <strong>The Cosmico Crew</strong>
            </p>
          </div>
          <div class="footer">
            <p style="margin: 10px 0;">
              <a href="https://example.invalid" style="color: ${colors.primary}; text-decoration: none;">example.invalid</a>
            </p>
            <p style="margin: 16px 0 0; font-size: 12px;">
              © ${new Date().getFullYear()} Cosmico. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function generateCoordinatorEmailHtml(data: VolunteerConfirmationRequest): string {
  const participationLabel = participationLabels[data.participationType] || data.participationType;
  const adminUrl = "https://example.invalid/admin/volunteers";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; background: #ffffff; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
          .header { background: #1a1a2e; color: #ffffff; padding: 24px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 20px; }
          .content { padding: 30px; }
          .detail-row { display: flex; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
          .detail-label { font-weight: 600; color: #666; width: 120px; min-width: 120px; font-size: 14px; }
          .detail-value { color: #1a1a2e; font-size: 14px; }
          .cta { display: inline-block; background: #1a1a2e; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #f0f0f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🙋 New Get Involved Submission</h1>
          </div>
          <div class="content">
            <p style="margin-top: 0;">A new interest form was submitted and is ready for triage.</p>
            
            <div style="background: #f9f9fb; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <div class="detail-row">
                <span class="detail-label">Name</span>
                <span class="detail-value"><strong>${escapeHtml(data.name)}</strong></span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Email</span>
                <span class="detail-value">${escapeHtml(data.email)}</span>
              </div>
              ${data.phone ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(data.phone)}</span></div>` : ''}
              ${data.city ? `<div class="detail-row"><span class="detail-label">City</span><span class="detail-value">${escapeHtml(data.city)}</span></div>` : ''}
              <div class="detail-row">
                <span class="detail-label">Interest</span>
                <span class="detail-value"><strong>${escapeHtml(participationLabel)}</strong></span>
              </div>
              ${data.message ? `<div class="detail-row" style="border-bottom: none;"><span class="detail-label">Message</span><span class="detail-value">${escapeHtml(data.message)}</span></div>` : ''}
            </div>

            <a href="${adminUrl}" class="cta">Review in Admin →</a>
          </div>
          <div class="footer">
            <p>This is an automated notification from Cosmico admin.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-volunteer-confirmation: Received request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: VolunteerConfirmationRequest = await req.json();
    const { name, email, participationType, phone, city, message } = body;

    console.log(`send-volunteer-confirmation: Sending to ${email}, name: ${name}, type: ${participationType}`);

    if (!email || !name) {
      console.error("send-volunteer-confirmation: Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send confirmation to volunteer
    const html = generateEmailHtml(name, participationType);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [email],
        subject: "Thanks for Your Interest in Cosmico!",
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("send-volunteer-confirmation: Resend API error:", errorData);
      throw new Error(`Resend API error: ${errorData}`);
    }

    const data = await emailResponse.json();
    console.log("send-volunteer-confirmation: Confirmation email sent:", data);

    // Check if coordinator notification is enabled
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: settings } = await supabase
        .from("email_settings")
        .select("notify_volunteer_submissions, volunteer_coordinator_email")
        .limit(1)
        .maybeSingle();

      const shouldNotify = settings?.notify_volunteer_submissions !== false;
      const coordinatorEmail = settings?.volunteer_coordinator_email;

      if (shouldNotify && coordinatorEmail) {
        console.log(`send-volunteer-confirmation: Notifying coordinator at ${coordinatorEmail}`);
        
        const coordinatorHtml = generateCoordinatorEmailHtml({ name, email, participationType, phone, city, message });

        const coordinatorResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Cosmico <noreply@example.invalid>",
            to: [coordinatorEmail],
            subject: `New Get Involved: ${name} — ${participationLabels[participationType] || participationType}`,
            html: coordinatorHtml,
          }),
        });

        if (!coordinatorResponse.ok) {
          const errText = await coordinatorResponse.text();
          console.error("send-volunteer-confirmation: Coordinator notification failed:", errText);
        } else {
          console.log("send-volunteer-confirmation: Coordinator notified successfully");
        }
      } else {
        console.log("send-volunteer-confirmation: Coordinator notification skipped (disabled or no email set)");
      }
    } catch (settingsError) {
      console.error("send-volunteer-confirmation: Failed to check settings for coordinator notification:", settingsError);
      // Don't fail the whole request for coordinator notification
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("send-volunteer-confirmation: Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
