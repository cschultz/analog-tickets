import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  generateEmailWrapper,
  fetchEmailTemplateConfig,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing authorization header" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "").auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Invalid or expired token" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });

    const { data: hasAdminRole } = await supabaseClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!hasAdminRole) return new Response(JSON.stringify({ error: "Unauthorized" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const { data: emailSettings } = await supabaseClient.from('email_settings').select('signature_line, signature_name').limit(1).single();
    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Fetch shared email template config
    const templateConfig = await fetchEmailTemplateConfig();

    const { data: template } = await supabaseClient.from('email_templates').select('*').eq('template_type', 'post_event_thank_you').single();
    if (!template) return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];

    const { data: pastEvents } = await supabaseClient.from('event_details').select('*').eq('event_date', yesterdayDate).eq('status', 'published');
    if (!pastEvents?.length) return new Response(JSON.stringify({ message: 'No events from yesterday', sent: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const results = { sent: 0, skipped: 0, errors: 0, details: [] as any[] };

    for (const event of pastEvents) {
      const { data: attendees } = await supabaseClient.from('registrations').select('*').eq('event_id', event.id).eq('payment_status', 'paid');
      const emailGroups: Record<string, any[]> = {};
      attendees?.forEach((reg) => { if (!emailGroups[reg.email]) emailGroups[reg.email] = []; emailGroups[reg.email].push(reg); });

      for (const [email, registrations] of Object.entries(emailGroups)) {
        try {
          const reg = registrations[0];
          const firstName = getFirstName(reg.name);

          const { data: existingEmails } = await supabaseClient.from('email_logs').select('id').eq('email_type', 'post_event_thank_you').eq('registration_id', reg.id).limit(1);
          if (existingEmails?.length) { results.skipped++; continue; }

          const surveyUrl = `${Deno.env.get('SITE_URL') || 'https://example.invalid'}/survey?registration_id=${reg.id}`;
          const eventDate = new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: "America/Los_Angeles" });

          // Use shared email wrapper instead of inline HTML
          const emailContent = `
            <p>It was wonderful having you at <strong>${escapeHtml(event.title)}</strong> on ${eventDate}.</p>
            <p>We hope you had an amazing experience and would love to hear your thoughts.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${surveyUrl}" style="display: inline-block; background: linear-gradient(135deg, #A37552 0%, #C7A97A 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold;">${template.button_text || 'Share Your Feedback'}</a>
            </div>
          `;

          const emailHtml = generateEmailWrapper({
            eventTitle: event.title,
            heading: template.heading || 'Thank You for Joining Us!',
            firstName,
            signatureLine,
            signatureName,
            theme: 'light',
          }, emailContent, templateConfig);

          await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'The Cosmico Team <hello@example.invalid>', to: [email], subject: template.subject?.replace('{{event_title}}', event.title) || `Thank You for Attending ${event.title}!`, html: emailHtml }) });
          await supabaseClient.from('email_logs').insert({ registration_id: reg.id, email_type: 'post_event_thank_you', status: 'sent', email_content: emailHtml });
          results.sent++;
        } catch { results.errors++; }
      }
    }

    return new Response(JSON.stringify(results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});