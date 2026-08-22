import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  getFirstName,
  generatePlainTextEmailWrapper,
  generateEmailWrapper,
  replaceTemplateVars,
  fetchEmailTemplateConfig,
} from "../_shared/email-template.ts";

// This function processes pending drip sequence emails
// It should be called periodically via a cron job

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

    // Get current time
    const now = new Date();
    console.log(`Processing sequence emails at ${now.toISOString()}`);

    // Fetch email settings
    const { data: emailSettings } = await supabaseAdmin
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Fetch template config for HTML emails
    const templateConfig = await fetchEmailTemplateConfig();

    // Get pending sequence logs that are due
    const { data: pendingLogs, error: pendingError } = await supabaseAdmin
      .from('email_sequence_logs')
      .select(`
        id,
        sequence_id,
        step_id,
        registration_id,
        scheduled_for,
        tracking_id,
        email_sequence_steps!inner (
          id,
          subject,
          heading,
          body_html,
          is_active,
          email_format
        ),
        email_sequences!inner (
          id,
          is_active
        ),
        registrations!inner (
          id,
          name,
          email,
          event_id
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())
      .limit(50);

    if (pendingError) {
      console.error('Error fetching pending logs:', pendingError);
      throw pendingError;
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      console.log('No pending sequence emails to process');
      return new Response(
        JSON.stringify({ message: 'No pending emails', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingLogs.length} pending sequence emails`);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const log of pendingLogs) {
      try {
        const step = log.email_sequence_steps as any;
        const sequence = log.email_sequences as any;
        const registration = log.registrations as any;

        // Skip if sequence or step is inactive
        if (!sequence.is_active || !step.is_active) {
          await supabaseAdmin
            .from('email_sequence_logs')
            .update({ status: 'skipped', error_message: 'Sequence or step inactive' })
            .eq('id', log.id);
          skipped++;
          continue;
        }

        // Fetch event details for template variables
        const { data: eventData } = await supabaseAdmin
          .from('event_details')
          .select('title, venue_address, event_time, parking_info')
          .eq('id', registration.event_id)
          .single();

        const eventTitle = eventData?.title || 'Cosmico';
        const firstName = getFirstName(registration.name);

        // Replace template variables in body
        const templateVars: Record<string, string> = {
          first_name: firstName,
          name: registration.name,
          venue_address: eventData?.venue_address || 'TBA',
          event_time: eventData?.event_time || 'TBA',
          parking_info: eventData?.parking_info || 'Details coming soon',
        };

        const processedBody = replaceTemplateVars(step.body_html, templateVars);

        // Add tracking to the email
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const trackingId = log.tracking_id;
        
        // Wrap links with click tracking
        const trackedBody = processedBody.replace(
          /href="([^"]+)"/g,
          (match, url) => {
            // Don't track mailto: or tel: links
            if (url.startsWith('mailto:') || url.startsWith('tel:')) {
              return match;
            }
            const encodedUrl = encodeURIComponent(url);
            return `href="${supabaseUrl}/functions/v1/track-email-click?t=${trackingId}&u=${encodedUrl}"`;
          }
        );

        // Add tracking pixel at the end
        const trackingPixel = `<img src="${supabaseUrl}/functions/v1/track-email-open?t=${trackingId}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`;

        // Determine email format (default to plain_text for backwards compatibility)
        const emailFormat = step.email_format || 'plain_text';
        
        let html: string;
        if (emailFormat === 'html') {
          // Use branded HTML template
          html = generateEmailWrapper(
            {
              eventTitle,
              heading: step.heading || undefined,
              firstName,
              signatureLine,
              signatureName,
              theme: 'light',
            },
            trackedBody + trackingPixel,
            templateConfig
          );
        } else {
          // Use plain text wrapper (more personal feel)
          html = generatePlainTextEmailWrapper(trackedBody + trackingPixel, templateConfig);
        }

        // Send email
        await resend.emails.send({
          from: 'The Cosmico Team <hello@example.invalid>',
          to: [registration.email],
          subject: step.subject,
          html,
        });

        // Update log as sent
        await supabaseAdmin
          .from('email_sequence_logs')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', log.id);

        // Also log to email_logs
        await supabaseAdmin.from('email_logs').insert({
          registration_id: registration.id,
          email_type: `sequence_${step.id}`,
          status: 'sent',
          email_content: html,
        });

        console.log(`Sent ${emailFormat} sequence email to ${registration.email}: ${step.subject}`);
        sent++;
      } catch (emailError: any) {
        console.error(`Failed to send to ${log.id}:`, emailError);
        await supabaseAdmin
          .from('email_sequence_logs')
          .update({ status: 'failed', error_message: emailError.message })
          .eq('id', log.id);
        failed++;
      }
    }

    const summary = { sent, skipped, failed, total: pendingLogs.length };
    console.log('Processing complete:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing sequence emails:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to process sequence emails' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
