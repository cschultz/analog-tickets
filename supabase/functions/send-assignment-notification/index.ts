import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { 
  corsHeaders, 
  escapeHtml, 
  getFirstName,
  generateEmailWrapper,
  fetchEmailTemplateConfig,
  buildColorsFromConfig,
} from "../_shared/email-template.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface AssignmentNotificationRequest {
  bookingIds?: string[];     // Specific booking IDs to notify
  sendAll?: boolean;         // Send to all unnotified assignments
  dryRun?: boolean;          // Preview without sending
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { bookingIds, sendAll, dryRun }: AssignmentNotificationRequest = await req.json();

    // Build query for bookings to notify
    let query = supabaseClient
      .from("lodging_bookings")
      .select(`
        id,
        email,
        zone_key,
        quantity,
        assignee_type,
        assignee_name,
        guest_notified,
        assigned_unit_id,
        registration_id,
        registrations!lodging_bookings_registration_id_fkey(name),
        accommodation_units!lodging_bookings_assigned_unit_id_fkey(
          unit_name,
          product_type,
          zone_key,
          bed_configuration,
          sleeps_max,
          accommodation_zones(zone_name)
        )
      `)
      .eq("guest_notified", false)
      .not("assigned_unit_id", "is", null);

    if (bookingIds && bookingIds.length > 0) {
      query = query.in("id", bookingIds);
    } else if (!sendAll) {
      return new Response(
        JSON.stringify({ error: "Provide bookingIds or sendAll=true" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { data: bookings, error: bookingError } = await query;

    if (bookingError) {
      console.error("[send-assignment-notification] Query error:", bookingError);
      throw bookingError;
    }

    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No unnotified assignments found", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch email template config
    const templateConfig = await fetchEmailTemplateConfig();
    const colors = buildColorsFromConfig(templateConfig);
    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const booking of bookings) {
      const unit = booking.accommodation_units as any;
      const zoneName = unit?.accommodation_zones?.zone_name || booking.zone_key;
      const unitName = unit?.unit_name || "Your assigned unit";
      const productType = unit?.product_type === "cabin" ? "Cabin" : "Tent";
      const bedConfig = unit?.bed_configuration || "";
      const sleepsMax = unit?.sleeps_max || 2;

      // Determine recipient name
      let recipientName: string;
      const registration = (booking.registrations as unknown as { name: string } | null);
      if (booking.assignee_name) {
        recipientName = booking.assignee_name;
      } else if (registration?.name) {
        recipientName = registration.name;
      } else {
        recipientName = booking.email.split("@")[0];
      }

      const firstName = getFirstName(recipientName);
      const assigneeType = booking.assignee_type || "guest";
      const isComp = assigneeType !== "guest";

      // Build email content
      const emailContent = `
        <div style="background: ${colors.surfaceAlt}; border-radius: 12px; padding: 24px; margin: 20px 0;">
          <h2 style="color: ${colors.primary}; font-size: 20px; margin: 0 0 16px; font-weight: 600;">
            Your Accommodation Assignment
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: ${colors.textMuted}; font-size: 14px;">Unit:</td>
              <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px; font-weight: 600;">${productType} ${escapeHtml(unitName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: ${colors.textMuted}; font-size: 14px;">Zone:</td>
              <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${escapeHtml(zoneName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: ${colors.textMuted}; font-size: 14px;">Configuration:</td>
              <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${escapeHtml(bedConfig)} (sleeps ${sleepsMax})</td>
            </tr>
          </table>
        </div>

        <p style="color: ${colors.text}; font-size: 16px; line-height: 1.6; margin: 20px 0;">
          ${isComp 
            ? `As a valued ${assigneeType}, we're pleased to confirm your accommodation for Cosmico 2026.`
            : `We're excited to share your accommodation details for Cosmico 2026!`
          }
        </p>

        <p style="color: ${colors.text}; font-size: 16px; line-height: 1.6; margin: 20px 0;">
          Check-in will begin at <strong>3:00 PM on Thursday, May 14th</strong>. We'll send a detailed guide closer to the event with directions, what to bring, and everything you need to know.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${siteUrl}/ticket-lookup" style="display: inline-block; background: ${colors.gradientPrimary}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
            View Your Tickets
          </a>
        </div>

        <p style="color: ${colors.textMuted}; font-size: 14px; line-height: 1.6; margin: 20px 0;">
          If you have any questions about your accommodation, don't hesitate to reach out.
        </p>
      `;

      const emailHtml = generateEmailWrapper(
        {
          eventTitle: "COSMICO",
          heading: "May 15–17, 2026 • Wildhaven Sonoma",
          firstName,
          signatureLine: "See you under the stars,",
          signatureName: "The Cosmico Team",
        },
        emailContent,
        templateConfig
      );

      if (dryRun) {
        results.push({ email: booking.email, success: true });
        continue;
      }

      try {
        await resend.emails.send({
          from: "Cosmico <hello@example.invalid>",
          to: [booking.email],
          subject: `Your Accommodation: ${productType} ${unitName} — Cosmico 2026`,
          html: emailHtml,
        });

        // Mark as notified
        await supabaseClient
          .from("lodging_bookings")
          .update({
            guest_notified: true,
            notified_at: new Date().toISOString(),
          })
          .eq("id", booking.id);

        results.push({ email: booking.email, success: true });
        console.log(`[send-assignment-notification] Sent to ${booking.email}`);
      } catch (emailError: any) {
        console.error(`[send-assignment-notification] Failed for ${booking.email}:`, emailError);
        results.push({ email: booking.email, success: false, error: emailError.message });
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        message: dryRun ? "Dry run complete" : "Notifications sent",
        sent: successCount,
        failed: failCount,
        total: results.length,
        results: dryRun ? undefined : results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[send-assignment-notification] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
