import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  getFirstName,
  generateAnnouncementEmail,
} from "../_shared/email-template.ts";

// This function sends the "Your Guide to Cosmico Winter Escape" template
// automatically to new registrations after successful payment

const TEMPLATE_NAME = "announcement:Your Guide to Cosmico Winter Escape ❄️✨";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { registrationId } = await req.json();

    if (!registrationId) {
      console.error('[send-event-info-auto] Missing registrationId');
      return new Response(
        JSON.stringify({ error: 'Missing registrationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[send-event-info-auto] Processing registration: ${registrationId}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if auto-send is enabled and fetch signature settings
    const { data: emailSettings } = await supabaseAdmin
      .from('email_settings')
      .select('auto_send_event_info, signature_line, signature_name')
      .limit(1)
      .single();

    if (emailSettings?.auto_send_event_info === false) {
      console.log('[send-event-info-auto] Auto-send is disabled, skipping');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Auto-send disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Fetch the registration
    const { data: registration, error: regError } = await supabaseAdmin
      .from('registrations')
      .select('id, name, email')
      .eq('id', registrationId)
      .single();

    if (regError || !registration) {
      console.error('[send-event-info-auto] Registration not found:', regError);
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the email template
    const { data: template, error: templateError } = await supabaseAdmin
      .from('email_templates')
      .select('subject, heading, intro_text')
      .eq('template_type', TEMPLATE_NAME)
      .single();

    if (templateError || !template) {
      console.error('[send-event-info-auto] Template not found:', templateError);
      return new Response(
        JSON.stringify({ error: 'Email template not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch active event title
    const { data: eventData } = await supabaseAdmin
      .from('event_details')
      .select('title')
      .eq('is_active', true)
      .limit(1)
      .single();

    const eventTitle = eventData?.title || 'Cosmico Winter Escape';
    const firstName = getFirstName(registration.name);

    // Build the email HTML using the template content
    const messageContent = template.intro_text || '';
    
    const html = generateAnnouncementEmail(
      {
        eventTitle,
        firstName,
        signatureLine,
        signatureName,
      },
      messageContent,
      false // not a preview
    );

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

    console.log(`[send-event-info-auto] Sending event info to: ${registration.email}`);

    await resend.emails.send({
      from: 'The Cosmico Team <hello@example.invalid>',
      to: [registration.email],
      subject: template.subject,
      html: html,
    });

    // Log the email
    await supabaseAdmin
      .from('email_logs')
      .insert({
        registration_id: registrationId,
        email_type: 'event_info_auto',
        status: 'sent',
        email_content: html,
      });

    console.log(`[send-event-info-auto] Successfully sent event info to ${registration.email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[send-event-info-auto] Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to send event info email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
