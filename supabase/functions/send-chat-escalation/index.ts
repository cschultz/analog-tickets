import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { filterSuperAdminEmails } from "../_shared/admin-notify-recipients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML escape function to prevent XSS
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

const RequestSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const validation = RequestSchema.safeParse(rawBody);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { sessionId, name, email } = validation.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the chat log for this session
    const { data: chatLog, error: logError } = await supabase
      .from("chat_logs")
      .select("conversation")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (logError) {
      console.error("[send-chat-escalation] Error fetching chat log:", logError);
    }

    // Format conversation for email
    let conversationHtml = "<p><em>No conversation history available</em></p>";
    if (chatLog?.conversation && Array.isArray(chatLog.conversation)) {
      conversationHtml = chatLog.conversation
        .map((m: any) => `
          <div style="margin: 10px 0; padding: 10px; background: ${m.role === 'user' ? '#f0f0f0' : '#e3f2fd'}; border-radius: 5px;">
            <strong>${m.role === 'user' ? 'User' : 'AI'}:</strong>
            <p style="margin: 5px 0; white-space: pre-wrap;">${escapeHtml(String(m.content || ''))}</p>
          </div>
        `)
        .join("");
    }

    // Get admin emails
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      console.log("[send-chat-escalation] No admins found, skipping email");
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminIds = adminRoles.map((r) => r.user_id);
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("email")
      .in("id", adminIds);

    if (!adminProfiles || adminProfiles.length === 0) {
      console.log("[send-chat-escalation] No admin profiles found");
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    // Platform escalations only go to super admins. Event-scoped admins
    // should not receive chat escalation emails.
    const adminEmails = filterSuperAdminEmails(adminProfiles.map((p) => p.email));
    console.log("[send-chat-escalation] Recipients:", adminEmails);

    // Create the reply-to address that routes back through our system
    const replyToAddress = `chat+${sessionId}@example.invalid`;

    // Update chat log with escalation info
    await supabase
      .from("chat_logs")
      .update({
        escalation_email: email,
        escalation_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    // Send escalation emails
    await Promise.all(
      adminEmails.map((adminEmail) =>
        resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: adminEmail,
          reply_to: replyToAddress,
          subject: `🚨 Chat Escalation from ${escapeHtml(name)}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">🚨 Chat Escalation - Follow-up Needed</h2>
                <p style="margin: 10px 0 0; font-size: 14px; opacity: 0.9;">💡 Just reply to this email - it will be sent to the user automatically</p>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 0;">
                <p style="margin: 0; font-weight: bold;">This user requested personal follow-up from the chatbot.</p>
              </div>
              
              <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef;">
                <h3 style="margin-top: 0; color: #333;">Contact Information</h3>
                <p style="margin: 8px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
                <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
                <p style="margin: 8px 0; font-size: 12px; color: #666;"><strong>Session:</strong> ${escapeHtml(sessionId)}</p>
              </div>
              
              <div style="padding: 20px; border: 1px solid #e9ecef; border-top: none;">
                <h3 style="margin-top: 0; color: #333;">Conversation History</h3>
                ${conversationHtml}
              </div>
              
              <div style="background: #e8f5e9; padding: 15px; text-align: center; border: 1px solid #c8e6c9; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="margin: 0 0 10px; font-weight: bold; color: #2e7d32;">📧 Reply directly to this email</p>
                <p style="margin: 0; font-size: 13px; color: #555;">Your reply will be automatically sent to ${escapeHtml(name)} and logged for training data.</p>
              </div>
            </div>
          `,
        })
      )
    );

    console.log("[send-chat-escalation] Sent escalation emails to", adminEmails.length, "admins");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-chat-escalation] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
