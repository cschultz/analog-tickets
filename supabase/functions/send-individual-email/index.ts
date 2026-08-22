import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  generateEmailWrapper,
} from "../_shared/email-template.ts";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin role
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, name, subject, body, registrationId, cc, leadEmail } = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch email settings
    const { data: emailSettings } = await supabaseAdmin
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Fetch active event title
    const { data: eventData } = await supabaseAdmin
      .from('event_details')
      .select('title')
      .eq('is_active', true)
      .limit(1)
      .single();

    const eventTitle = eventData?.title || 'Cosmico';
    const firstName = getFirstName(name);

    // Generate email HTML
    const html = generateEmailWrapper(
      {
        eventTitle,
        firstName,
        signatureLine,
        signatureName,
      },
      body
    );

    // Get sender config for guest emails (individual emails are guest-facing)
    const senderConfig = await getEmailSenderConfig('guest');

    console.log(`Sending individual email to: ${to}`);

    // Build CC list
    const ccList: string[] = [];
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc : [cc];
      ccList.push(...ccAddresses.filter((e: string) => e && e.includes('@')));
    }

    await resend.emails.send({
      from: senderConfig.fromAddress,
      to: [to],
      subject,
      html,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      ...(senderConfig.replyTo ? { reply_to: senderConfig.replyTo } : {}),
    });

    // Log the email
    if (registrationId) {
      await supabaseAdmin.from('individual_emails').insert({
        registration_id: registrationId,
        sent_by: user.id,
        subject,
        body_html: body,
        status: 'sent',
      });

      await supabaseAdmin.from('email_logs').insert({
        registration_id: registrationId,
        email_type: 'individual',
        status: 'sent',
        email_content: html,
        sent_by: user.id,
      });
    }

    // Log to lead_notes if leadEmail is provided (for CRM tracking)
    if (leadEmail) {
      const { data: leadTracking } = await supabaseAdmin
        .from('lead_tracking')
        .select('id')
        .eq('email', leadEmail)
        .maybeSingle();

      if (leadTracking) {
        await supabaseAdmin.from('lead_notes').insert({
          lead_id: leadTracking.id,
          note: `✉️ Email sent — Subject: "${subject}"${ccList.length > 0 ? ` (CC: ${ccList.join(', ')})` : ''}`,
          created_by: user.id,
        });

        // Auto-update status from 'new' to 'contacted'
        await supabaseAdmin.from('lead_tracking')
          .update({ last_contacted_at: new Date().toISOString(), status: 'contacted' })
          .eq('id', leadTracking.id)
          .eq('status', 'new');
      }
    }

    console.log(`Successfully sent individual email to ${to}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending individual email:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to send email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
