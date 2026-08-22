import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML escape function
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("[receive-chat-reply] Received webhook:", JSON.stringify(payload, null, 2));

    // Extract email data from Resend inbound webhook
    const webhookData = payload.data || payload;
    const fromEmail = webhookData.from?.toLowerCase() || "";
    const toEmail = webhookData.to?.[0]?.toLowerCase() || webhookData.to?.toLowerCase() || "";
    const subject = webhookData.subject || "";
    const bodyText = webhookData.text || "";
    const bodyHtml = webhookData.html || "";

    // Extract session ID from the reply-to address
    // Format: chat+{sessionId}@example.invalid
    const sessionMatch = toEmail.match(/chat\+([^@]+)@/i);
    if (!sessionMatch) {
      console.log("[receive-chat-reply] No valid session ID in to address:", toEmail);
      return new Response(
        JSON.stringify({ error: "Invalid reply address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionId = sessionMatch[1];
    console.log("[receive-chat-reply] Extracted session ID:", sessionId);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find the chat log for this session
    const { data: chatLog, error: logError } = await supabase
      .from("chat_logs")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (logError || !chatLog) {
      console.error("[receive-chat-reply] Chat log not found:", logError);
      return new Response(
        JSON.stringify({ error: "Chat session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!chatLog.user_email) {
      console.error("[receive-chat-reply] No user email in chat log");
      return new Response(
        JSON.stringify({ error: "No user email to reply to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find admin user by email
    const adminUserId = await findAdminByEmail(supabase, fromEmail);

    // Store the admin reply
    const { error: insertError } = await supabase
      .from("chat_replies")
      .insert({
        session_id: sessionId,
        direction: "admin_to_user",
        from_email: fromEmail,
        to_email: chatLog.user_email,
        subject: subject,
        body_text: bodyText,
        body_html: bodyHtml,
        admin_user_id: adminUserId,
      });

    if (insertError) {
      console.error("[receive-chat-reply] Error storing reply:", insertError);
    }

    // Update chat log status
    await supabase
      .from("chat_logs")
      .update({
        escalation_status: "replied",
        admin_replied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    // Clean up the reply text (remove quoted content)
    const cleanedReply = cleanReplyText(bodyText);

    // Send the reply to the user
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [chatLog.user_email],
      reply_to: `chat+${sessionId}@example.invalid`,
      subject: `Re: Your Cosmico Inquiry`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Thanks for reaching out!</h2>
          </div>
          
          <div style="padding: 25px; background: #f8f9fa; border: 1px solid #e9ecef;">
            <p style="margin-top: 0;">Hi ${escapeHtml(chatLog.user_name || 'there')},</p>
            
            <div style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(cleanedReply)}</div>
            
            <p style="margin-bottom: 0; margin-top: 25px;">
              Best,<br>
              <strong>The Cosmico Team</strong>
            </p>
          </div>
          
          <div style="padding: 15px; background: #f0f0f0; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 0;">Questions? Just reply to this email.</p>
          </div>
        </div>
      `,
    });

    if (emailError) {
      console.error("[receive-chat-reply] Error sending to user:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send reply to user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[receive-chat-reply] Reply sent to user:", chatLog.user_email);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[receive-chat-reply] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Find admin user ID by email (checking aliases too)
async function findAdminByEmail(supabase: any, email: string): Promise<string | null> {
  // Check admin email aliases first
  const { data: alias } = await supabase
    .from("admin_email_aliases")
    .select("admin_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (alias) return alias.admin_user_id;

  // Check profiles directly
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  return profile?.id || null;
}

// Clean up reply text by removing quoted content
function cleanReplyText(text: string): string {
  if (!text) return "";
  
  // Remove lines starting with > (quoted text)
  const lines = text.split("\n");
  const cleanedLines: string[] = [];
  let foundQuote = false;
  
  for (const line of lines) {
    // Stop at common quote indicators
    if (
      line.startsWith(">") ||
      line.startsWith("On ") && line.includes(" wrote:") ||
      line.includes("From:") ||
      line.includes("Sent:") ||
      line.includes("-----Original Message-----") ||
      line.includes("________________________________")
    ) {
      foundQuote = true;
      continue;
    }
    
    if (!foundQuote) {
      cleanedLines.push(line);
    }
  }
  
  return cleanedLines.join("\n").trim();
}
