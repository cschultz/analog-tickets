import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { filterSuperAdminEmails } from "../_shared/admin-notify-recipients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VolunteerInfo {
  id: string;
  name: string;
  email: string;
  contribution_types: string[];
  message: string | null;
  status: string;
  created_at: string;
}

interface SupportMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  status: string | null;
  created_at: string;
}

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

interface WeeklyStats {
  volunteers: {
    newThisWeek: number;
    pendingFollowup: number;
    contacted: number;
    allTime: number;
    recentSubmissions: VolunteerInfo[];
  };
  support: {
    newThisWeek: number;
    pendingReply: number;
    recentMessages: SupportMessage[];
  };
  contact: {
    newThisWeek: number;
    recentSubmissions: ContactSubmission[];
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[WEEKLY-DIGEST] Starting weekly community digest generation");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // Get all admin emails
    const { data: adminUsers, error: adminError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminError) {
      throw new Error(`Failed to fetch admins: ${adminError.message}`);
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.log("[WEEKLY-DIGEST] No admin users found");
      return new Response(JSON.stringify({ message: "No admins to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin emails from profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email")
      .in("id", adminUsers.map(u => u.user_id));

    if (profilesError || !profiles) {
      throw new Error(`Failed to fetch admin profiles: ${profilesError?.message}`);
    }

    // Platform digest only goes to super admins (event-only admins excluded)
    const adminEmails = filterSuperAdminEmails(profiles.map(p => p.email));
    console.log(`[WEEKLY-DIGEST] Sending to ${adminEmails.length} super admin(s):`, adminEmails);

    // Calculate time ranges
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(oneWeekAgo);
    weekStart.setHours(0, 0, 0, 0);

    // Fetch volunteer interests
    const { data: allVolunteers, error: volunteerError } = await supabase
      .from("volunteer_interests")
      .select("id, name, email, contribution_types, message, status, created_at")
      .order("created_at", { ascending: false });

    if (volunteerError) {
      console.error("[WEEKLY-DIGEST] Failed to fetch volunteers:", volunteerError);
    }

    // Fetch support messages
    const { data: allSupportMessages, error: supportError } = await supabase
      .from("support_messages")
      .select("id, name, email, message, status, created_at")
      .order("created_at", { ascending: false });

    if (supportError) {
      console.error("[WEEKLY-DIGEST] Failed to fetch support messages:", supportError);
    }

    // Fetch contact submissions
    const { data: allContactForms, error: contactError } = await supabase
      .from("contact_submissions")
      .select("id, name, email, message, created_at")
      .order("created_at", { ascending: false });

    if (contactError) {
      console.error("[WEEKLY-DIGEST] Failed to fetch contact forms:", contactError);
    }

    // Calculate weekly stats
    const weeklyStats: WeeklyStats = {
      volunteers: {
        newThisWeek: 0,
        pendingFollowup: 0,
        contacted: 0,
        allTime: allVolunteers?.length || 0,
        recentSubmissions: [],
      },
      support: {
        newThisWeek: 0,
        pendingReply: 0,
        recentMessages: [],
      },
      contact: {
        newThisWeek: 0,
        recentSubmissions: [],
      },
    };

    // Process volunteers
    for (const vol of allVolunteers || []) {
      const createdAt = new Date(vol.created_at);
      if (createdAt >= weekStart) {
        weeklyStats.volunteers.newThisWeek++;
        if (weeklyStats.volunteers.recentSubmissions.length < 10) {
          weeklyStats.volunteers.recentSubmissions.push(vol);
        }
      }
      if (vol.status === "new") {
        weeklyStats.volunteers.pendingFollowup++;
      } else if (vol.status === "contacted") {
        weeklyStats.volunteers.contacted++;
      }
    }

    // Process support messages
    for (const msg of allSupportMessages || []) {
      const createdAt = new Date(msg.created_at);
      if (createdAt >= weekStart) {
        weeklyStats.support.newThisWeek++;
        if (weeklyStats.support.recentMessages.length < 10) {
          weeklyStats.support.recentMessages.push(msg);
        }
      }
      if (msg.status === "pending" || msg.status === "open" || !msg.status) {
        weeklyStats.support.pendingReply++;
      }
    }

    // Process contact forms
    for (const form of allContactForms || []) {
      const createdAt = new Date(form.created_at);
      if (createdAt >= weekStart) {
        weeklyStats.contact.newThisWeek++;
        if (weeklyStats.contact.recentSubmissions.length < 10) {
          weeklyStats.contact.recentSubmissions.push(form);
        }
      }
    }

    console.log("[WEEKLY-DIGEST] Weekly stats:", JSON.stringify(weeklyStats, null, 2));

    // Check if there's any activity to report
    const hasActivity = 
      weeklyStats.volunteers.newThisWeek > 0 ||
      weeklyStats.support.newThisWeek > 0 ||
      weeklyStats.contact.newThisWeek > 0 ||
      weeklyStats.volunteers.pendingFollowup > 0 ||
      weeklyStats.support.pendingReply > 0;

    if (!hasActivity) {
      console.log("[WEEKLY-DIGEST] No community activity this week, skipping email");
      return new Response(
        JSON.stringify({ message: "No community activity to report" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format date range for email
    const formatDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
    const dateRange = `${formatDate(weekStart)} - ${formatDate(now)}`;

    // Format contribution types
    const formatContributions = (types: string[]) => {
      if (!types || types.length === 0) return "Not specified";
      return types.join(", ");
    };

    // Truncate message for preview
    const truncateMessage = (msg: string | null, maxLen = 100) => {
      if (!msg) return "—";
      return msg.length > maxLen ? msg.substring(0, maxLen) + "..." : msg;
    };

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Community Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">🤝 Weekly Community Digest</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">${dateRange}</p>
            </td>
          </tr>

          <!-- Summary Stats -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #7c3aed; padding-bottom: 10px;">📊 Week at a Glance</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="padding: 15px; background-color: #faf5ff; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">${weeklyStats.volunteers.newThisWeek}</p>
                    <p style="margin: 5px 0 0; color: #7c3aed; font-size: 11px; text-transform: uppercase;">Volunteer Apps</p>
                  </td>
                  <td width="5"></td>
                  <td width="33%" style="padding: 15px; background-color: #fdf2f8; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #ec4899; font-size: 28px; font-weight: 700;">${weeklyStats.support.newThisWeek}</p>
                    <p style="margin: 5px 0 0; color: #ec4899; font-size: 11px; text-transform: uppercase;">Support Msgs</p>
                  </td>
                  <td width="5"></td>
                  <td width="33%" style="padding: 15px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #16a34a; font-size: 28px; font-weight: 700;">${weeklyStats.contact.newThisWeek}</p>
                    <p style="margin: 5px 0 0; color: #16a34a; font-size: 11px; text-transform: uppercase;">Contact Forms</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Items -->
          ${weeklyStats.volunteers.pendingFollowup > 0 || weeklyStats.support.pendingReply > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">⚡ Action Items</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                ${weeklyStats.volunteers.pendingFollowup > 0 ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="font-size: 18px; margin-right: 8px;">🙋</span>
                    <span style="color: #333; font-weight: 500;">Volunteers awaiting follow-up</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${weeklyStats.volunteers.pendingFollowup} pending</span>
                  </td>
                </tr>
                ` : ""}
                ${weeklyStats.support.pendingReply > 0 ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="font-size: 18px; margin-right: 8px;">💬</span>
                    <span style="color: #333; font-weight: 500;">Support messages needing reply</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="background-color: #fce7f3; color: #9d174d; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${weeklyStats.support.pendingReply} pending</span>
                  </td>
                </tr>
                ` : ""}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- Volunteer Applications -->
          ${weeklyStats.volunteers.recentSubmissions.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #7c3aed; padding-bottom: 10px;">🙋 New Volunteer Applications</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                <tr style="background-color: #faf5ff;">
                  <th style="padding: 10px; text-align: left; color: #666;">Name</th>
                  <th style="padding: 10px; text-align: left; color: #666;">Interests</th>
                  <th style="padding: 10px; text-align: left; color: #666;">Status</th>
                </tr>
                ${weeklyStats.volunteers.recentSubmissions.map(vol => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333; font-weight: 500;">${vol.name}</span><br>
                    <span style="color: #888; font-size: 11px;">${vol.email}</span>
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; color: #666;">
                    ${formatContributions(vol.contribution_types)}
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
                    <span style="background-color: ${vol.status === 'new' ? '#fef3c7' : vol.status === 'contacted' ? '#dcfce7' : '#f3f4f6'}; color: ${vol.status === 'new' ? '#92400e' : vol.status === 'contacted' ? '#166534' : '#4b5563'}; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; text-transform: capitalize;">${vol.status || 'new'}</span>
                  </td>
                </tr>
                `).join("")}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- Support Messages -->
          ${weeklyStats.support.recentMessages.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #ec4899; padding-bottom: 10px;">💬 Support Messages</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                ${weeklyStats.support.recentMessages.map(msg => `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <div style="margin-bottom: 6px;">
                      <span style="color: #333; font-weight: 500;">${msg.name}</span>
                      <span style="color: #888; font-size: 11px; margin-left: 8px;">${msg.email}</span>
                    </div>
                    <div style="color: #666; font-size: 12px; line-height: 1.4;">
                      ${truncateMessage(msg.message)}
                    </div>
                  </td>
                </tr>
                `).join("")}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- Contact Form Submissions -->
          ${weeklyStats.contact.recentSubmissions.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #16a34a; padding-bottom: 10px;">📧 Contact Form Submissions</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                ${weeklyStats.contact.recentSubmissions.map(form => `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <div style="margin-bottom: 6px;">
                      <span style="color: #333; font-weight: 500;">${form.name}</span>
                      <span style="color: #888; font-size: 11px; margin-left: 8px;">${form.email}</span>
                    </div>
                    <div style="color: #666; font-size: 12px; line-height: 1.4;">
                      ${truncateMessage(form.message)}
                    </div>
                  </td>
                </tr>
                `).join("")}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- Cumulative Stats -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #64748b; padding-bottom: 10px;">📈 All-Time Volunteer Stats</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333;">Total Applications</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 600; color: #7c3aed;">
                    ${weeklyStats.volunteers.allTime}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333;">Contacted</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 600; color: #16a34a;">
                    ${weeklyStats.volunteers.contacted}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <span style="color: #333;">Awaiting Follow-up</span>
                  </td>
                  <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #f59e0b;">
                    ${weeklyStats.volunteers.pendingFollowup}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 25px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated weekly digest from Cosmico.<br>
                Sent every Monday morning.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // Send emails to all admins
    let successCount = 0;
    let errorCount = 0;

    for (const email of adminEmails) {
      try {
        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [email],
          subject: `🤝 Weekly Community Digest - ${dateRange}`,
          html: emailHtml,
        });
        successCount++;
        console.log(`[WEEKLY-DIGEST] Successfully sent digest to ${email}`);
      } catch (err) {
        errorCount++;
        console.error(`[WEEKLY-DIGEST] Failed to send to ${email}:`, err);
      }
    }

    console.log(`[WEEKLY-DIGEST] Completed: ${successCount} sent, ${errorCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Weekly digest sent to ${successCount} admins`,
        stats: weeklyStats,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[WEEKLY-DIGEST] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
