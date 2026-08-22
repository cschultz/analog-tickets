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
  getEventDateRange,
  isGa2DayTicket,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { registrationId } = await req.json();

    if (!registrationId) {
      throw new Error("Registration ID is required");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch registration details
    const { data: registration, error: dbError } = await supabaseClient
      .from("registrations")
      .select("*, event_details:event_details!registrations_event_id_fkey(title, event_date, event_time, venue_name, venue_address)")
      .eq("id", registrationId)
      .single();

    if (dbError || !registration) {
      throw new Error("Registration not found");
    }

    const eventDetails = registration.event_details;

    // Check rate limit
    const emailType = 'ticket_confirmation';
    const cooldownMinutes = 60;
    
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
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_type", "ticket_confirmation")
      .single();

    if (templateError) {
      console.log("No custom template found, using defaults");
    }

    // Fetch email signature settings
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // Use order_number if available, otherwise generate confirmation code from registration ID
    const orderNumber = registration.order_number || `COS-${registrationId.substring(0, 8).toUpperCase()}`;
    const confirmationCode = registrationId.substring(0, 8).toUpperCase();

    const ticketTypeLabel = formatTicketType(registration.ticket_type);
    const firstName = getFirstName(registration.name);
    const eventTitle = eventDetails?.title || 'Cosmico 2026';

    // Replace template variables with actual data
    const templateVars = {
      name: registration.name,
      first_name: firstName,
      ticket_type: ticketTypeLabel,
      total_amount: formatAmount(registration.total_amount),
      confirmation_code: confirmationCode,
      order_number: orderNumber,
    };

    // Use custom template values or fallback to defaults
    const emailSubject = template?.subject 
      ? replaceTemplateVars(template.subject, templateVars) 
      : `Order Confirmed — ${eventTitle}`;
    const emailHeading = template?.heading || 'You\'re In';
    const emailIntro = replaceTemplateVars(
      template?.intro_text || 'Hi {{first_name}}, your order for {{ticket_type}} has been confirmed.',
      templateVars
    );
    const emailFooter = replaceTemplateVars(
      template?.footer_text || 'We can\'t wait to see you there.',
      templateVars
    );

    // Generate .ics calendar file with dynamic dates based on ticket type
    const generateICS = (event: any, reg: any) => {
      const [year, month, day] = event.event_date.split('-').map(Number);
      const dateStr = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
      
      // Dynamic end date: GA 2-day ends on day+1 (Saturday), others end on day+2 (Sunday)
      const dayOffset = isGa2DayTicket(reg.ticket_type) ? 1 : 2;
      const endDay = day + dayOffset;
      const endDayStr = `${year}${String(month).padStart(2, '0')}${String(endDay).padStart(2, '0')}`;
      
      const formatDateUTC = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };
      
      // Dynamic description based on ticket type
      const daysDescription = isGa2DayTicket(reg.ticket_type) 
        ? 'Friday & Saturday (May 15-16)' 
        : 'Friday through Sunday (May 15-17)';
      
      return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Cosmico//Events//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:America/Los_Angeles
BEGIN:DAYLIGHT
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
TZNAME:PDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
TZNAME:PST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:${reg.id}@example.invalid
DTSTAMP:${formatDateUTC(new Date())}
DTSTART;TZID=America/Los_Angeles:${dateStr}T160000
DTEND;TZID=America/Los_Angeles:${endDayStr}T220000
SUMMARY:${event.title}
DESCRIPTION:You're registered for ${event.title}! ${daysDescription}
LOCATION:${event.venue_name}, ${event.venue_address}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT24H
ACTION:DISPLAY
DESCRIPTION:Reminder: ${event.title} starts tomorrow!
END:VALARM
END:VEVENT
END:VCALENDAR`;
    };

    const icsFile = generateICS(eventDetails, registration);
    const icsBase64 = btoa(icsFile);

    // Generate or retrieve secure access token for this registration
    let accessToken: string;
    
    // Check if token already exists for this registration
    const { data: existingToken } = await supabaseClient
      .from("ticket_access_tokens")
      .select("token")
      .eq("registration_id", registrationId)
      .single();
    
    if (existingToken?.token) {
      accessToken = existingToken.token;
    } else {
      // Generate new secure token
      accessToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      
      // Store the token
      await supabaseClient
        .from("ticket_access_tokens")
        .insert({
          registration_id: registrationId,
          token: accessToken,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        });
    }
    
    // Construct email HTML matching /jan/ styling
    const eventDateObj = new Date(eventDetails.event_date);
    const eventDate = eventDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: "America/Los_Angeles" });
    const { dateRange: eventDateRange, dayDescription: eventDayDescription } = getEventDateRange(registration.ticket_type);
    const eventLocation = eventDetails.venue_name || 'Wildhaven Sonoma';
    
    // Use SITE_URL secret or fallback, removing trailing slash if present
    const siteUrl = (Deno.env.get("SITE_URL") || "https://example.invalid").replace(/\/+$/, '');
    const myTicketsUrl = `${siteUrl}/my-tickets?token=${encodeURIComponent(accessToken)}`;
    
    // Jan/preview theme colors
    const previewColors = {
      bg: '#F4F6F8',
      surface: '#E8EBEF',
      text: '#1A2A3A',
      muted: '#5B6B7B',
      accent: '#3A8A8F',
      border: '#C5CCD4',
    };
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${previewColors.text}; background: ${previewColors.bg}; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; background: #FFFFFF; }
            .header { background: ${previewColors.bg}; padding: 40px 30px; text-align: center; border-bottom: 1px solid ${previewColors.border}; }
            .header img { height: 40px; opacity: 0.8; }
            .header-date { font-size: 13px; color: ${previewColors.muted}; margin-top: 12px; letter-spacing: 0.5px; }
            .content { padding: 40px 30px; }
            .success-icon { width: 56px; height: 56px; border-radius: 50%; background: #10B981; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
            .success-icon svg { width: 28px; height: 28px; color: white; }
            .heading { font-size: 28px; font-weight: 600; color: ${previewColors.text}; margin: 0 0 8px; text-align: center; }
            .subheading { font-size: 16px; color: ${previewColors.muted}; margin: 0 0 32px; text-align: center; }
            .confirmation-box { background: ${previewColors.bg}; border: 1px solid ${previewColors.border}; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center; }
            .confirmation-label { font-size: 12px; color: ${previewColors.muted}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
            .confirmation-code { font-size: 24px; font-weight: 700; color: ${previewColors.text}; font-family: monospace; letter-spacing: 2px; }
            .order-box { background: ${previewColors.bg}; border: 1px solid ${previewColors.border}; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
            .order-title { font-size: 14px; font-weight: 600; color: ${previewColors.text}; margin-bottom: 16px; }
            .order-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid ${previewColors.border}; font-size: 14px; }
            .order-row:last-child { border-bottom: none; padding-top: 12px; font-weight: 600; }
            .order-label { color: ${previewColors.muted}; }
            .order-value { color: ${previewColors.text}; }
            .event-box { background: #FFFFFF; border: 1px solid ${previewColors.border}; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
            .event-title { font-size: 14px; font-weight: 600; color: ${previewColors.text}; margin-bottom: 16px; }
            .event-item { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
            .event-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(58, 138, 143, 0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .event-icon svg { width: 16px; height: 16px; color: ${previewColors.accent}; }
            .event-label { font-size: 14px; font-weight: 500; color: ${previewColors.text}; }
            .event-detail { font-size: 13px; color: ${previewColors.muted}; }
            .note-box { background: rgba(58, 138, 143, 0.08); border: 1px solid rgba(58, 138, 143, 0.2); border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
            .note-title { font-size: 13px; font-weight: 600; color: ${previewColors.accent}; margin-bottom: 4px; }
            .note-text { font-size: 13px; color: ${previewColors.muted}; margin: 0; }
            .cta-box { text-align: center; margin: 24px 0; }
            .cta-button { display: inline-block; background: ${previewColors.accent}; color: #FFFFFF; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; }
            .cta-hint { font-size: 12px; color: ${previewColors.muted}; margin-top: 12px; }
            .footer { text-align: center; padding: 30px; color: ${previewColors.muted}; font-size: 13px; border-top: 1px solid ${previewColors.border}; background: ${previewColors.bg}; }
            .footer-logo { opacity: 0.5; margin-bottom: 12px; }
            .footer p { margin: 4px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://example.invalid/cosmico-logo.png" alt="Cosmico" />
              <div class="header-date">${eventDateRange}</div>
            </div>
            <div class="content">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); display: inline-flex; align-items: center; justify-content: center;">
                  <div style="width: 40px; height: 40px; border-radius: 50%; background: #10B981; display: flex; align-items: center; justify-content: center;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                </div>
              </div>
              
              <h1 class="heading">${escapeHtml(emailHeading)}</h1>
              <p class="subheading">${emailIntro}</p>
              
              <div class="confirmation-box">
                <div class="confirmation-label">Order Number</div>
                <div class="confirmation-code">${orderNumber}</div>
              </div>

              <div class="order-box">
                <div class="order-title">Order Details</div>
                <div class="order-row">
                  <span class="order-label">Name</span>
                  <span class="order-value">${escapeHtml(registration.name)}</span>
                </div>
                <div class="order-row">
                  <span class="order-label">Ticket</span>
                  <span class="order-value">${ticketTypeLabel}</span>
                </div>
                <div class="order-row">
                  <span class="order-label">Quantity</span>
                  <span class="order-value">${registration.quantity}</span>
                </div>
                ${registration.donation_amount && registration.donation_amount > 0 ? `
                <div class="order-row">
                  <span class="order-label">Donation</span>
                  <span class="order-value">${formatAmount(registration.donation_amount)}</span>
                </div>
                ` : ''}
                <div class="order-row">
                  <span class="order-label">Total Paid</span>
                  <span class="order-value">${formatAmount(registration.total_amount)}</span>
                </div>
              </div>
              
              ${registration.donation_amount && registration.donation_amount > 0 ? `
              <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; text-align: center;">
                <div style="font-size: 13px; font-weight: 600; color: #10B981; margin-bottom: 4px;">Thank You for Your Generosity</div>
                <p style="font-size: 13px; color: ${previewColors.muted}; margin: 0;">Your ${formatAmount(registration.donation_amount)} donation to the Launch Pad Foundation helps keep Cosmico accessible and vibrant. As a 501(c)(3) non-profit, your contribution may be tax-deductible.</p>
              </div>
              ` : ''}

              <div class="event-box">
                <div class="event-title">See You at the Reunion</div>
                <div class="event-item">
                  <div class="event-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  </div>
                  <div>
                    <div class="event-label">${eventDateRange}</div>
                    <div class="event-detail">${eventDayDescription}</div>
                  </div>
                </div>
                <div class="event-item">
                  <div class="event-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  </div>
                  <div>
                    <div class="event-label">${escapeHtml(eventLocation)}</div>
                    <div class="event-detail">Near Healdsburg, California</div>
                  </div>
                </div>
              </div>

              <div class="note-box">
                <div class="note-title">About Your Tickets</div>
                <p class="note-text">This is your order confirmation. Your actual event tickets with QR codes will be emailed to you <strong>7 days before the event</strong>. Keep this email for your records — you can use your confirmation code if you ever need to look up your order.</p>
              </div>

              <div class="cta-box">
                <a href="${myTicketsUrl}" class="cta-button">Manage Booking</a>
                <p class="cta-hint">View tickets, add lodging, and manage add-ons from your booking page</p>
              </div>

              <p style="font-size: 14px; color: ${previewColors.muted}; text-align: center; margin-top: 32px;">${emailFooter}</p>
            </div>
            <div class="footer">
              <p><strong>${escapeHtml(signatureLine)}</strong></p>
              <p><strong>${escapeHtml(signatureName)}</strong></p>
              <p style="margin-top: 16px; font-size: 11px;">Questions? Email us at hello@example.invalid</p>
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
      attachments: [
        {
          filename: 'event.ics',
          content: icsBase64,
        },
      ],
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      throw emailError;
    }

    if (!emailData) {
      throw new Error("No email data returned");
    }

    console.log("Email sent successfully:", emailData);

    // Log the email send
    const { error: logError } = await supabaseClient
      .from('email_logs')
      .insert({
        registration_id: registrationId,
        email_type: 'ticket_confirmation',
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
      JSON.stringify({ success: true, emailId: emailData.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in send-ticket-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
