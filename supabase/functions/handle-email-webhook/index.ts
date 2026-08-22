import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

// Resend webhook event types
type ResendEventType = 
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message: string;
      type: string; // 'hard' or 'soft'
    };
    click?: {
      link: string;
      timestamp: string;
    };
  };
}

// Verify Resend webhook signature
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  
  try {
    // Resend uses svix for webhooks
    const parts = signature.split(",");
    const signatureParts: Record<string, string> = {};
    
    for (const part of parts) {
      const [key, value] = part.split("=");
      signatureParts[key.trim()] = value;
    }
    
    const timestamp = signatureParts["t"];
    const v1Signature = signatureParts["v1"];
    
    if (!timestamp || !v1Signature) return false;
    
    // Check timestamp is within 5 minutes
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
      console.warn("[handle-email-webhook] Timestamp too old");
      return false;
    }
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(signedPayload)
      .digest("base64");
    
    return v1Signature === expectedSignature;
  } catch (error) {
    console.error("[handle-email-webhook] Signature verification error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const rawBody = await req.text();
    const signature = req.headers.get("svix-signature");
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");

    // Verify signature if secret is configured
    if (webhookSecret && !verifySignature(rawBody, signature, webhookSecret)) {
      console.error("[handle-email-webhook] Invalid signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: ResendWebhookPayload = JSON.parse(rawBody);
    console.log(`[handle-email-webhook] Received event: ${payload.type}`);

    const email = payload.data.to[0];

    switch (payload.type) {
      case "email.bounced": {
        const bounceType = payload.data.bounce?.type === "hard" ? "hard" : "soft";
        const reason = payload.data.bounce?.message || "Unknown bounce reason";

        // Log the bounce
        await supabase.from("email_bounces").insert({
          email: email,
          bounce_type: bounceType,
          reason: reason,
          source: "resend_webhook",
          event_payload: payload,
        });

        console.log(`[handle-email-webhook] Recorded ${bounceType} bounce for ${email}`);

        // For hard bounces, auto-add to unsubscribe list
        if (bounceType === "hard") {
          const { error } = await supabase.from("email_unsubscribes").upsert({
            email: email,
            reason: `Hard bounce: ${reason}`,
            source: "bounce",
          }, { onConflict: "email" });

          if (!error) {
            console.log(`[handle-email-webhook] Auto-unsubscribed hard bounce: ${email}`);
          }
        }

        // Create admin notification for hard bounces
        if (bounceType === "hard") {
          await supabase.from("admin_notifications").insert({
            type: "email_bounce",
            title: "Email Hard Bounce",
            message: `Email to ${email} permanently bounced: ${reason}`,
            metadata: { email, bounce_type: bounceType, reason },
          });
        }
        break;
      }

      case "email.complained": {
        // Spam complaint - immediately unsubscribe
        await supabase.from("email_bounces").insert({
          email: email,
          bounce_type: "complaint",
          reason: "Marked as spam",
          source: "resend_webhook",
          event_payload: payload,
        });

        await supabase.from("email_unsubscribes").upsert({
          email: email,
          reason: "Spam complaint",
          source: "bounce",
        }, { onConflict: "email" });

        // Notify admin of spam complaint
        await supabase.from("admin_notifications").insert({
          type: "spam_complaint",
          title: "Spam Complaint Received",
          message: `${email} marked your email as spam. They have been unsubscribed.`,
          metadata: { email },
        });

        console.log(`[handle-email-webhook] Recorded spam complaint for ${email}`);
        break;
      }

      case "email.delivered": {
        console.log(`[handle-email-webhook] Email delivered to ${email}`);
        // Could update email_logs status if needed
        break;
      }

      case "email.opened": {
        console.log(`[handle-email-webhook] Email opened by ${email}`);
        // Track opens if needed for analytics
        break;
      }

      case "email.clicked": {
        const link = payload.data.click?.link;
        console.log(`[handle-email-webhook] Email clicked by ${email}: ${link}`);
        
        // Auto-segment clickers in Flodesk for retargeting
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
          
          await fetch(`${supabaseUrl}/functions/v1/segment-on-click`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              email,
              action: "email_link_click",
              source: "resend_webhook",
            }),
          });
          console.log(`[handle-email-webhook] Triggered segment-on-click for ${email}`);
        } catch (segErr) {
          console.error("[handle-email-webhook] Failed to trigger segment-on-click:", segErr);
        }
        break;
      }

      default:
        console.log(`[handle-email-webhook] Unhandled event type: ${payload.type}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[handle-email-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
