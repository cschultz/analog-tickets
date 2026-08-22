import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { format } from "https://esm.sh/date-fns@3.6.0";
import PDFDocument from "https://esm.sh/pdfkit@0.15.1";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { 
  corsHeaders, 
  colors, 
  escapeHtml, 
  getFirstName,
  generateEmailWrapper,
  replaceTemplateVars
} from "../_shared/email-template.ts";

// Helper function to generate PDF ticket with QR code
async function generatePDFTicket(registration: any, eventDetails: any): Promise<Uint8Array> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks: Uint8Array[] = [];
      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      doc.on('end', () => {
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      });
      doc.on('error', reject);

      // Header with branding
      doc.fillColor('#C7A97A')
         .fontSize(32)
         .font('Helvetica-Bold')
         .text('COSMICO WINTER GATHERING', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fillColor('#322821')
         .fontSize(16)
         .font('Helvetica')
         .text('Your Event Ticket', { align: 'center' });

      doc.moveDown(2);

      // Ticket holder information
      doc.fillColor('#322821')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Ticket Holder:', { continued: false });
      
      doc.font('Helvetica')
         .fontSize(18)
         .text(registration.name, { indent: 20 });

      doc.moveDown(0.5);

      // Ticket type
      const ticketTypeLabel = registration.ticket_type === "dinner_party" 
        ? "Dinner + Party" 
        : "Party Only";
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('Ticket Type:', { continued: false });
      
      doc.font('Helvetica')
         .text(ticketTypeLabel, { indent: 20 });

      doc.moveDown(1.5);

      // Event details box
      doc.rect(50, doc.y, 512, 150)
         .fillAndStroke('#F9F7F4', '#C7A97A');

      const boxY = doc.y - 140;
      
      doc.fillColor('#322821')
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('Event Date:', 70, boxY + 20);
      doc.font('Helvetica')
         .text(format(new Date(eventDetails.event_date), "MMMM d, yyyy"), 180, boxY + 20);

      doc.font('Helvetica-Bold')
         .text('Time:', 70, boxY + 45);
      doc.font('Helvetica')
         .text(format(new Date(`2000-01-01T${eventDetails.event_time}`), "h:mm a"), 180, boxY + 45);

      doc.font('Helvetica-Bold')
         .text('Venue:', 70, boxY + 70);
      doc.font('Helvetica')
         .text(eventDetails.venue_name, 180, boxY + 70);

      doc.font('Helvetica')
         .fontSize(10)
         .text(eventDetails.venue_address, 70, boxY + 95, { width: 480 });

      doc.y = boxY + 160;
      doc.moveDown(1);

      // Generate QR code with CHECKIN: prefix for scanner compatibility
      const qrCodeData = `CHECKIN:${registration.id}`;
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData, {
        width: 250,
        margin: 1,
        color: {
          dark: '#322821',
          light: '#FFFFFF'
        }
      });

      // Add QR code
      const qrY = doc.y;
      doc.image(qrCodeDataUrl, 180, qrY, { width: 250, height: 250 });

      doc.y = qrY + 270;
      doc.fontSize(10)
         .fillColor('#7B6E61')
         .text('Present this QR code at check-in', { align: 'center' });

      doc.moveDown(2);

      // Parking info if available
      if (eventDetails.parking_info) {
        doc.fontSize(11)
           .fillColor('#322821')
           .font('Helvetica-Bold')
           .text('Parking Information:', { continued: false });
        doc.font('Helvetica')
           .fontSize(10)
           .text(eventDetails.parking_info, { indent: 20 });
        doc.moveDown(0.5);
      }

      // Check-in instructions if available
      if (eventDetails.check_in_instructions) {
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text('Check-In Instructions:', { continued: false });
        doc.font('Helvetica')
           .fontSize(10)
           .text(eventDetails.check_in_instructions, { indent: 20 });
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(9)
         .fillColor('#7B6E61')
         .text('Questions? Contact us at hello@example.invalid', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Format text with basic markdown support
function formatText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

function buildMapLink(venueName: string | null | undefined, venueAddress: string | null | undefined): string | null {
  const destination = [venueName, venueAddress].filter(Boolean).join(', ').trim();
  if (!destination) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reminderType, testEmail, autoScheduled } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

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

    // Fetch email settings including reminder toggle
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name, send_reminder_emails')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';
    const sendReminderEmails = emailSettings?.send_reminder_emails ?? true;

    // Check if reminder emails are globally enabled (skip check for test emails)
    if (!sendReminderEmails && !testEmail) {
      console.log("Reminder emails are disabled in settings");
      return new Response(
        JSON.stringify({ message: "Reminder emails are disabled in settings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch reminder template
    const { data: reminder, error: reminderError } = await supabaseClient
      .from("event_reminders")
      .select("*")
      .eq("reminder_type", reminderType)
      .eq("enabled", true)
      .single();

    if (reminderError || !reminder) {
      console.log("Reminder not found or disabled:", reminderType);
      return new Response(
        JSON.stringify({ message: "Reminder not found or disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch event details
    const { data: eventDetails, error: eventError } = await supabaseClient
      .from("event_details")
      .select("*")
      .eq("is_active", true)
      .single();

    if (eventError || !eventDetails) {
      throw new Error("Event details not found");
    }

    const eventTitle = eventDetails.title || 'Cosmico';

    // If testEmail is provided, send only to that email with sample data
    if (testEmail) {
      const sampleRegistration = {
        id: "test-id",
        name: "John Doe",
        email: testEmail,
        ticket_type: "dinner_party",
      };

      const sampleFirstName = getFirstName(sampleRegistration.name);

      // Build template variables
      const templateVars = {
        name: sampleRegistration.name,
        first_name: sampleFirstName,
        event_date: format(new Date(eventDetails.event_date), "MMMM d, yyyy"),
        event_time: format(new Date(`2000-01-01T${eventDetails.event_time}`), "h:mm a"),
        venue_name: eventDetails.venue_name,
        venue_address: eventDetails.venue_address,
        parking_info: eventDetails.parking_info || "",
        check_in_instructions: eventDetails.check_in_instructions || "",
        survey_link: `https://example.invalid/survey?reg=${sampleRegistration.id}&email=${encodeURIComponent(sampleRegistration.email)}&name=${encodeURIComponent(sampleRegistration.name)}`
      };

      const mapLink = reminderType === 'day_before'
        ? buildMapLink(eventDetails.venue_name, eventDetails.venue_address)
        : null;

      const emailSubject = replaceTemplateVars(reminder.subject, templateVars);
      const emailHeading = replaceTemplateVars(reminder.heading, templateVars);
      const emailIntro = replaceTemplateVars(reminder.intro_text, templateVars);
      const emailBody = replaceTemplateVars(reminder.body_text, templateVars);
      const emailFooter = replaceTemplateVars(reminder.footer_text, templateVars);

      // Build email content
      const content = `
        <div style="margin: 20px 0;">
          ${formatText(emailIntro)}
        </div>
        <div style="margin: 20px 0; line-height: 1.8;">
          ${formatText(emailBody)}
        </div>
        ${mapLink ? `
          <div style="margin: 28px 0 8px; text-align: center;">
            <a href="${mapLink}" style="display: inline-block; background: ${colors.primary}; color: #ffffff; text-decoration: none; padding: 14px 22px; border-radius: 999px; font-weight: 600; font-size: 14px;">
              Open Map
            </a>
            <div style="margin-top: 10px; font-size: 12px; color: ${colors.textMuted}; line-height: 1.6;">
              Open directions for ${escapeHtml(eventDetails.venue_name || 'the venue')} before you head out.
            </div>
          </div>
        ` : ''}
        ${emailFooter ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid ${colors.border};">${formatText(emailFooter)}</div>` : ''}
        <div style="background: #FEF3C7; color: #92400E; padding: 12px; text-align: center; margin-top: 20px; border-radius: 8px;">
          ⚠️ This is a test email preview
        </div>
      `;

      const emailHtml = generateEmailWrapper({
        eventTitle,
        heading: emailHeading,
        firstName: sampleFirstName,
        signatureLine,
        signatureName
      }, content);

      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      
      // Generate PDF ticket for week_before reminders
      let pdfAttachment;
      if (reminderType === 'week_before') {
        const pdfBuffer = await generatePDFTicket(sampleRegistration, eventDetails);
        pdfAttachment = [{
          filename: 'cosmico-ticket.pdf',
          content: Array.from(pdfBuffer),
        }];
      }

      const { error: emailError } = await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [testEmail],
        subject: `[TEST] ${emailSubject}`,
        html: emailHtml,
        ...(pdfAttachment && { attachments: pdfAttachment }),
      });

      if (emailError) {
        throw emailError;
      }

      console.log(`Test email sent to ${testEmail}`);
      return new Response(
        JSON.stringify({ message: "Test email sent successfully", email: testEmail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch all paid registrations FOR THE ACTIVE EVENT ONLY
    // CRITICAL: This prevents sending emails to old event attendees
    const { data: registrations, error: regError } = await supabaseClient
      .from("registrations")
      .select("*")
      .eq("payment_status", "paid")
      .eq("event_id", eventDetails.id); // Only active event registrations!

    if (regError) {
      throw new Error("Failed to fetch registrations");
    }

    if (!registrations || registrations.length === 0) {
      console.log(`[send-event-reminders] No paid registrations found for event ${eventDetails.id}`);
      return new Response(
        JSON.stringify({ message: "No paid registrations found for active event" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`[send-event-reminders] Found ${registrations.length} paid registrations for ${eventTitle}`);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    let sentCount = 0;
    let errorCount = 0;

    // Send emails to all registrations
    for (const registration of registrations) {
      try {
        // Check if this reminder was already sent
        const { data: existingLog } = await supabaseClient
          .from("event_reminder_logs")
          .select("id")
          .eq("registration_id", registration.id)
          .eq("reminder_type", reminderType)
          .single();

        if (existingLog) {
          console.log(`Reminder already sent to ${registration.email}`);
          continue;
        }

        const firstName = getFirstName(registration.name);

        // Build template variables
        const templateVars = {
          name: registration.name,
          first_name: firstName,
          event_date: format(new Date(eventDetails.event_date), "MMMM d, yyyy"),
          event_time: format(new Date(`2000-01-01T${eventDetails.event_time}`), "h:mm a"),
          venue_name: eventDetails.venue_name,
          venue_address: eventDetails.venue_address,
          parking_info: eventDetails.parking_info || "",
          check_in_instructions: eventDetails.check_in_instructions || ""
        };

        const mapLink = reminderType === 'day_before'
          ? buildMapLink(eventDetails.venue_name, eventDetails.venue_address)
          : null;

        const emailSubject = replaceTemplateVars(reminder.subject, templateVars);
        const emailHeading = replaceTemplateVars(reminder.heading, templateVars);
        const emailIntro = replaceTemplateVars(reminder.intro_text, templateVars);
        const emailBody = replaceTemplateVars(reminder.body_text, templateVars);
        const emailFooter = replaceTemplateVars(reminder.footer_text, templateVars);

        // Build email content
        const content = `
          <div style="margin: 20px 0;">
            ${formatText(emailIntro)}
          </div>
          <div style="margin: 20px 0; line-height: 1.8;">
            ${formatText(emailBody)}
          </div>
          ${mapLink ? `
            <div style="margin: 28px 0 8px; text-align: center;">
              <a href="${mapLink}" style="display: inline-block; background: ${colors.primary}; color: #ffffff; text-decoration: none; padding: 14px 22px; border-radius: 999px; font-weight: 600; font-size: 14px;">
                Open Map
              </a>
              <div style="margin-top: 10px; font-size: 12px; color: ${colors.textMuted}; line-height: 1.6;">
                Open directions for ${escapeHtml(eventDetails.venue_name || 'the venue')} before you head out.
              </div>
            </div>
          ` : ''}
          ${emailFooter ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid ${colors.border};">${formatText(emailFooter)}</div>` : ''}
        `;

        const emailHtml = generateEmailWrapper({
          eventTitle,
          heading: emailHeading,
          firstName,
          signatureLine,
          signatureName
        }, content);

        // Generate PDF ticket for week_before reminders
        let pdfAttachment;
        if (reminderType === 'week_before') {
          const pdfBuffer = await generatePDFTicket(registration, eventDetails);
          pdfAttachment = [{
            filename: 'cosmico-ticket.pdf',
            content: Array.from(pdfBuffer),
          }];
        }

        const { error: emailError } = await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [registration.email],
          subject: emailSubject,
          html: emailHtml,
          ...(pdfAttachment && { attachments: pdfAttachment }),
        });

        if (emailError) {
          console.error("Error sending email to", registration.email, emailError);
          errorCount++;
          
          // Log failed send
          await supabaseClient.from("event_reminder_logs").insert({
            reminder_type: reminderType,
            registration_id: registration.id,
            status: "failed",
            error_message: emailError.message,
          });
        } else {
          sentCount++;
          
          // Log successful send
          await supabaseClient.from("event_reminder_logs").insert({
            reminder_type: reminderType,
            registration_id: registration.id,
            status: "sent",
          });
        }
      } catch (error: any) {
        console.error("Error processing registration", registration.id, error);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sentCount,
        errorCount,
        totalRegistrations: registrations.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in send-event-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
