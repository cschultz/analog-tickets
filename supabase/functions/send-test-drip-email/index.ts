import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  generatePlainTextEmailWrapper,
  generateEmailWrapper,
  fetchEmailTemplateConfig,
  getFirstName,
} from "../_shared/email-template.ts";

// Replace template variables with sample data
function replaceTemplateVars(text: string | null, vars: Record<string, string>): string {
  if (!text) return '';
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

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

    const { stepId, testEmail } = await req.json();

    if (!stepId || !testEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: stepId, testEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the step details
    const { data: step, error: stepError } = await supabaseAdmin
      .from('email_sequence_steps')
      .select('*')
      .eq('id', stepId)
      .single();

    if (stepError || !step) {
      console.error('Step not found:', stepError);
      return new Response(
        JSON.stringify({ error: 'Email step not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Fetch active event
    const { data: eventData } = await supabaseAdmin
      .from('event_details')
      .select('title, event_date, venue_name')
      .eq('is_active', true)
      .limit(1)
      .single();

    const eventTitle = eventData?.title || 'Cosmico 2026';
    const eventDate = eventData?.event_date || 'May 15-17, 2026';
    const venueName = eventData?.venue_name || 'Wildhaven Sonoma';

    // Sample template variables for test email
    const sampleVars: Record<string, string> = {
      first_name: 'Sarah',
      name: 'Sarah Johnson',
      email: testEmail,
      ticket_type: 'Krewe — 3 Day Pass',
      event_date: eventDate,
      event_name: eventTitle,
      venue_name: venueName,
      quantity: '2',
      total_amount: '$1,498.00',
    };

    // Replace template variables
    const processedSubject = replaceTemplateVars(step.subject, sampleVars);
    const processedBody = replaceTemplateVars(step.body_html, sampleVars);

    // Build test banner
    const testBanner = `
      <div style="background: #FEF3C7; color: #92400E; padding: 16px; text-align: center; font-weight: bold; margin-bottom: 20px; border-radius: 8px; border: 2px dashed #F59E0B;">
        🧪 TEST EMAIL — This is a preview of the "${step.name}" drip email
      </div>
    `;

    // Determine email format (default to plain_text for backwards compatibility)
    const emailFormat = step.email_format || 'plain_text';
    
    let html: string;
    if (emailFormat === 'html') {
      // Use branded HTML template
      html = generateEmailWrapper(
        {
          eventTitle,
          heading: step.heading || undefined,
          firstName: 'Sarah',
          signatureLine,
          signatureName,
          theme: 'light',
        },
        testBanner + processedBody,
        templateConfig
      );
    } else {
      // Use plain text wrapper (more personal feel)
      html = generatePlainTextEmailWrapper(testBanner + processedBody, templateConfig);
    }

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

    console.log(`Sending test ${emailFormat} drip email to: ${testEmail} for step: ${step.name}`);

    await resend.emails.send({
      from: 'The Cosmico Team <hello@example.invalid>',
      to: [testEmail],
      subject: `[TEST] ${processedSubject}`,
      html,
    });

    console.log(`Successfully sent test drip email to ${testEmail}`);

    return new Response(
      JSON.stringify({ success: true, stepName: step.name, format: emailFormat }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending test drip email:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to send test email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
