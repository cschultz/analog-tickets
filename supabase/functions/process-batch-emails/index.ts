import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: Resend allows 100 emails/second on paid plans, 
// we'll be conservative with 10/second batches with delays
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500; // 1.5 seconds between batches
const MAX_RETRIES = 3;

interface EmailJob {
  id: string;
  to: string;
  name: string;
  subject: string;
  html: string;
  registrationId?: string;
  campaignId?: string;
}

interface BatchResult {
  success: number;
  failed: number;
  suppressed: number;
  errors: Array<{ email: string; error: string }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWithRetry(
  resend: Resend,
  email: EmailJob,
  retries = MAX_RETRIES
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [email.to],
        subject: email.subject,
        html: email.html,
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return { success: true };
    } catch (error: any) {
      console.error(`Attempt ${attempt}/${retries} failed for ${email.to}:`, error.message);
      
      // Don't retry for permanent failures
      if (error.message?.includes("unsubscribed") || 
          error.message?.includes("bounced") ||
          error.message?.includes("invalid")) {
        return { success: false, error: error.message };
      }
      
      if (attempt < retries) {
        await sleep(1000 * attempt); // Exponential backoff
      } else {
        return { success: false, error: error.message };
      }
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { emails, campaignId }: { emails: EmailJob[]; campaignId?: string } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No emails provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-batch-emails] Starting batch of ${emails.length} emails`);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Start job tracking
    const { data: jobData } = await supabaseAdmin.rpc("start_scheduled_job", {
      p_job_name: "batch_email",
      p_metadata: { campaign_id: campaignId, total_emails: emails.length },
    });
    const jobId = jobData;

    // Get suppressed emails (bounced or unsubscribed)
    const emailAddresses = emails.map(e => e.to.toLowerCase());
    const { data: suppressedEmails } = await supabaseAdmin
      .from("email_unsubscribes")
      .select("email")
      .in("email", emailAddresses);

    const { data: bouncedEmails } = await supabaseAdmin
      .from("email_bounces")
      .select("email")
      .in("email", emailAddresses)
      .eq("bounce_type", "hard");

    const suppressedSet = new Set([
      ...(suppressedEmails?.map(e => e.email.toLowerCase()) || []),
      ...(bouncedEmails?.map(e => e.email.toLowerCase()) || []),
    ]);

    const result: BatchResult = {
      success: 0,
      failed: 0,
      suppressed: 0,
      errors: [],
    };

    // Filter out suppressed emails
    const validEmails = emails.filter(email => {
      if (suppressedSet.has(email.to.toLowerCase())) {
        result.suppressed++;
        console.log(`[process-batch-emails] Skipping suppressed email: ${email.to}`);
        return false;
      }
      return true;
    });

    // Process in batches
    for (let i = 0; i < validEmails.length; i += BATCH_SIZE) {
      const batch = validEmails.slice(i, i + BATCH_SIZE);
      console.log(`[process-batch-emails] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validEmails.length / BATCH_SIZE)}`);

      // Send batch in parallel
      const batchPromises = batch.map(async (email) => {
        const sendResult = await sendWithRetry(resend, email);
        
        // Log the email
        if (email.registrationId) {
          await supabaseAdmin.from("email_logs").insert({
            registration_id: email.registrationId,
            email_type: "bulk_announcement",
            status: sendResult.success ? "sent" : "failed",
            error_message: sendResult.error,
            campaign_id: email.campaignId || campaignId,
            sent_by: user.id,
          });
        }

        return { email: email.to, ...sendResult };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const r of batchResults) {
        if (r.success) {
          result.success++;
        } else {
          result.failed++;
          result.errors.push({ email: r.email, error: r.error || "Unknown error" });
        }
      }

      // Delay between batches (except for last batch)
      if (i + BATCH_SIZE < validEmails.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[process-batch-emails] Completed: ${result.success} sent, ${result.failed} failed, ${result.suppressed} suppressed in ${duration}ms`);

    // Complete job tracking
    if (jobId) {
      await supabaseAdmin.rpc("complete_scheduled_job", {
        p_job_id: jobId,
        p_status: result.failed > 0 ? "partial" : "success",
        p_records_processed: result.success,
        p_error_message: result.failed > 0 ? `${result.failed} emails failed` : null,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats: result,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[process-batch-emails] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
