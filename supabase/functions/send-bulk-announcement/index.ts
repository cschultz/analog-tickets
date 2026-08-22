import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  colors,
  generateAnnouncementEmail,
} from "../_shared/email-template.ts";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

// Input validation schema - registrationId is optional for preview emails
const announcementSchema = z.object({
  to: z.string().email(),
  name: z.string().trim().max(200),
  subject: z.string().trim().min(1).max(500),
  message: z.string().trim().min(1).max(50000),
  registrationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(), // Optional campaign tracking
  isHtml: z.boolean().optional().default(false),
  isPreview: z.boolean().optional().default(false),
});

// Sanitize HTML content - allow safe tags, remove potentially dangerous ones
function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  
  // Remove data: URLs in src attributes (can be used for XSS)
  sanitized = sanitized.replace(/src\s*=\s*["']data:[^"']*["']/gi, 'src=""');
  
  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gis, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)[^>]*\/?>/gi, '');
  
  return sanitized;
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
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has admin role
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error('Authorization check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const rawBody = await req.json();
    const validationResult = announcementSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, name, subject, message, registrationId, campaignId, isHtml, isPreview } = validationResult.data;

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch email signature settings
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

    const eventTitle = eventData?.title || 'Event Announcement';
    const firstName = getFirstName(name);

    // Process message content - sanitize HTML or escape plain text
    let messageContent: string;
    if (isHtml) {
      messageContent = sanitizeHtml(message);
    } else {
      messageContent = message.split('\n').map((line: string) => `<p>${escapeHtml(line)}</p>`).join('');
    }

    // Use the shared announcement email template
    const html = generateAnnouncementEmail(
      {
        eventTitle,
        firstName,
        signatureLine,
        signatureName,
      },
      messageContent,
      isPreview
    );

    console.log(`Sending ${isPreview ? 'preview ' : ''}announcement email to: ${to}`);

    // Get sender config for guest emails (announcements go to guests)
    const senderConfig = await getEmailSenderConfig('guest');

    await resend.emails.send({
      from: senderConfig.fromAddress,
      to: [to],
      subject: subject,
      html: html,
    });

    // Log the email send (skip for preview emails without registration ID)
    if (registrationId) {
      const logData: Record<string, unknown> = {
        registration_id: registrationId,
        email_type: isPreview ? 'bulk_announcement_preview' : 'bulk_announcement',
        status: 'sent',
        email_content: html,
        sent_by: user.id,
      };
      
      // Add campaign_id if provided
      if (campaignId) {
        logData.campaign_id = campaignId;
      }
      
      const { error: logError } = await supabaseAdmin
        .from('email_logs')
        .insert(logData);
      
      if (logError) {
        console.error('Error logging email:', logError);
      }
    }

    console.log(`Successfully sent ${isPreview ? 'preview ' : ''}announcement to ${to}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending announcement:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to send announcement' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
