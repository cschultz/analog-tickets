import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[OFFER-URGENCY-NUDGE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").single();
    if (!roleData) throw new Error("Admin access required");

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run === true;
    const offerIds: string[] | undefined = Array.isArray(body?.offer_ids) ? body.offer_ids : undefined;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey && !dryRun) throw new Error("RESEND_API_KEY not configured");
    const resend = resendKey ? new Resend(resendKey) : null;

    let query = supabaseAdmin
      .from("custom_offers")
      .select("id, offer_token, recipient_email, recipient_name, expires_at, total_amount, status")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());
    if (offerIds && offerIds.length) query = query.in("id", offerIds);

    const { data: offers, error } = await query;
    if (error) throw error;
    log("Pending offers found", { count: offers?.length || 0 });

    if (!offers || offers.length === 0) {
      return new Response(JSON.stringify({ success: true, emails_sent: 0, message: "No pending offers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
    let sent = 0;
    const errors: string[] = [];
    const now = new Date();

    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i];
      try {
        const offerUrl = `${siteUrl}/offer/${offer.offer_token}`;
        const firstName = offer.recipient_name?.split(" ")[0] || "there";

        const html = `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.7; font-size: 16px;">
  <p>Hi ${firstName},</p>
  <p>Just a quick note — the custom package we put together for you for Cosmico is still sitting open, and we'd love to get you locked in.</p>
  <p>We're capped at 700 people for the whole weekend, and inventory is moving fast. Once this offer closes, we can't guarantee the same hold or pricing.</p>
  <p style="margin: 28px 0;">
    <a href="${offerUrl}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 28px; text-decoration: none; letter-spacing: 0.04em; text-transform: uppercase; font-size: 14px;">Review Your Offer</a>
  </p>
  <p>If something's holding you up — questions, timing, anything — just reply. We'll make it work.</p>
  <p style="margin-top: 32px;">✌️ &amp; ❤️,<br/>Chris &amp; Anne</p>
</div>`.trim();

        if (dryRun) {
          log("DRY RUN", { to: offer.recipient_email });
          sent++;
        } else {
          await resend!.emails.send({
            from: "The Cosmico Team <hello@example.invalid>",
            reply_to: "hello@example.invalid",
            to: [offer.recipient_email],
            subject: `Your Cosmico offer is still open — let's lock it in`,
            html,
          });
          sent++;
          log("Sent", { to: offer.recipient_email });
        }

        // Resend rate limit: 2 emails / 1100ms
        if ((i + 1) % 2 === 0 && i < offers.length - 1) {
          await new Promise((r) => setTimeout(r, 1100));
        }
      } catch (e: any) {
        console.error("Send error", offer.id, e);
        errors.push(`${offer.recipient_email}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: offers.length, emails_sent: sent, errors: errors.length ? errors : undefined, dry_run: dryRun }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    log("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
