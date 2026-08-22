import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  colors,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[ABANDONED-REGISTRATION] Starting abandoned registration email job');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check auth - allow service role key for cron OR admin user
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || "";
    
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!isServiceRole) {
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization header" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      const { data: { user }, error: authError } = await createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? ""
      ).auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      const { data: hasAdminRole } = await supabaseClient.rpc("has_role", {
        _user_id: user.id,
        _role: "admin"
      });

      if (!hasAdminRole) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Admin access required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }
      
      console.log('[ABANDONED-REGISTRATION] Admin verified');
    } else {
      console.log('[ABANDONED-REGISTRATION] Service role auth - cron job');
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Get the template for customization
    const { data: template } = await supabaseClient
      .from('email_templates')
      .select('*')
      .eq('template_type', 'abandoned_registration')
      .single();

    // CRITICAL: Get the active event - only send emails for active event registrations
    const { data: activeEvent, error: eventError } = await supabaseClient
      .from('event_details')
      .select('id, title, event_date, event_time, venue_name')
      .eq('is_active', true)
      .single();

    if (eventError || !activeEvent) {
      console.log('[ABANDONED-REGISTRATION] No active event found, aborting');
      return new Response(
        JSON.stringify({ error: 'No active event found', sent: 0, skipped: 0, errors: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ABANDONED-REGISTRATION] Processing for active event: ${activeEvent.title} (${activeEvent.id})`);

    // Look for registrations that are pending/abandoned in the last 48 hours
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    // Get abandoned/expired/declined registrations OR old pending ones
    const { data: abandonedRegs, error: regError } = await supabaseClient
      .from('registrations')
      .select('*, event_details!registrations_event_id_fkey(title, event_date, event_time, venue_name)')
      .eq('event_id', activeEvent.id)
      .eq('payment_status', 'pending')
      .gte('created_at', twoDaysAgo.toISOString());

    if (regError) throw regError;

    console.log(`[ABANDONED-REGISTRATION] Found ${abandonedRegs?.length || 0} pending registrations for ${activeEvent.title}`);

    const emailGroups: Record<string, any[]> = {};
    abandonedRegs?.forEach((reg) => {
      if (!emailGroups[reg.email]) emailGroups[reg.email] = [];
      emailGroups[reg.email].push(reg);
    });

    const results = { sent: 0, skipped: 0, errors: 0, details: [] as any[] };

    for (const [email, registrations] of Object.entries(emailGroups)) {
      try {
        // Check if user completed payment on ANY registration for this event
        const { data: paidRegs } = await supabaseClient
          .from('registrations')
          .select('id')
          .eq('email', email)
          .eq('event_id', activeEvent.id)
          .eq('payment_status', 'paid')
          .limit(1);

        if (paidRegs && paidRegs.length > 0) {
          console.log(`[ABANDONED-REGISTRATION] Skipping ${email} - already paid`);
          results.skipped++;
          continue;
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // SAFETY: Check if we've sent an abandoned email to ANY registration for this email
        // This prevents multiple emails if someone has multiple pending registrations
        const allRegIdsForEmail = registrations.map(r => r.id);
        const { data: recentEmails } = await supabaseClient
          .from('email_logs')
          .select('id')
          .eq('email_type', 'abandoned_registration')
          .in('registration_id', allRegIdsForEmail)
          .gte('created_at', sevenDaysAgo.toISOString())
          .limit(1);

        if (recentEmails && recentEmails.length > 0) {
          console.log(`[ABANDONED-REGISTRATION] Skipping ${email} - emailed recently (has ${registrations.length} pending registrations)`);
          results.skipped++;
          continue;
        }

        const reg = registrations[0];
        const eventDetails = reg.event_details;
        const eventTitle = eventDetails?.title || activeEvent.title;
        const firstName = getFirstName(reg.name);

        // Personalize based on checkout status
        let statusMessage = "";
        if (reg.checkout_status === 'declined') {
          statusMessage = "Your payment didn't go through (it happens—banks can be picky).";
        } else if (reg.checkout_status === 'expired') {
          statusMessage = "Your checkout session timed out before you could lock in your spot.";
        } else {
          statusMessage = "You were this close to joining us… but didn't hit complete.";
        }

        const buttonText = template?.button_text || "Complete Your Registration";

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: Georgia, serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <p style="font-size: 17px;">Hi ${escapeHtml(firstName)},</p>
            
            <p style="font-size: 17px;">Okay—real quick.</p>
            
            <p style="font-size: 17px;">It looks like something interrupted your registration for <strong>${escapeHtml(eventTitle)}</strong>.</p>
            
            <p style="font-size: 17px;">${statusMessage}</p>
            
            <p style="font-size: 17px;">Either way, we saved your spot for a moment—just in case it was a glitch and not a "no."</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${Deno.env.get('SITE_URL') || 'https://example.invalid'}/tickets" style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGold} 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">👉 ${escapeHtml(buttonText)}</a>
            </div>
            
            <p style="font-size: 17px;">If something's getting in your way, tell us—we might be able to fix it. Just hit reply, we're here.</p>
            
            <p style="font-size: 17px;">And if you did mean to pass this time, no pressure at all.</p>
            
            <p style="font-size: 17px;">But just so you know… <strong>${escapeHtml(eventTitle)}</strong> isn't one you'll want to hear about after it's over.</p>
            
            <p style="font-size: 16px; margin-top: 30px;">${escapeHtml(signatureLine)}<br><strong>${escapeHtml(signatureName)}</strong></p>
            
            <p style="font-size: 13px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              <em>P.S. Tech hiccups happen. Missing out doesn't have to.</em>
            </p>
          </body>
          </html>
        `;

        // Use template subject or personalized default
        let subjectLine = template?.subject || "Did something go wrong? Let us know!";
        if (reg.checkout_status === 'declined' && !template?.subject) {
          subjectLine = "Having trouble with checkout? We can help!";
        }
        subjectLine = subjectLine.replace(/\{\{name\}\}/g, firstName);
        subjectLine = subjectLine.replace(/\{\{event_title\}\}/g, eventTitle);

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            from: `${signatureName} <hello@example.invalid>`, 
            reply_to: 'hello@example.invalid',
            to: [email], 
            subject: subjectLine, 
            html: emailHtml 
          }),
        });

        await supabaseClient.from('email_logs').insert({ registration_id: reg.id, email_type: 'abandoned_registration', status: 'sent', email_content: emailHtml });
        console.log(`[ABANDONED-REGISTRATION] Sent email to ${email}`);
        results.sent++;
        results.details.push({ email, name: reg.name, status: reg.checkout_status });
      } catch (error) {
        console.error(`[ABANDONED-REGISTRATION] Error processing ${email}:`, error);
        results.errors++;
      }
    }

    console.log(`[ABANDONED-REGISTRATION] Complete: ${results.sent} sent, ${results.skipped} skipped, ${results.errors} errors`);
    return new Response(JSON.stringify(results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[ABANDONED-REGISTRATION] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
