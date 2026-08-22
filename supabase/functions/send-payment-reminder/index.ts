import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  formatTicketType,
  formatAmount,
  replaceTemplateVars,
  colors,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    ).auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Check if user is admin
    const { data: hasAdminRole } = await supabaseClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { registrationId } = await req.json();

    if (!registrationId) {
      throw new Error("Registration ID is required");
    }

    // Fetch registration details
    const { data: registration, error: dbError } = await supabaseClient
      .from("registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (dbError || !registration) {
      throw new Error("Registration not found");
    }

    // Only send reminders for pending payments
    if (registration.payment_status !== 'pending') {
      return new Response(
        JSON.stringify({ error: "Can only send reminders for pending registrations" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Check rate limit
    const emailType = 'payment_reminder';
    const cooldownMinutes = 240;
    
    const { data: rateLimit } = await supabaseClient
      .from('email_rate_limits')
      .select('*')
      .eq('registration_id', registrationId)
      .eq('email_type', emailType)
      .single();

    if (rateLimit) {
      const lastSentAt = new Date(rateLimit.last_sent_at);
      const cooldownEnds = new Date(lastSentAt.getTime() + rateLimit.cooldown_minutes * 60000);
      const now = new Date();

      if (now < cooldownEnds) {
        const minutesRemaining = Math.ceil((cooldownEnds.getTime() - now.getTime()) / 60000);
        return new Response(
          JSON.stringify({ 
            error: "Rate limit exceeded",
            message: `Please wait ${minutesRemaining} more minutes before sending another ${emailType} email`,
            cooldownEnds: cooldownEnds.toISOString()
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 429,
          }
        );
      }
    }

    // Fetch custom email template
    const { data: template } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_type", "payment_reminder")
      .single();

    // Fetch email signature settings
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Fetch active event title
    const { data: eventData } = await supabaseClient
      .from('event_details')
      .select('title')
      .eq('is_active', true)
      .limit(1)
      .single();

    const eventTitle = eventData?.title || 'Cosmico';

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const ticketTypeLabel = formatTicketType(registration.ticket_type);
    const firstName = getFirstName(registration.name);

    // Replace template variables
    const templateVars = {
      name: registration.name,
      first_name: firstName,
      ticket_type: ticketTypeLabel,
      total_amount: formatAmount(registration.total_amount),
    };

    const emailSubject = template?.subject || 'Complete Your Purchase - Cosmico Winter Gathering';
    const emailHeading = template?.heading || '⏰ Complete Your Registration';
    const emailIntro = replaceTemplateVars(template?.intro_text || 'Hi {{first_name}}, you started a ticket purchase but didn\'t complete it.', templateVars);
    const emailFooter = replaceTemplateVars(template?.footer_text || 'Don\'t miss out! Complete your purchase soon.', templateVars);

    // Generate checkout URL if we have a session ID
    let checkoutUrl = '';
    if (registration.stripe_session_id) {
      checkoutUrl = `https://checkout.stripe.com/c/pay/${registration.stripe_session_id}`;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: ${colors.text};
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: ${colors.background};
            }
            .container {
              background: ${colors.surface};
              border: 2px solid ${colors.border};
              padding: 40px;
              text-align: center;
            }
            h1 {
              color: ${colors.primary};
              font-size: 36px;
              font-style: italic;
              margin-bottom: 20px;
            }
            .cta-button {
              display: inline-block;
              background: ${colors.primaryGold};
              color: ${colors.background};
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 30px 0;
              font-weight: bold;
            }
            .details {
              text-align: left;
              margin: 30px 0;
              padding: 20px;
              background: ${colors.surfaceAlt};
              border-left: 3px solid ${colors.primaryGold};
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid ${colors.border};
              color: ${colors.textMuted};
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${escapeHtml(eventTitle)}</h1>
            <p style="color: ${colors.textMuted}; margin-bottom: 20px;">${escapeHtml(emailHeading)}</p>
            
            <p style="font-size: 18px; color: ${colors.text};">
              Hi ${escapeHtml(firstName)}, ${emailIntro.replace(/^Hi \{\{first_name\}\},?\s*/i, '')}
            </p>

            <div class="details">
              <p><strong>Your Order:</strong></p>
              <p>${ticketTypeLabel} - ${formatAmount(registration.total_amount)}</p>
              ${registration.dietary_notes ? `<p><strong>Dietary Notes:</strong> ${escapeHtml(registration.dietary_notes)}</p>` : ''}
            </div>

            ${checkoutUrl ? `
              <a href="${checkoutUrl}" class="cta-button">
                Complete Your Purchase
              </a>
            ` : ''}

            <p style="font-size: 16px; line-height: 1.8;">
              ${emailFooter}
            </p>

            <div class="footer">
              <p style="margin: 10px 0;">${escapeHtml(signatureLine)}<br>${escapeHtml(signatureName)}</p>
              <p style="font-size: 12px;">© ${new Date().getFullYear()} Cosmico. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [registration.email],
      subject: emailSubject,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      throw emailError;
    }

    console.log("Reminder email sent successfully:", emailData);

    // Log the email send
    const { error: logError } = await supabaseClient
      .from('email_logs')
      .insert({
        registration_id: registrationId,
        email_type: 'payment_reminder',
        status: 'sent',
        email_content: emailHtml
      });
    
    if (logError) {
      console.error('Error logging email:', logError);
    }

    // Update rate limit
    await supabaseClient
      .from('email_rate_limits')
      .upsert({
        registration_id: registrationId,
        email_type: emailType,
        last_sent_at: new Date().toISOString(),
        cooldown_minutes: cooldownMinutes
      }, {
        onConflict: 'registration_id,email_type'
      });

    return new Response(
      JSON.stringify({ success: true, emailId: emailData?.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in send-payment-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
