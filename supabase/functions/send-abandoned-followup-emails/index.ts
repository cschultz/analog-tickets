import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  generateEmailWrapper,
  fetchEmailTemplateConfig,
  colors,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { data: template } = await supabaseClient.from('email_templates').select('*').eq('template_type', 'abandoned_registration_followup').single();
    if (!template) return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStart = new Date(threeDaysAgo.setHours(0, 0, 0, 0)).toISOString();
    const threeDaysAgoEnd = new Date(threeDaysAgo.setHours(23, 59, 59, 999)).toISOString();

    const { data: firstEmails } = await supabaseClient.from('email_logs').select('registration_id').eq('email_type', 'abandoned_registration').eq('status', 'sent').gte('created_at', threeDaysAgoStart).lte('created_at', threeDaysAgoEnd);
    if (!firstEmails?.length) return new Response(JSON.stringify({ message: 'No first emails sent 3 days ago', sent: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: stillPendingRegs } = await supabaseClient.from('registrations').select('*, event_details!registrations_event_id_fkey(title, event_date, venue_name)').in('id', firstEmails.map(e => e.registration_id)).in('payment_status', ['pending', 'failed']);

    const results = { sent: 0, skipped: 0, errors: 0, details: [] as any[] };
    const emailGroups: Record<string, any[]> = {};
    stillPendingRegs?.forEach((reg) => { if (!emailGroups[reg.email]) emailGroups[reg.email] = []; emailGroups[reg.email].push(reg); });

    for (const [email, registrations] of Object.entries(emailGroups)) {
      try {
        const { data: paidRegs } = await supabaseClient.from('registrations').select('id').eq('email', email).eq('payment_status', 'paid').limit(1);
        if (paidRegs?.length) { results.skipped++; continue; }

        const { data: followupEmails } = await supabaseClient.from('email_logs').select('id').eq('email_type', 'abandoned_registration_followup').eq('registration_id', registrations[0].id).limit(1);
        if (followupEmails?.length) { results.skipped++; continue; }

        const reg = registrations[0];
        const eventDetails = reg.event_details;
        const eventTitle = eventDetails?.title || 'Cosmico';
        const firstName = getFirstName(reg.name);

        // Use shared email wrapper instead of inline HTML
        const emailContent = `
          <p style="font-size: 17px;">Quick heads up—</p>
          
          <p style="font-size: 17px;">We've been holding your spot for <strong>${escapeHtml(eventTitle)}</strong>, but we're about to release it.</p>
          
          <p style="font-size: 17px;">Not to be dramatic… but this is the moment you either lock it in or miss it.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${Deno.env.get('SITE_URL') || 'https://example.invalid'}/tickets" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 36px; text-decoration: none; font-weight: 600; letter-spacing: 0.04em;">${template.button_text || 'Complete my registration'}</a>
          </div>
          
          <p style="font-size: 17px;">If something got in the way earlier, you've still got time to jump back in.</p>
          
          <p style="font-size: 17px;">And if you've been on the fence? This is your sign.</p>
          
          <p style="font-size: 17px;">After this, we can't promise there'll be another chance to grab your spot.</p>
          
          <p style="font-size: 13px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            <em>P.S. We'd hate for you to hear about it after the fact and wish you were there.</em>
          </p>
        `;

        const emailHtml = generateEmailWrapper({
          eventTitle,
          heading: '',
          firstName,
          signatureLine,
          signatureName,
          theme: 'light',
        }, emailContent, templateConfig);

        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'The Cosmico Team <hello@example.invalid>', to: [email], subject: template.subject || 'Last Chance: Complete Your Registration', html: emailHtml }) });
        await supabaseClient.from('email_logs').insert({ registration_id: reg.id, email_type: 'abandoned_registration_followup', status: 'sent', email_content: emailHtml });
        results.sent++;
      } catch { results.errors++; }
    }

    return new Response(JSON.stringify(results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});