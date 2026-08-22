import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { filterSuperAdminEmails } from "../_shared/admin-notify-recipients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SalesStats {
  count: number;
  revenue: number;
  donations: number;
  ticketRevenue: number;
  lodgingRevenue: number;
  addonRevenue: number;
  byType: Record<string, { count: number; revenue: number; donations: number }>;
}

interface RecentAddonSale {
  email: string;
  display_name: string;
  addon_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
}

interface AddonStats {
  last24h: { count: number; revenue: number };
  last7days: { count: number; revenue: number };
  allTime: { count: number; revenue: number };
  byType: Record<string, { count: number; revenue: number }>;
}

interface RecentSale {
  name: string;
  email: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  donation_amount: number;
  created_at: string;
}

interface RecentLodgingSale {
  name: string;
  email: string;
  zone_key: string;
  quantity: number;
  total_amount: number;
  created_at: string;
}

interface CommunityStats {
  volunteers: {
    last24h: number;
    last7days: number;
    allTime: number;
    pendingFollowup: number;
  };
  supportMessages: {
    last24h: number;
    last7days: number;
  };
  contactForms: {
    last24h: number;
    last7days: number;
  };
}

interface LodgingStats {
  last24h: { count: number; revenue: number };
  last7days: { count: number; revenue: number };
  allTime: { count: number; revenue: number };
}

interface SalesData {
  last24h: SalesStats;
  last7days: SalesStats;
  allTime: SalesStats;
  recentSales: RecentSale[];
  recentLodgingSales: RecentLodgingSale[];
  recentAddonSales: RecentAddonSale[];
  community: CommunityStats;
  lodging: LodgingStats;
  addons: AddonStats;
  paymentPlans: PaymentPlanStats;
}

interface PaymentPlanStats {
  activeEnrollments: number;
  totalCommitted: number;
  totalCollected: number;
  totalAnticipated: number;
  defaultedCount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[DAILY-SALES-REPORT] Starting daily sales report generation");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // Check if daily sales report is enabled
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("daily_sales_report_enabled")
      .limit(1)
      .maybeSingle();

    if (emailSettings?.daily_sales_report_enabled === false) {
      console.log("[DAILY-SALES-REPORT] Daily sales report is disabled in settings");
      return new Response(
        JSON.stringify({ message: "Daily sales report is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all admin emails
    const { data: adminUsers, error: adminError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminError) {
      throw new Error(`Failed to fetch admins: ${adminError.message}`);
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.log("[DAILY-SALES-REPORT] No admin users found");
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

    // Platform daily sales report only goes to super admins
    const adminEmails = filterSuperAdminEmails(profiles.map(p => p.email));
    console.log(`[DAILY-SALES-REPORT] Sending to ${adminEmails.length} super admin(s):`, adminEmails);

    // Get active event (Cosmico 2026)
    const { data: event, error: eventError } = await supabase
      .from("event_details")
      .select("id, title, event_date")
      .eq("is_active", true)
      .maybeSingle();

    if (eventError || !event) {
      throw new Error("No active event found");
    }

    console.log(`[DAILY-SALES-REPORT] Generating report for event: ${event.title}`);

    // Calculate time ranges
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all paid registrations for the active event ONLY
    const { data: allRegistrations, error: regError } = await supabase
      .from("registrations")
      .select("id, name, email, ticket_type, quantity, total_amount, donation_amount, comp_upgrade_amount, created_at, payment_status")
      .eq("event_id", event.id)
      .in("payment_status", ["paid", "payment_plan"])
      .order("created_at", { ascending: false });

    if (regError) {
      throw new Error(`Failed to fetch registrations: ${regError.message}`);
    }

    // Fetch lodging bookings for the active event with email and zone details
    const { data: allLodgingBookings, error: lodgingError } = await supabase
      .from("lodging_bookings")
      .select("id, email, zone_key, quantity, total_amount, created_at, registration_id")
      .eq("payment_status", "paid")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false });

    if (lodgingError) {
      console.error("[DAILY-SALES-REPORT] Failed to fetch lodging bookings:", lodgingError);
    }

    // Get registration names for lodging bookings
    const lodgingRegIds = (allLodgingBookings || [])
      .filter(b => b.registration_id)
      .map(b => b.registration_id);
    
    const { data: lodgingRegistrations } = lodgingRegIds.length > 0 
      ? await supabase
          .from("registrations")
          .select("id, name")
          .in("id", lodgingRegIds)
      : { data: [] };

    const regNameMap = new Map((lodgingRegistrations || []).map(r => [r.id, r.name]));

    // Fetch addon purchases for the active event (joined to addon_inventory for event_id filter)
    const { data: allAddonPurchases, error: addonError } = await supabase
      .from("addon_purchases")
      .select("id, purchaser_email, quantity, unit_price, total_amount, created_at, addon_inventory!inner(event_id, display_name, addon_type)")
      .eq("payment_status", "paid")
      .eq("addon_inventory.event_id", event.id)
      .order("created_at", { ascending: false });

    if (addonError) {
      console.error("[DAILY-SALES-REPORT] Failed to fetch addon purchases:", addonError);
    }

    // Fetch volunteer interests
    const { data: allVolunteers, error: volunteerError } = await supabase
      .from("volunteer_interests")
      .select("id, created_at, status")
      .order("created_at", { ascending: false });

    if (volunteerError) {
      console.error("[DAILY-SALES-REPORT] Failed to fetch volunteers:", volunteerError);
    }

    // Fetch support messages
    const { data: allSupportMessages, error: supportError } = await supabase
      .from("support_messages")
      .select("id, created_at")
      .order("created_at", { ascending: false });

    if (supportError) {
      console.error("[DAILY-SALES-REPORT] Failed to fetch support messages:", supportError);
    }

    // Fetch contact submissions
    const { data: allContactForms, error: contactError } = await supabase
      .from("contact_submissions")
      .select("id, created_at")
      .order("created_at", { ascending: false });

    if (contactError) {
      console.error("[DAILY-SALES-REPORT] Failed to fetch contact forms:", contactError);
    }

    // Calculate community stats
    const communityStats: CommunityStats = {
      volunteers: {
        last24h: 0,
        last7days: 0,
        allTime: allVolunteers?.length || 0,
        pendingFollowup: allVolunteers?.filter(v => v.status === "new").length || 0,
      },
      supportMessages: {
        last24h: 0,
        last7days: 0,
      },
      contactForms: {
        last24h: 0,
        last7days: 0,
      },
    };

    // Count volunteer stats by time period
    for (const vol of allVolunteers || []) {
      const createdAt = new Date(vol.created_at);
      if (createdAt >= yesterday) {
        communityStats.volunteers.last24h++;
        communityStats.volunteers.last7days++;
      } else if (createdAt >= sevenDaysAgo) {
        communityStats.volunteers.last7days++;
      }
    }

    // Count support message stats
    for (const msg of allSupportMessages || []) {
      const createdAt = new Date(msg.created_at);
      if (createdAt >= yesterday) {
        communityStats.supportMessages.last24h++;
        communityStats.supportMessages.last7days++;
      } else if (createdAt >= sevenDaysAgo) {
        communityStats.supportMessages.last7days++;
      }
    }

    // Count contact form stats
    for (const form of allContactForms || []) {
      const createdAt = new Date(form.created_at);
      if (createdAt >= yesterday) {
        communityStats.contactForms.last24h++;
        communityStats.contactForms.last7days++;
      } else if (createdAt >= sevenDaysAgo) {
        communityStats.contactForms.last7days++;
      }
    }

    console.log("[DAILY-SALES-REPORT] Community stats:", communityStats);

    // ===== PAYMENT PLAN DATA =====
    const { data: enrollments } = await supabase
      .from("payment_plan_enrollments")
      .select("id, total_amount, status");

    const { data: scheduledPayments } = await supabase
      .from("scheduled_payments")
      .select("enrollment_id, amount, status");

    const activeEnrollments = (enrollments || []).filter(e => e.status === "active");
    const completedEnrollments = (enrollments || []).filter(e => e.status === "completed");
    const defaultedEnrollments = (enrollments || []).filter(e => e.status === "defaulted");
    const allActiveOrCompleted = [...activeEnrollments, ...completedEnrollments];
    
    const totalCommitted = allActiveOrCompleted.reduce((sum, e) => sum + (e.total_amount || 0), 0);
    const paidPayments = (scheduledPayments || []).filter(p => p.status === "paid");
    const totalCollected = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingPayments = (scheduledPayments || []).filter(p => 
      p.status === "pending" && activeEnrollments.some(e => e.id === p.enrollment_id)
    );
    const totalAnticipated = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const paymentPlanStats: PaymentPlanStats = {
      activeEnrollments: activeEnrollments.length,
      totalCommitted,
      totalCollected,
      totalAnticipated,
      defaultedCount: defaultedEnrollments.length,
    };

    console.log("[DAILY-SALES-REPORT] Payment plan stats:", paymentPlanStats);

    // ===== LEAD RECOVERY DATA =====
    // Abandoned checkout captures (last 24h)
    const { data: recentAbandoned } = await supabase
      .from("checkout_abandonment")
      .select("email, name, ticket_type, captured_at")
      .gte("captured_at", yesterday.toISOString())
      .order("captured_at", { ascending: false });

    // Pending/failed registrations (last 24h)
    const { data: recentPending } = await supabase
      .from("registrations")
      .select("email, name, ticket_type, total_amount, payment_status, created_at, stripe_session_id")
      .eq("event_id", event.id)
      .in("payment_status", ["pending", "failed"])
      .gte("created_at", yesterday.toISOString())
      .order("created_at", { ascending: false });

    // Get emails of people who already paid (to exclude from leads)
    const paidEmails = new Set(
      (allRegistrations || []).map(r => r.email?.toLowerCase())
    );

    // Filter out converted leads
    const newAbandoned = (recentAbandoned || []).filter(a => !paidEmails.has(a.email?.toLowerCase()));
    const newPending = (recentPending || []).filter(r => !paidEmails.has(r.email?.toLowerCase()));

    // High-intent leads: multiple attempts or payment failures
    const { data: multiAttemptLeads } = await supabase
      .from("registrations")
      .select("email, name, ticket_type, total_amount, payment_status")
      .eq("event_id", event.id)
      .in("payment_status", ["pending", "failed"]);

    const attemptsByEmail = new Map<string, { count: number; name: string; ticket_type: string; value: number }>();
    for (const reg of multiAttemptLeads || []) {
      const email = reg.email?.toLowerCase();
      if (!email || paidEmails.has(email)) continue;
      const existing = attemptsByEmail.get(email);
      if (existing) {
        existing.count++;
        existing.value = Math.max(existing.value, reg.total_amount || 0);
      } else {
        attemptsByEmail.set(email, { count: 1, name: reg.name, ticket_type: reg.ticket_type, value: reg.total_amount || 0 });
      }
    }
    const highIntentLeads = Array.from(attemptsByEmail.entries())
      .filter(([_, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // Recovery email performance
    const { data: recoveryEmailsSent } = await supabase
      .from("email_send_log")
      .select("recipient_email, status, created_at")
      .in("template_name", ["abandoned-registration", "checkout-abandonment-followup", "abandoned-followup-reminder"])
      .gte("created_at", sevenDaysAgo.toISOString());

    const totalRecoverySent = (recoveryEmailsSent || []).filter(e => e.status === "sent").length;

    const leadStats = {
      newAbandoned24h: newAbandoned.length,
      newPending24h: newPending.length,
      highIntent: highIntentLeads.length,
      recoverySent7d: totalRecoverySent,
      totalActiveLeads: attemptsByEmail.size + newAbandoned.length,
    };

    console.log("[DAILY-SALES-REPORT] Lead recovery stats:", leadStats);

    // Initialize stats (must be before hot leads section which references salesData)
    const createEmptyStats = (): SalesStats => ({
      count: 0,
      revenue: 0,
      donations: 0,
      ticketRevenue: 0,
      lodgingRevenue: 0,
      addonRevenue: 0,
      byType: {},
    });

    const salesData: SalesData = {
      last24h: createEmptyStats(),
      last7days: createEmptyStats(),
      allTime: createEmptyStats(),
      recentSales: [],
      recentLodgingSales: [],
      recentAddonSales: [],
      community: communityStats,
      lodging: {
        last24h: { count: 0, revenue: 0 },
        last7days: { count: 0, revenue: 0 },
        allTime: { count: 0, revenue: 0 },
      },
      addons: {
        last24h: { count: 0, revenue: 0 },
        last7days: { count: 0, revenue: 0 },
        allTime: { count: 0, revenue: 0 },
        byType: {},
      },
      paymentPlans: paymentPlanStats,
    };

    // ===== HOT LEADS STATUS DATA =====
    // Active promo codes with usage stats
    const { data: activePromoCodes } = await supabase
      .from("promo_codes")
      .select("code, email, name, phone, discount_percent, expires_at, is_used, created_at, source")
      .eq("is_active", true)
      .gte("expires_at", now.toISOString())
      .order("created_at", { ascending: false });

    // Expired unused promo codes (last 7 days) — wasted opportunities
    const { data: expiredUnusedCodes } = await supabase
      .from("promo_codes")
      .select("code, email, name")
      .eq("is_active", true)
      .eq("is_used", false)
      .lt("expires_at", now.toISOString())
      .gte("created_at", sevenDaysAgo.toISOString());

    // Used promo codes (last 7 days) — conversions
    const { data: usedCodes7d } = await supabase
      .from("promo_codes")
      .select("code, email, name, used_at")
      .eq("is_used", true)
      .gte("used_at", sevenDaysAgo.toISOString());

    // Newsletter leads with enrichment data
    const { data: newsletterLeads } = await supabase
      .from("newsletter_leads")
      .select("email, name, phone, lead_status, flodesk_status, simplytexting_status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);

    // Cart intent signals for device/funnel data
    const { data: intentSignals } = await supabase
      .from("cart_intent_signals")
      .select("session_id, signal_type, device_type, email, ticket_type, created_at, converted_at, lead_status, utm_source, utm_medium")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    // Build hot leads stats
    const activeCodesNotUsed = (activePromoCodes || []).filter(c => !c.is_used && !paidEmails.has(c.email?.toLowerCase()));
    const codesExpiringIn12h = activeCodesNotUsed.filter(c => {
      const expiresAt = new Date(c.expires_at);
      const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      return expiresAt <= in12h;
    });

    // Device breakdown from intent signals
    const deviceCounts = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
    for (const sig of intentSignals || []) {
      const dev = (sig.device_type || "unknown").toLowerCase();
      if (dev.includes("mobile")) deviceCounts.mobile++;
      else if (dev.includes("desktop")) deviceCounts.desktop++;
      else if (dev.includes("tablet")) deviceCounts.tablet++;
      else deviceCounts.unknown++;
    }
    const totalDeviceSignals = deviceCounts.mobile + deviceCounts.desktop + deviceCounts.tablet + deviceCounts.unknown;

    // Funnel stages from intent signals
    const uniqueSessionsWithEmail = new Set((intentSignals || []).filter(s => s.email).map(s => s.session_id)).size;
    const uniqueSessionsTotal = new Set((intentSignals || []).map(s => s.session_id)).size;
    const convertedSessions = new Set((intentSignals || []).filter(s => s.converted_at).map(s => s.session_id)).size;

    // UTM source breakdown (top sources)
    const utmSourceCounts = new Map<string, number>();
    for (const sig of intentSignals || []) {
      if (sig.utm_source) {
        utmSourceCounts.set(sig.utm_source, (utmSourceCounts.get(sig.utm_source) || 0) + 1);
      }
    }
    const topUtmSources = Array.from(utmSourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Lead status breakdown from newsletter leads
    const leadStatusCounts = { hot: 0, warm: 0, cold: 0, contacted: 0, converted: 0, closed: 0 };
    for (const lead of newsletterLeads || []) {
      const status = (lead.lead_status || "warm").toLowerCase();
      if (status in leadStatusCounts) {
        leadStatusCounts[status as keyof typeof leadStatusCounts]++;
      }
    }

    // Revenue pipeline estimate (active leads × average ticket value)
    const avgTicketValue = salesData.allTime.count > 0
      ? salesData.allTime.ticketRevenue / salesData.allTime.count
      : 15000; // default $150
    const pipelineValue = (leadStatusCounts.hot + leadStatusCounts.warm) * avgTicketValue;

    const hotLeadsStats = {
      activeCodesCount: activeCodesNotUsed.length,
      expiringIn12h: codesExpiringIn12h.length,
      expiredUnused7d: (expiredUnusedCodes || []).length,
      converted7d: (usedCodes7d || []).length,
      promoConversionRate: (activePromoCodes || []).length > 0
        ? Math.round(((usedCodes7d || []).length / ((usedCodes7d || []).length + (expiredUnusedCodes || []).length || 1)) * 100)
        : 0,
      pipelineValue,
    };

    console.log("[DAILY-SALES-REPORT] Hot leads stats:", hotLeadsStats);

    // Helper to add to stats
    const addToStats = (stats: SalesStats, reg: any) => {
      const ticketType = reg.ticket_type || "unknown";
      const donationAmount = reg.donation_amount || 0;
      const compUpgrade = reg.comp_upgrade_amount || 0;
      // Exclude comp upgrades from revenue (admin-issued, never collected)
      const collectedTotal = (reg.total_amount || 0) - compUpgrade;
      const ticketAmount = collectedTotal - donationAmount;

      stats.count += reg.quantity;
      stats.revenue += collectedTotal;
      stats.donations += donationAmount;
      stats.ticketRevenue += ticketAmount;

      if (!stats.byType[ticketType]) {
        stats.byType[ticketType] = { count: 0, revenue: 0, donations: 0 };
      }
      stats.byType[ticketType].count += reg.quantity;
      stats.byType[ticketType].revenue += ticketAmount;
      stats.byType[ticketType].donations += donationAmount;
    };

    for (const reg of allRegistrations || []) {
      const createdAt = new Date(reg.created_at);
      const isLast24h = createdAt >= yesterday;
      const isLast7days = createdAt >= sevenDaysAgo;

      // All time stats
      addToStats(salesData.allTime, reg);

      // Last 7 days stats
      if (isLast7days) {
        addToStats(salesData.last7days, reg);
      }

      // Last 24h stats
      if (isLast24h) {
        addToStats(salesData.last24h, reg);
        
        // Add to recent sales list (max 10)
        if (salesData.recentSales.length < 10) {
          salesData.recentSales.push({
            name: reg.name,
            email: reg.email,
            ticket_type: reg.ticket_type || "unknown",
            quantity: reg.quantity,
            total_amount: reg.total_amount,
            donation_amount: reg.donation_amount || 0,
            created_at: reg.created_at,
          });
        }
      }
    }

    // Process lodging bookings
    for (const booking of allLodgingBookings || []) {
      const createdAt = new Date(booking.created_at);
      const isLast24h = createdAt >= yesterday;
      const isLast7days = createdAt >= sevenDaysAgo;
      const amount = booking.total_amount || 0;

      // All time
      salesData.lodging.allTime.count++;
      salesData.lodging.allTime.revenue += amount;
      salesData.allTime.lodgingRevenue += amount;
      salesData.allTime.revenue += amount;

      // Last 7 days
      if (isLast7days) {
        salesData.lodging.last7days.count++;
        salesData.lodging.last7days.revenue += amount;
        salesData.last7days.lodgingRevenue += amount;
        salesData.last7days.revenue += amount;
      }

      // Last 24h
      if (isLast24h) {
        salesData.lodging.last24h.count++;
        salesData.lodging.last24h.revenue += amount;
        salesData.last24h.lodgingRevenue += amount;
        salesData.last24h.revenue += amount;

        // Add to recent lodging sales list (max 10)
        if (salesData.recentLodgingSales.length < 10) {
          const guestName = booking.registration_id 
            ? regNameMap.get(booking.registration_id) || "Unknown"
            : "Unknown";
          salesData.recentLodgingSales.push({
            name: guestName,
            email: booking.email,
            zone_key: booking.zone_key,
            quantity: booking.quantity || 1,
            total_amount: amount,
            created_at: booking.created_at,
          });
        }
      }
    }

    console.log("[DAILY-SALES-REPORT] Lodging stats:", salesData.lodging);

    // Process addon purchases
    for (const purchase of allAddonPurchases || []) {
      const createdAt = new Date(purchase.created_at);
      const isLast24h = createdAt >= yesterday;
      const isLast7days = createdAt >= sevenDaysAgo;
      const amount = purchase.total_amount || 0;
      const qty = purchase.quantity || 1;
      const inv = (purchase as any).addon_inventory || {};
      const displayName = inv.display_name || "Add-on";
      const addonType = inv.addon_type || "addon";

      // All time
      salesData.addons.allTime.count += qty;
      salesData.addons.allTime.revenue += amount;
      salesData.allTime.addonRevenue += amount;
      salesData.allTime.revenue += amount;

      if (!salesData.addons.byType[displayName]) {
        salesData.addons.byType[displayName] = { count: 0, revenue: 0 };
      }
      salesData.addons.byType[displayName].count += qty;
      salesData.addons.byType[displayName].revenue += amount;

      if (isLast7days) {
        salesData.addons.last7days.count += qty;
        salesData.addons.last7days.revenue += amount;
        salesData.last7days.addonRevenue += amount;
        salesData.last7days.revenue += amount;
      }

      if (isLast24h) {
        salesData.addons.last24h.count += qty;
        salesData.addons.last24h.revenue += amount;
        salesData.last24h.addonRevenue += amount;
        salesData.last24h.revenue += amount;

        if (salesData.recentAddonSales.length < 10) {
          salesData.recentAddonSales.push({
            email: purchase.purchaser_email,
            display_name: displayName,
            addon_type: addonType,
            quantity: qty,
            total_amount: amount,
            created_at: purchase.created_at,
          });
        }
      }
    }

    console.log("[DAILY-SALES-REPORT] Addon stats:", salesData.addons);

    // Calculate attach rate: % of paid registrations with at least one paid add-on
    const paidRegIds = new Set((allRegistrations || []).map(r => r.id));
    const regIdsWithAddon = new Set(
      (allAddonPurchases || [])
        .map((p: any) => p.registration_id)
        .filter((id: string | null) => id && paidRegIds.has(id))
    );
    const attachRateAllTime = paidRegIds.size > 0
      ? Math.round((regIdsWithAddon.size / paidRegIds.size) * 100)
      : 0;
    console.log("[DAILY-SALES-REPORT] Add-on attach rate:", `${attachRateAllTime}% (${regIdsWithAddon.size}/${paidRegIds.size})`);

    // Format currency
    const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, timeZone: "America/Los_Angeles" })}`;

    // Format ticket type name
    const formatTicketType = (type: string) => {
      return type.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    };

    // Check if there are any community activities to show
    const hasCommunityActivity = 
      communityStats.volunteers.last24h > 0 || 
      communityStats.supportMessages.last24h > 0 || 
      communityStats.contactForms.last24h > 0 ||
      communityStats.volunteers.pendingFollowup > 0;

    // Check if there's lodging activity
    const hasLodgingActivity = salesData.lodging.allTime.count > 0;
    const hasAddonActivity = salesData.addons.allTime.count > 0;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Sales Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">📊 Daily Sales Report</h1>
              <p style="margin: 10px 0 0; color: #a0a0a0; font-size: 14px;">${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}</p>
              <p style="margin: 8px 0 0; color: #fbbf24; font-size: 16px; font-weight: 600;">${event.title}</p>
            </td>
          </tr>

          <!-- Last 24 Hours Summary -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">🔥 Last 24 Hours</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #166534; font-size: 24px; font-weight: 700;">${salesData.last24h.count}</p>
                    <p style="margin: 5px 0 0; color: #166534; font-size: 10px; text-transform: uppercase;">Tickets</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.last24h.ticketRevenue)}</p>
                    <p style="margin: 5px 0 0; color: #92400e; font-size: 10px; text-transform: uppercase;">Ticket Sales</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #dbeafe; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.last24h.lodgingRevenue)}</p>
                    <p style="margin: 5px 0 0; color: #1e40af; font-size: 10px; text-transform: uppercase;">Lodging</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fce7f3; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #9d174d; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.last24h.donations)}</p>
                    <p style="margin: 5px 0 0; color: #9d174d; font-size: 10px; text-transform: uppercase;">Donations</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 15px 0 0; text-align: center; color: #166534; font-size: 14px; font-weight: 600;">Total Revenue: ${formatCurrency(salesData.last24h.revenue)}</p>

              ${Object.keys(salesData.last24h.byType).length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                ${Object.entries(salesData.last24h.byType).map(([type, data]) => `
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #666; font-size: 14px;">${formatTicketType(type)}</span>
                  </td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="color: #333; font-size: 14px; font-weight: 500;">${data.count} tickets • ${formatCurrency(data.revenue)}${data.donations > 0 ? ` <span style="color: #9d174d;">(+${formatCurrency(data.donations)} donated)</span>` : ""}</span>
                  </td>
                </tr>
                `).join("")}
              </table>
              ` : `<p style="color: #666; font-size: 14px; text-align: center; margin-top: 15px;">No sales in the last 24 hours</p>`}
            </td>
          </tr>

          ${salesData.recentSales.length > 0 ? `
          <!-- Recent Sales (Last 24h) -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #10b981; padding-bottom: 10px;">🎟️ Recent Sales (Last 24h)</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 10px; text-align: left; color: #666;">Name</th>
                  <th style="padding: 10px; text-align: left; color: #666;">Type</th>
                  <th style="padding: 10px; text-align: right; color: #666;">Amount</th>
                  <th style="padding: 10px; text-align: right; color: #666;">Donation</th>
                </tr>
                ${salesData.recentSales.map(sale => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333; font-weight: 500;">${sale.name}</span><br>
                    <span style="color: #888; font-size: 11px;">${sale.email}</span>
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; color: #666;">
                    ${formatTicketType(sale.ticket_type)}${sale.quantity > 1 ? ` (x${sale.quantity})` : ""}
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #166534; font-weight: 500;">
                    ${formatCurrency(sale.total_amount - sale.donation_amount)}
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #9d174d; font-weight: 500;">
                    ${sale.donation_amount > 0 ? formatCurrency(sale.donation_amount) : "-"}
                  </td>
                </tr>
                `).join("")}
              </table>
            </td>
          </tr>
          ` : ""}

          ${salesData.recentLodgingSales.length > 0 ? `
          <!-- Recent Lodging Sales (Last 24h) -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">🏕️ Lodging Purchases (Last 24h)</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 10px; text-align: left; color: #666;">Name</th>
                  <th style="padding: 10px; text-align: left; color: #666;">Zone</th>
                  <th style="padding: 10px; text-align: right; color: #666;">Amount</th>
                </tr>
                ${salesData.recentLodgingSales.map(sale => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333; font-weight: 500;">${sale.name}</span><br>
                    <span style="color: #888; font-size: 11px;">${sale.email}</span>
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; color: #666;">
                    ${formatTicketType(sale.zone_key)}${sale.quantity > 1 ? ` (x${sale.quantity})` : ""}
                  </td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #1e40af; font-weight: 500;">
                    ${formatCurrency(sale.total_amount)}
                  </td>
                </tr>
                `).join("")}
              </table>
            </td>
          </tr>
          ` : ""}

          ${salesData.recentAddonSales.length > 0 ? `
          <!-- Recent Add-on Sales (Last 24h) -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f97316; padding-bottom: 10px;">✨ Add-on Purchases (Last 24h)</h2>

              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 10px; text-align: left; color: #666;">Email</th>
                  <th style="padding: 10px; text-align: left; color: #666;">Add-on</th>
                  <th style="padding: 10px; text-align: center; color: #666;">Qty</th>
                  <th style="padding: 10px; text-align: right; color: #666;">Amount</th>
                </tr>
                ${salesData.recentAddonSales.map(sale => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; color: #888; font-size: 11px;">${sale.email}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; color: #333; font-weight: 500;">${sale.display_name}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; color: #666; text-align: center;">${sale.quantity}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #c2410c; font-weight: 500;">
                    ${formatCurrency(sale.total_amount)}
                  </td>
                </tr>
                `).join("")}
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                <tr>
                  <td width="25%" style="padding: 12px; background-color: #fff7ed; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #c2410c; font-size: 20px; font-weight: 700;">${salesData.addons.last24h.count}</p>
                    <p style="margin: 5px 0 0; color: #c2410c; font-size: 10px; text-transform: uppercase;">24h Items</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fff7ed; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #c2410c; font-size: 20px; font-weight: 700;">${formatCurrency(salesData.addons.last24h.revenue)}</p>
                    <p style="margin: 5px 0 0; color: #c2410c; font-size: 10px; text-transform: uppercase;">24h Revenue</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fff7ed; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #c2410c; font-size: 20px; font-weight: 700;">${formatCurrency(salesData.addons.last7days.revenue)}</p>
                    <p style="margin: 5px 0 0; color: #c2410c; font-size: 10px; text-transform: uppercase;">7d Revenue</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 20px; font-weight: 700;">${attachRateAllTime}%</p>
                    <p style="margin: 5px 0 0; color: #92400e; font-size: 10px; text-transform: uppercase;">Attach Rate</p>
                    <p style="margin: 2px 0 0; color: #92400e; font-size: 9px;">${regIdsWithAddon.size}/${paidRegIds.size} orders</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ""}
          ${hasCommunityActivity ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #ec4899; padding-bottom: 10px;">🤝 Community Activity</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                ${communityStats.volunteers.last24h > 0 ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="font-size: 18px; margin-right: 8px;">🙋</span>
                    <span style="color: #333; font-weight: 500;">Volunteer Applications</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="background-color: #fce7f3; color: #9d174d; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${communityStats.volunteers.last24h} new today</span>
                  </td>
                </tr>
                ` : ""}
                ${communityStats.volunteers.pendingFollowup > 0 ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="font-size: 18px; margin-right: 8px;">⏳</span>
                    <span style="color: #333; font-weight: 500;">Pending Volunteer Follow-ups</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${communityStats.volunteers.pendingFollowup} awaiting contact</span>
                  </td>
                </tr>
                ` : ""}
                ${communityStats.supportMessages.last24h > 0 ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="font-size: 18px; margin-right: 8px;">💬</span>
                    <span style="color: #333; font-weight: 500;">Support Messages</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${communityStats.supportMessages.last24h} new today</span>
                  </td>
                </tr>
                ` : ""}
                ${communityStats.contactForms.last24h > 0 ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="font-size: 18px; margin-right: 8px;">📧</span>
                    <span style="color: #333; font-weight: 500;">Contact Form Submissions</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="background-color: #f0fdf4; color: #166534; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${communityStats.contactForms.last24h} new today</span>
                  </td>
                </tr>
                ` : ""}
              </table>

              <p style="margin: 15px 0 0; color: #666; font-size: 12px; text-align: center;">
                Total volunteers: ${communityStats.volunteers.allTime} all time • ${communityStats.volunteers.last7days} this week
              </p>
            </td>
          </tr>
          ` : ""}

          <!-- Last 7 Days Summary -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">📆 Last 7 Days</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="padding: 12px; background-color: #f5f3ff; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #5b21b6; font-size: 24px; font-weight: 700;">${salesData.last7days.count}</p>
                    <p style="margin: 5px 0 0; color: #5b21b6; font-size: 10px; text-transform: uppercase;">Tickets</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #166534; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.last7days.ticketRevenue)}</p>
                    <p style="margin: 5px 0 0; color: #166534; font-size: 10px; text-transform: uppercase;">Ticket Sales</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #dbeafe; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.last7days.lodgingRevenue)}</p>
                    <p style="margin: 5px 0 0; color: #1e40af; font-size: 10px; text-transform: uppercase;">Lodging</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fce7f3; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #9d174d; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.last7days.donations)}</p>
                    <p style="margin: 5px 0 0; color: #9d174d; font-size: 10px; text-transform: uppercase;">Donations</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 15px 0 0; text-align: center; color: #5b21b6; font-size: 14px; font-weight: 600;">Total Revenue: ${formatCurrency(salesData.last7days.revenue)}</p>
            </td>
          </tr>

          <!-- All Time Summary -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">📈 All Time Totals</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="padding: 12px; background-color: #eff6ff; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 700;">${salesData.allTime.count}</p>
                    <p style="margin: 5px 0 0; color: #1e40af; font-size: 10px; text-transform: uppercase;">Tickets</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #166534; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.allTime.ticketRevenue)}</p>
                    <p style="margin: 5px 0 0; color: #166534; font-size: 10px; text-transform: uppercase;">Ticket Sales</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #dbeafe; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.allTime.lodgingRevenue)}</p>
                    <p style="margin: 5px 0 0; color: #1e40af; font-size: 10px; text-transform: uppercase;">Lodging</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fce7f3; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #9d174d; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.allTime.donations)}</p>
                    <p style="margin: 5px 0 0; color: #9d174d; font-size: 10px; text-transform: uppercase;">Donations</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 15px 0 0; text-align: center; color: #166534; font-size: 14px; font-weight: 600;">Total Revenue: ${formatCurrency(salesData.allTime.revenue)}</p>

              ${hasLodgingActivity ? `
              <p style="margin: 10px 0 0; text-align: center; color: #1e40af; font-size: 12px;">🏕️ Lodging: ${salesData.lodging.allTime.count} bookings (${formatCurrency(salesData.lodging.allTime.revenue)})</p>
              ` : ""}
              ${hasAddonActivity ? `
              <p style="margin: 6px 0 0; text-align: center; color: #c2410c; font-size: 12px;">✨ Add-ons: ${salesData.addons.allTime.count} items (${formatCurrency(salesData.addons.allTime.revenue)})</p>
              ` : ""}

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                ${Object.entries(salesData.allTime.byType).map(([type, data]) => `
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #666; font-size: 14px;">${formatTicketType(type)}</span>
                  </td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="color: #333; font-size: 14px; font-weight: 500;">${data.count} tickets • ${formatCurrency(data.revenue)}${data.donations > 0 ? ` <span style="color: #9d174d;">(+${formatCurrency(data.donations)} donated)</span>` : ""}</span>
                  </td>
                </tr>
                `).join("")}
              </table>
            </td>
          </tr>

          <!-- Payment Plans Section -->
          ${salesData.paymentPlans.activeEnrollments > 0 || salesData.paymentPlans.totalCollected > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">📅 Payment Plans</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="padding: 12px; background-color: #f5f3ff; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #5b21b6; font-size: 24px; font-weight: 700;">${salesData.paymentPlans.activeEnrollments}</p>
                    <p style="margin: 5px 0 0; color: #5b21b6; font-size: 10px; text-transform: uppercase;">Active Plans</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #166534; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.paymentPlans.totalCollected)}</p>
                    <p style="margin: 5px 0 0; color: #166534; font-size: 10px; text-transform: uppercase;">Collected</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.paymentPlans.totalAnticipated)}</p>
                    <p style="margin: 5px 0 0; color: #92400e; font-size: 10px; text-transform: uppercase;">Anticipated</p>
                  </td>
                  <td width="3"></td>
                  <td width="25%" style="padding: 12px; background-color: #eff6ff; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 700;">${formatCurrency(salesData.paymentPlans.totalCommitted)}</p>
                    <p style="margin: 5px 0 0; color: #1e40af; font-size: 10px; text-transform: uppercase;">Total Committed</p>
                  </td>
                </tr>
              </table>

              ${salesData.paymentPlans.defaultedCount > 0 ? `
              <p style="margin: 12px 0 0; text-align: center; color: #991b1b; font-size: 13px;">⚠️ ${salesData.paymentPlans.defaultedCount} plan(s) defaulted — admin review needed</p>
              ` : ""}

              <p style="margin: 12px 0 0; text-align: center;">
                <a href="${Deno.env.get("SITE_URL") || "https://example.invalid"}/admin/payment-plans" style="color: #8b5cf6; font-size: 13px; font-weight: 600; text-decoration: none;">
                  View Payment Plans →
                </a>
              </p>
            </td>
          </tr>
          ` : ""}

          <!-- Lead Recovery Section -->
          ${(leadStats.newAbandoned24h > 0 || leadStats.newPending24h > 0 || highIntentLeads.length > 0) ? `
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">🎯 Lead Recovery</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="padding: 12px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 24px; font-weight: 700;">${leadStats.newAbandoned24h}</p>
                    <p style="margin: 5px 0 0; color: #92400e; font-size: 10px; text-transform: uppercase;">New Abandonments</p>
                  </td>
                  <td width="3"></td>
                  <td width="33%" style="padding: 12px; background-color: #fee2e2; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #991b1b; font-size: 24px; font-weight: 700;">${leadStats.newPending24h}</p>
                    <p style="margin: 5px 0 0; color: #991b1b; font-size: 10px; text-transform: uppercase;">Failed/Pending</p>
                  </td>
                  <td width="3"></td>
                  <td width="33%" style="padding: 12px; background-color: #dbeafe; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 24px; font-weight: 700;">${leadStats.recoverySent7d}</p>
                    <p style="margin: 5px 0 0; color: #1e40af; font-size: 10px; text-transform: uppercase;">Recovery Emails (7d)</p>
                  </td>
                </tr>
              </table>

              ${highIntentLeads.length > 0 ? `
              <h3 style="margin: 20px 0 10px; color: #92400e; font-size: 14px; font-weight: 600;">🔥 High-Intent Leads (multiple attempts)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                <tr style="background-color: #fef3c7;">
                  <th style="padding: 8px 10px; text-align: left; color: #92400e;">Name</th>
                  <th style="padding: 8px 10px; text-align: left; color: #92400e;">Type</th>
                  <th style="padding: 8px 10px; text-align: center; color: #92400e;">Attempts</th>
                  <th style="padding: 8px 10px; text-align: right; color: #92400e;">Value</th>
                </tr>
                ${highIntentLeads.map(([email, data]) => `
                <tr>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333; font-weight: 500;">${data.name || "Unknown"}</span><br>
                    <span style="color: #888; font-size: 11px;">${email}</span>
                  </td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e5e5e5; color: #666;">
                    ${data.ticket_type ? data.ticket_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Unknown"}
                  </td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e5e5e5; text-align: center;">
                    <span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-weight: 600;">${data.count}x</span>
                  </td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #166534; font-weight: 500;">
                    ${data.value > 0 ? formatCurrency(data.value) : "—"}
                  </td>
                </tr>
                `).join("")}
              </table>
              ` : ""}

              ${newAbandoned.length > 0 ? `
              <h3 style="margin: 20px 0 10px; color: #666; font-size: 14px; font-weight: 600;">New Leads (last 24h)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px;">
                ${newAbandoned.slice(0, 5).map(a => `
                <tr>
                  <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; color: #333;">${a.name || "Unknown"}</td>
                  <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; color: #888;">${a.email}</td>
                  <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; color: #666; text-align: right;">${a.ticket_type ? a.ticket_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "—"}</td>
                </tr>
                `).join("")}
                ${newAbandoned.length > 5 ? `<tr><td colspan="3" style="padding: 6px 0; color: #888; font-style: italic;">+${newAbandoned.length - 5} more</td></tr>` : ""}
              </table>
              ` : ""}

              <p style="margin: 15px 0 0; text-align: center;">
                <a href="${Deno.env.get("SITE_URL") || "https://example.invalid"}/admin/leads" style="color: #f59e0b; font-size: 13px; font-weight: 600; text-decoration: none;">
                  View All Leads in CRM →
                </a>
              </p>
            </td>
          </tr>
          ` : ""}

          <!-- 🔥 Hot Leads Status Report -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">🔥 Hot Leads Status Report</h2>
              
              <!-- Lead Pipeline Overview -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td width="20%" style="padding: 10px 4px; background-color: #fef2f2; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #991b1b; font-size: 20px; font-weight: 700;">${leadStatusCounts.hot}</p>
                    <p style="margin: 3px 0 0; color: #991b1b; font-size: 9px; text-transform: uppercase; font-weight: 600;">Hot</p>
                  </td>
                  <td width="2"></td>
                  <td width="20%" style="padding: 10px 4px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 20px; font-weight: 700;">${leadStatusCounts.warm}</p>
                    <p style="margin: 3px 0 0; color: #92400e; font-size: 9px; text-transform: uppercase; font-weight: 600;">Warm</p>
                  </td>
                  <td width="2"></td>
                  <td width="20%" style="padding: 10px 4px; background-color: #dbeafe; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #1e40af; font-size: 20px; font-weight: 700;">${leadStatusCounts.contacted}</p>
                    <p style="margin: 3px 0 0; color: #1e40af; font-size: 9px; text-transform: uppercase; font-weight: 600;">Contacted</p>
                  </td>
                  <td width="2"></td>
                  <td width="20%" style="padding: 10px 4px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #166534; font-size: 20px; font-weight: 700;">${leadStatusCounts.converted}</p>
                    <p style="margin: 3px 0 0; color: #166534; font-size: 9px; text-transform: uppercase; font-weight: 600;">Converted</p>
                  </td>
                  <td width="2"></td>
                  <td width="20%" style="padding: 10px 4px; background-color: #f5f5f5; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #666; font-size: 20px; font-weight: 700;">${leadStatusCounts.cold}</p>
                    <p style="margin: 3px 0 0; color: #666; font-size: 9px; text-transform: uppercase; font-weight: 600;">Cold</p>
                  </td>
                </tr>
              </table>

              <!-- Revenue Pipeline -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 8px;">
                <tr>
                  <td style="padding: 16px; text-align: center;">
                    <p style="margin: 0; color: #fbbf24; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Estimated Revenue Pipeline</p>
                    <p style="margin: 6px 0 0; color: #ffffff; font-size: 28px; font-weight: 700;">${formatCurrency(hotLeadsStats.pipelineValue)}</p>
                    <p style="margin: 4px 0 0; color: #a0a0a0; font-size: 11px;">${leadStatusCounts.hot + leadStatusCounts.warm} active leads × ${formatCurrency(avgTicketValue)} avg ticket</p>
                  </td>
                </tr>
              </table>

              <!-- Promo Code Performance -->
              <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 14px; font-weight: 600;">🎟️ Promo Code Performance (7d)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td width="25%" style="padding: 10px 4px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #166534; font-size: 20px; font-weight: 700;">${hotLeadsStats.converted7d}</p>
                    <p style="margin: 3px 0 0; color: #166534; font-size: 9px; text-transform: uppercase;">Redeemed</p>
                  </td>
                  <td width="2"></td>
                  <td width="25%" style="padding: 10px 4px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 20px; font-weight: 700;">${hotLeadsStats.activeCodesCount}</p>
                    <p style="margin: 3px 0 0; color: #92400e; font-size: 9px; text-transform: uppercase;">Active Now</p>
                  </td>
                  <td width="2"></td>
                  <td width="25%" style="padding: 10px 4px; background-color: #fee2e2; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #991b1b; font-size: 20px; font-weight: 700;">${hotLeadsStats.expiringIn12h}</p>
                    <p style="margin: 3px 0 0; color: #991b1b; font-size: 9px; text-transform: uppercase;">Expiring &lt;12h</p>
                  </td>
                  <td width="2"></td>
                  <td width="25%" style="padding: 10px 4px; background-color: #f5f5f5; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #666; font-size: 20px; font-weight: 700;">${hotLeadsStats.promoConversionRate}%</p>
                    <p style="margin: 3px 0 0; color: #666; font-size: 9px; text-transform: uppercase;">Conv. Rate</p>
                  </td>
                </tr>
              </table>

              ${hotLeadsStats.expiredUnused7d > 0 ? `
              <p style="margin: 0 0 16px; color: #991b1b; font-size: 12px; text-align: center;">
                ⚠️ ${hotLeadsStats.expiredUnused7d} promo codes expired unused this week — consider extending timeframes or follow-up cadence
              </p>
              ` : ""}

              ${codesExpiringIn12h.length > 0 ? `
              <h3 style="margin: 0 0 10px; color: #991b1b; font-size: 14px; font-weight: 600;">⏰ Codes Expiring Soon — Act Now</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px; margin-bottom: 16px;">
                <tr style="background-color: #fee2e2;">
                  <th style="padding: 6px 8px; text-align: left; color: #991b1b;">Name</th>
                  <th style="padding: 6px 8px; text-align: left; color: #991b1b;">Code</th>
                  <th style="padding: 6px 8px; text-align: left; color: #991b1b;">Phone</th>
                  <th style="padding: 6px 8px; text-align: right; color: #991b1b;">Expires</th>
                </tr>
                ${codesExpiringIn12h.slice(0, 8).map(c => {
                  const expiresAt = new Date(c.expires_at);
                  const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
                  return `
                <tr>
                  <td style="padding: 6px 8px; border-bottom: 1px solid #fecaca;">
                    <span style="color: #333; font-weight: 500;">${c.name || "Unknown"}</span><br>
                    <span style="color: #888; font-size: 10px;">${c.email}</span>
                  </td>
                  <td style="padding: 6px 8px; border-bottom: 1px solid #fecaca;">
                    <span style="background-color: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: 600;">${c.code}</span>
                  </td>
                  <td style="padding: 6px 8px; border-bottom: 1px solid #fecaca; color: #666;">${c.phone || "—"}</td>
                  <td style="padding: 6px 8px; border-bottom: 1px solid #fecaca; text-align: right;">
                    <span style="color: #991b1b; font-weight: 600;">${hoursLeft}h left</span>
                  </td>
                </tr>`;
                }).join("")}
                ${codesExpiringIn12h.length > 8 ? `<tr><td colspan="4" style="padding: 6px 8px; color: #888; font-style: italic;">+${codesExpiringIn12h.length - 8} more</td></tr>` : ""}
              </table>
              ` : ""}

              <!-- Traffic & Device Insights -->
              ${totalDeviceSignals > 0 ? `
              <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 14px; font-weight: 600;">📱 Traffic Insights (7d)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; margin-bottom: 12px;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333;">📱 Mobile</span>
                  </td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="font-weight: 600; color: #333;">${deviceCounts.mobile}</span>
                    <span style="color: #888; font-size: 11px;"> (${totalDeviceSignals > 0 ? Math.round(deviceCounts.mobile / totalDeviceSignals * 100) : 0}%)</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333;">💻 Desktop</span>
                  </td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="font-weight: 600; color: #333;">${deviceCounts.desktop}</span>
                    <span style="color: #888; font-size: 11px;"> (${totalDeviceSignals > 0 ? Math.round(deviceCounts.desktop / totalDeviceSignals * 100) : 0}%)</span>
                  </td>
                </tr>
                ${deviceCounts.tablet > 0 ? `
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5;">
                    <span style="color: #333;">📟 Tablet</span>
                  </td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">
                    <span style="font-weight: 600; color: #333;">${deviceCounts.tablet}</span>
                    <span style="color: #888; font-size: 11px;"> (${Math.round(deviceCounts.tablet / totalDeviceSignals * 100)}%)</span>
                  </td>
                </tr>
                ` : ""}
              </table>
              ` : ""}

              <!-- Checkout Funnel -->
              ${uniqueSessionsTotal > 0 ? `
              <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 14px; font-weight: 600;">🔄 Checkout Funnel (7d)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; margin-bottom: 12px;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333;">Sessions with intent signals</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 600; color: #333;">${uniqueSessionsTotal}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333;">→ Email captured</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 600; color: #1e40af;">${uniqueSessionsWithEmail} <span style="color: #888; font-weight: 400; font-size: 11px;">(${Math.round(uniqueSessionsWithEmail / uniqueSessionsTotal * 100)}%)</span></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333;">→ Converted (paid)</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 600; color: #166534;">${convertedSessions} <span style="color: #888; font-weight: 400; font-size: 11px;">(${Math.round(convertedSessions / uniqueSessionsTotal * 100)}%)</span></td>
                </tr>
              </table>
              ` : ""}

              <!-- Top Traffic Sources -->
              ${topUtmSources.length > 0 ? `
              <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 14px; font-weight: 600;">📊 Top Traffic Sources (7d)</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px; margin-bottom: 12px;">
                ${topUtmSources.map(([source, count]) => `
                <tr>
                  <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; color: #333; font-weight: 500;">${source}</td>
                  <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #666;">${count} signals</td>
                </tr>
                `).join("")}
              </table>
              ` : ""}

              <p style="margin: 15px 0 0; text-align: center;">
                <a href="${Deno.env.get("SITE_URL") || "https://example.invalid"}/admin/leads" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 600;">
                  Open Lead Recovery Dashboard →
                </a>
              </p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 30px 30px; text-align: center;">
              <a href="${Deno.env.get("SITE_URL") || "https://example.invalid"}/admin/sales" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                View Full Dashboard →
              </a>
              <p style="margin: 12px 0 0; color: #666; font-size: 13px;">Log in to see detailed analytics, customer info, and more</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f5; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">
                This is an automated daily report from Cosmico Admin.
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

    // Send email to all admins
    const { error: emailError } = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: adminEmails,
      subject: `📊 Daily Sales Report: ${salesData.last24h.count} tickets sold (${formatCurrency(salesData.last24h.revenue)})`,
      html: emailHtml,
    });

    if (emailError) {
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    console.log(`[DAILY-SALES-REPORT] Report sent to ${adminEmails.length} admins`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sales report sent to ${adminEmails.length} admins`,
        event: event.title,
        summary: {
          last24h: { count: salesData.last24h.count, revenue: salesData.last24h.revenue },
          last7days: { count: salesData.last7days.count, revenue: salesData.last7days.revenue },
          allTime: { count: salesData.allTime.count, revenue: salesData.allTime.revenue },
        },
        community: communityStats,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[DAILY-SALES-REPORT] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
