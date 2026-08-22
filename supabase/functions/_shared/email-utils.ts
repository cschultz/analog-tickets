// Shared email utilities for edge functions
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Lazily initialized Resend client
let _resendClient: Resend | null = null;

/**
 * Get a configured Resend client instance
 */
export function getResendClient(): Resend {
  if (!_resendClient) {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }
    
    _resendClient = new Resend(apiKey);
  }
  
  return _resendClient;
}

/**
 * Create a new Resend client (for when you need a fresh instance)
 */
export function createResendClient(): Resend {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  
  return new Resend(apiKey);
}

/**
 * Email sending options
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: string;
  }>;
}


/**
 * Get email settings from database
 */
export async function getEmailSettings(): Promise<{
  signature_name: string;
  signature_line: string;
  guest_from_name?: string;
  guest_from_email?: string;
  talent_from_name?: string;
  talent_from_email?: string;
  production_from_name?: string;
  production_from_email?: string;
  default_cc_emails?: string[];
} | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  const { data } = await supabase
    .from("email_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  
  return data;
}

/**
 * Send an email with consistent error handling
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const resend = getResendClient();
    
    const { data, error } = await resend.emails.send({
      from: options.from || `The Cosmico Team <noreply@example.invalid>`,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      reply_to: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    });
    
    if (error) {
      console.error("[email] Send failed:", error);
      return { success: false, error: error.message };
    }
    
    return { success: true, id: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[email] Unexpected error:", message);
    return { success: false, error: message };
  }
}

/**
 * Log email to database
 */
export async function logEmailSent(
  registrationId: string,
  emailType: string,
  status: "sent" | "failed" = "sent",
  errorMessage?: string,
  campaignId?: string
): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  await supabase.from("email_logs").insert({
    registration_id: registrationId,
    email_type: emailType,
    status,
    error_message: errorMessage,
    campaign_id: campaignId,
  });
}

/**
 * Check email rate limit
 */
export async function checkEmailRateLimit(
  registrationId: string,
  emailType: string,
  cooldownMinutes: number = 60
): Promise<boolean> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  const { data } = await supabase
    .from("email_rate_limits")
    .select("last_sent_at, cooldown_minutes")
    .eq("registration_id", registrationId)
    .eq("email_type", emailType)
    .maybeSingle();
  
  if (!data) return true; // No rate limit exists
  
  const lastSent = new Date(data.last_sent_at);
  const cooldown = data.cooldown_minutes || cooldownMinutes;
  const now = new Date();
  
  const minutesSinceLast = (now.getTime() - lastSent.getTime()) / (1000 * 60);
  
  return minutesSinceLast >= cooldown;
}

/**
 * Update email rate limit
 */
export async function updateEmailRateLimit(
  registrationId: string,
  emailType: string,
  cooldownMinutes: number = 60
): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  await supabase
    .from("email_rate_limits")
    .upsert({
      registration_id: registrationId,
      email_type: emailType,
      last_sent_at: new Date().toISOString(),
      cooldown_minutes: cooldownMinutes,
    }, {
      onConflict: "registration_id,email_type",
    });
}
