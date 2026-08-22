import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge, AdminInput, AdminTextarea, AdminSelect, AdminSelectItem } from "@/components/admin";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { StatusPill } from "@/components/admin/StatusPill";
import { IndividualEmailComposer } from "@/components/IndividualEmailComposer";
import { LeadSmsComposer } from "@/components/LeadSmsComposer";
import { 
  Target, Users, UserCheck, UserX, MessageSquare, Clock, Mail, 
  Phone, Send, Plus, ChevronDown, ChevronRight, Search,
  TrendingUp, AlertTriangle, Zap, Eye, ExternalLink, Smartphone,
  RefreshCw, Upload, Newspaper, Webhook, DollarSign, Monitor, Tablet,
  Timer, Gift, Ticket
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

// Past purchase profile for a lead
interface PastPurchaseProfile {
  is_returning: boolean;
  total_events: number;
  total_spent: number; // cents
  highest_ticket_type: string | null;
  had_vip: boolean;
  had_lodging: boolean;
  had_addon: boolean;
}

// AI prediction result
interface AIPrediction {
  index: number;
  score: number; // 0-100
  reasoning: string;
  recommended_action: string;
}

// Unified lead type merging multiple data sources
interface UnifiedLead {
  email: string;
  name: string | null;
  phone: string | null;
  source: string;
  ticket_type: string | null;
  furthest_step: string;
  failure_reason: string | null;
  attempt_count: number;
  first_seen: string;
  last_activity: string;
  total_potential_value: number;
  // From lead_tracking table
  tracking_id: string | null;
  status: string;
  assigned_to: string | null;
  last_contacted_at: string | null;
  // Recovery emails
  recovery_emails_sent: number;
  last_recovery_email: string | null;
  // Signals
  has_checkout_error: boolean;
  chat_sessions: number;
  chat_email_captured: boolean;
  // Intent signals
  intent_signals: number;
  ad_source: string | null;
  device_type: string | null;
  // Past purchase history
  past_purchases: PastPurchaseProfile;
  // AI prediction
  ai_prediction?: AIPrediction;
  // Email engagement (from Flodesk)
  engagement_status: string | null;
  segments: string[];
  // Outreach activities
  has_promo_code: boolean;
  promo_code_source: string | null;
  promo_code_used: boolean;
  promo_code_string: string | null;
  promo_code_expires: string | null;
  sms_sent: boolean;
  converted_at: string | null;
}

interface LeadNote {
  id: string;
  note: string;
  created_by: string | null;
  created_at: string;
  creator_name?: string;
}

const STATUS_CONFIG: Record<string, { label: string; intent: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  new: { label: "New", intent: "info" },
  contacted: { label: "Contacted", intent: "warning" },
  nurturing: { label: "Nurturing", intent: "neutral" },
  converted: { label: "Converted", intent: "success" },
  closed: { label: "Closed", intent: "neutral" },
  lost: { label: "Lost", intent: "danger" },
};

const STEP_LABELS: Record<string, string> = {
  browsing: "Browsing",
  email_captured: "Email Only",
  form_started: "Started Form",
  form_submitted: "Submitted Form",
  checkout_started: "Hit Stripe",
  payment_failed: "Payment Failed",
};

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<UnifiedLead | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("hot");
  const [searchQuery, setSearchQuery] = useState("");
  const [newNote, setNewNote] = useState("");
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [aiDraftBundle, setAiDraftBundle] = useState<{ prompt: string; context: string } | null>(null);
  const [showSmsComposer, setShowSmsComposer] = useState(false);
  const [isSyncingFlodesk, setIsSyncingFlodesk] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [isSyncingSms, setIsSyncingSms] = useState(false);
  const [isRegisteringWebhooks, setIsRegisteringWebhooks] = useState(false);
  const [aiPredictions, setAiPredictions] = useState<AIPrediction[]>([]);
  const [isRunningAi, setIsRunningAi] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(false);

  // Fetch all data sources in parallel
  const { data: rawData, isLoading } = useAuthQuery({
    queryKey: ["leads-crm-data"],
    queryFn: async () => {
      const [
        abandonmentRes,
        pendingRegsRes,
        trackingRes,
        errorsRes,
        chatsRes,
        paidEmailsRes,
        intentSignalsRes,
        allPaidRegsRes,
        lodgingRes,
        addonRes,
        promoCodesRes,
        crewBidsRes,
        raffleRes,
        contactSubsRes,
        volunteerRes,
        waitlistRes,
      ] = await Promise.all([
        supabase.from("checkout_abandonment").select("*").order("captured_at", { ascending: false }),
        supabase.from("registrations").select("id, email, name, ticket_type, total_amount, payment_status, created_at, stripe_session_id")
          .in("payment_status", ["pending", "failed"]).order("created_at", { ascending: false }),
        supabase.from("lead_tracking").select("*"),
        supabase.from("checkout_errors").select("user_email, created_at, error_type, error_message").not("user_email", "is", null),
        supabase.from("chat_logs").select("user_email, created_at").not("user_email", "is", null),
        supabase.from("registrations").select("email").eq("payment_status", "paid"),
        supabase.from("cart_intent_signals").select("session_id, email, name, ticket_type, signal_type, signal_count, utm_source, utm_medium, utm_campaign, fbclid, gclid, device_type, created_at, lead_status")
          .order("created_at", { ascending: false })
          .limit(500),
        // All paid registrations with full details for purchase history
        supabase.from("registrations").select("email, ticket_type, total_amount, event_id, payment_status")
          .in("payment_status", ["paid", "payment_plan"]),
        // Lodging purchases
        supabase.from("lodging_bookings" as any).select("registration_id, total_amount").eq("payment_status", "paid"),
        // Add-on purchases
        supabase.from("addon_purchases").select("purchaser_email, total_amount").eq("payment_status", "paid"),
        // Promo codes issued to leads
        supabase.from("promo_codes").select("recipient_email, source, code, is_active, valid_until, created_at")
          .not("recipient_email", "is", null)
          .in("source", ["high_intent_popup", "exit_intent_popup", "abandonment_sms"]),
        // Crew bids (expired/unpaid = missed conversions)
        supabase.from("crew_bids").select("email, captain_name, crew_size, bid_price, ticket_type, status, created_at")
          .in("status", ["expired", "pending", "submitted"]),
        // Raffle/giveaway entries (engaged but haven't bought)
        supabase.from("raffle_entries").select("email, first_name, tier, entries_count, created_at"),
        // Contact submissions (some are potential ticket buyers)
        supabase.from("contact_submissions").select("email, name, message, created_at")
          .order("created_at", { ascending: false }),
        // Volunteer interests (may also want tickets)
        supabase.from("volunteer_interests" as any).select("email, name, created_at")
          .order("created_at", { ascending: false }).limit(100),
        // Accommodation waitlist
        supabase.from("accommodation_waitlist").select("email, name, created_at"),
      ]);

      // Build promo code lookup by email
      const promoByEmail = new Map<string, { source: string; used: boolean; code: string; expires: string | null; phone: string | null }>();
      for (const pc of (promoCodesRes.data || [])) {
        const email = (pc.recipient_email as string)?.toLowerCase();
        if (!email) continue;
        const existing = promoByEmail.get(email);
        if (!existing) {
          promoByEmail.set(email, { 
            source: pc.source, 
            used: !pc.is_active, 
            code: pc.code, 
            expires: pc.valid_until,
            phone: (pc as any).recipient_phone || null,
          });
        }
      }

      // Build SMS sent lookup from checkout_abandonment
      const smsSentEmails = new Set<string>();
      for (const ab of (abandonmentRes.data || [])) {
        if (ab.sms_sent_at && ab.email) smsSentEmails.add(ab.email.toLowerCase());
      }
      // Build past purchase profiles per email
      const purchaseProfiles = new Map<string, PastPurchaseProfile>();
      const allPaidRegs = allPaidRegsRes.data || [];
      const addonEmails = new Set((addonRes.data || []).map((a: any) => a.purchaser_email?.toLowerCase()));

      for (const reg of allPaidRegs) {
        const email = reg.email?.toLowerCase();
        if (!email) continue;
        const existing = purchaseProfiles.get(email) || {
          is_returning: false,
          total_events: 0,
          total_spent: 0,
          highest_ticket_type: null,
          had_vip: false,
          had_lodging: false,
          had_addon: addonEmails.has(email),
        };
        existing.total_spent += reg.total_amount || 0;
        const eventIds = new Set<string>();
        if (reg.event_id) eventIds.add(reg.event_id);
        existing.total_events = Math.max(existing.total_events, eventIds.size);
        if (reg.ticket_type?.includes("vip")) existing.had_vip = true;
        if (!existing.highest_ticket_type || (reg.total_amount || 0) > existing.total_spent) {
          existing.highest_ticket_type = reg.ticket_type;
        }
        purchaseProfiles.set(email, existing);
      }

      // Mark returning customers (appeared in multiple events)
      const emailEventCounts = new Map<string, Set<string>>();
      for (const reg of allPaidRegs) {
        const email = reg.email?.toLowerCase();
        if (!email || !reg.event_id) continue;
        if (!emailEventCounts.has(email)) emailEventCounts.set(email, new Set());
        emailEventCounts.get(email)!.add(reg.event_id);
      }
      for (const [email, events] of emailEventCounts) {
        const profile = purchaseProfiles.get(email);
        if (profile) {
          profile.total_events = events.size;
          profile.is_returning = events.size > 1;
        }
      }

      return {
        abandonments: abandonmentRes.data || [],
        pendingRegs: pendingRegsRes.data || [],
        tracking: trackingRes.data || [],
        errors: errorsRes.data || [],
        chats: chatsRes.data || [],
        paidEmails: new Set((paidEmailsRes.data || []).map(r => r.email?.toLowerCase())),
        intentSignals: intentSignalsRes.data || [],
        purchaseProfiles,
        promoByEmail,
        smsSentEmails,
        crewBids: crewBidsRes.data || [],
        raffleEntries: raffleRes.data || [],
        contactSubmissions: contactSubsRes.data || [],
        volunteers: volunteerRes.data || [],
        waitlist: waitlistRes.data || [],
      };
    },
  });

  // Fetch newsletter leads (Flodesk synced + CSV imported)
  const { data: newsletterLeads } = useAuthQuery({
    queryKey: ["newsletter-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("newsletter_leads")
        .select("*")
        .eq("has_purchased", false)
        .neq("lead_status", "converted");
      return data || [];
    },
  });

  // Fetch recovery email counts
  const { data: emailLogs } = useAuthQuery({
    queryKey: ["leads-email-logs"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("email_send_log")
        .select("recipient_email, created_at, template_name")
        .in("template_name", ["abandoned-registration", "checkout-abandonment-followup", "abandoned-followup-reminder"])
        .order("created_at", { ascending: false });
      return (data || []) as Array<{ recipient_email: string; created_at: string; template_name: string }>;
    },
  });

  // Sync Flodesk subscribers
  const handleSyncFlodesk = async () => {
    setIsSyncingFlodesk(true);
    try {
      const { data, error } = await supabase.functions.invoke("cross-reference-flodesk");
      if (error) throw error;
      toast.success(`Synced ${data.total_subscribers} subscribers — ${data.non_buyers} non-buyers found`);
      queryClient.invalidateQueries({ queryKey: ["newsletter-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-crm-data"] });
    } catch (e: any) {
      toast.error("Failed to sync Flodesk: " + (e.message || "Unknown error"));
    } finally {
      setIsSyncingFlodesk(false);
    }
  };

  // Sync SimpleTexting contacts
  const handleSyncSms = async () => {
    setIsSyncingSms(true);
    try {
      const { data, error } = await supabase.functions.invoke("cross-reference-simpletexting");
      if (error) throw error;
      toast.success(`Synced ${data.total_contacts} SMS contacts — ${data.non_buyers} non-buyers found`);
      queryClient.invalidateQueries({ queryKey: ["newsletter-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-crm-data"] });
    } catch (e: any) {
      toast.error("Failed to sync SMS: " + (e.message || "Unknown error"));
    } finally {
      setIsSyncingSms(false);
    }
  };

  // Register Flodesk webhooks for real-time sync
  const handleRegisterWebhooks = async () => {
    setIsRegisteringWebhooks(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-flodesk-webhook");
      if (error) throw error;
      const created = data.results?.filter((r: any) => r.status === 'created').length || 0;
      const existing = data.results?.filter((r: any) => r.status === 'already_exists').length || 0;
      const failed = data.results?.filter((r: any) => r.status === 'error').length || 0;
      if (failed > 0) {
        toast.warning(`Webhooks: ${created} created, ${existing} already exist, ${failed} failed`);
      } else {
        toast.success(`Flodesk webhooks connected! ${created} created, ${existing} already active`);
      }
    } catch (e: any) {
      toast.error("Failed to register webhooks: " + (e.message || "Unknown error"));
    } finally {
      setIsRegisteringWebhooks(false);
    }
  };

  // CSV Import handler
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) {
        toast.error("CSV file is empty or has no data rows");
        return;
      }

      const headers = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
      const emailIdx = headers.findIndex(h => h === "email" || h === "email address");
      const firstNameIdx = headers.findIndex(h => h === "first_name" || h === "first name" || h === "name");
      const lastNameIdx = headers.findIndex(h => h === "last_name" || h === "last name");

      if (emailIdx === -1) {
        toast.error("CSV must have an 'email' column");
        return;
      }

      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
        const email = cols[emailIdx]?.toLowerCase().trim();
        if (!email || !email.includes("@")) continue;
        
        rows.push({
          email,
          first_name: firstNameIdx >= 0 ? cols[firstNameIdx] || null : null,
          last_name: lastNameIdx >= 0 ? cols[lastNameIdx] || null : null,
          source: "csv_import",
          has_purchased: false,
          lead_status: "new",
          synced_at: new Date().toISOString(),
        });
      }

      if (rows.length === 0) {
        toast.error("No valid email addresses found in CSV");
        return;
      }

      // Batch upsert
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await supabase.from("newsletter_leads").upsert(chunk, { onConflict: "email,source" });
      }

      toast.success(`Imported ${rows.length} leads from CSV`);
      queryClient.invalidateQueries({ queryKey: ["newsletter-leads"] });
    } catch (err: any) {
      toast.error("Failed to import CSV: " + (err.message || "Unknown error"));
    }

    // Reset input
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  // Run AI predictive scoring
  const handleRunAiScoring = async () => {
    if (leads.length === 0) return;
    setIsRunningAi(true);
    try {
      const activeLeads = leads.filter(l => !["converted", "closed", "lost"].includes(l.status));
      const { data, error } = await supabase.functions.invoke("score-leads-ai", {
        body: { leads: activeLeads.slice(0, 15) },
      });
      if (error) throw error;
      if (data?.predictions) {
        // Map predictions back to leads by index
        const predMap = new Map<number, AIPrediction>();
        for (const p of data.predictions) {
          predMap.set(p.index, { index: p.index, score: p.score, reasoning: p.reasoning, recommended_action: p.recommended_action });
        }
        // Update leads with AI predictions
        const activeEmails = activeLeads.slice(0, 15).map(l => l.email);
        const newPredictions: AIPrediction[] = [];
        for (let i = 0; i < activeEmails.length; i++) {
          const pred = predMap.get(i);
          if (pred) newPredictions.push(pred);
        }
        setAiPredictions(data.predictions);
        setShowInsights(true);
        toast.success(`AI scored ${data.predictions.length} leads`);
      }
    } catch (e: any) {
      toast.error("AI scoring failed: " + (e.message || "Unknown error"));
    } finally {
      setIsRunningAi(false);
    }
  };


  const leads = useMemo(() => {
    if (!rawData) return [];

    const defaultProfile: PastPurchaseProfile = { is_returning: false, total_events: 0, total_spent: 0, highest_ticket_type: null, had_vip: false, had_lodging: false, had_addon: false };
    const getProfile = (email: string) => rawData.purchaseProfiles.get(email.toLowerCase()) || { ...defaultProfile };

    const leadMap = new Map<string, UnifiedLead>();
    const trackingMap = new Map(rawData.tracking.map(t => [t.email?.toLowerCase(), t]));
    const errorsByEmail = new Map<string, any[]>();
    const chatsByEmail = new Map<string, any[]>();

    // Group intent signals by email and session
    const intentByEmail = new Map<string, { count: number; adSource: string | null; ticketType: string | null; name: string | null; deviceType: string | null; firstSeen: string; lastSeen: string }>();
    const intentBySession = new Map<string, { count: number; adSource: string | null; ticketType: string | null; email: string | null; name: string | null; deviceType: string | null; firstSeen: string; lastSeen: string }>();
    
    for (const sig of rawData.intentSignals) {
      const adSource = sig.utm_source || (sig.fbclid ? "facebook" : null) || (sig.gclid ? "google" : null) || null;
      
      if (sig.email) {
        const email = sig.email.toLowerCase();
        const existing = intentByEmail.get(email);
        if (existing) {
          existing.count += sig.signal_count || 1;
          if (!existing.adSource && adSource) existing.adSource = adSource;
          if (!existing.ticketType && sig.ticket_type) existing.ticketType = sig.ticket_type;
          if (sig.created_at < existing.firstSeen) existing.firstSeen = sig.created_at;
          if (sig.created_at > existing.lastSeen) existing.lastSeen = sig.created_at;
        } else {
          intentByEmail.set(email, { count: sig.signal_count || 1, adSource, ticketType: sig.ticket_type, name: sig.name, deviceType: sig.device_type || null, firstSeen: sig.created_at, lastSeen: sig.created_at });
        }
      } else {
        // Anonymous session
        const existing = intentBySession.get(sig.session_id);
        if (existing) {
          existing.count += sig.signal_count || 1;
          if (!existing.adSource && adSource) existing.adSource = adSource;
          if (!existing.ticketType && sig.ticket_type) existing.ticketType = sig.ticket_type;
          if (sig.created_at < existing.firstSeen) existing.firstSeen = sig.created_at;
          if (sig.created_at > existing.lastSeen) existing.lastSeen = sig.created_at;
        } else {
          intentBySession.set(sig.session_id, { count: sig.signal_count || 1, adSource, ticketType: sig.ticket_type, email: null, name: null, deviceType: sig.device_type || null, firstSeen: sig.created_at, lastSeen: sig.created_at });
        }
      }
    }

    // Group errors and chats by email
    for (const err of rawData.errors) {
      const email = (err.user_email as string)?.toLowerCase();
      if (email) errorsByEmail.set(email, [...(errorsByEmail.get(email) || []), err]);
    }
    for (const chat of rawData.chats) {
      const email = (chat.user_email as string)?.toLowerCase();
      if (email) chatsByEmail.set(email, [...(chatsByEmail.get(email) || []), chat]);
    }

    // Email log counts
    const emailCountsByRecipient = new Map<string, { count: number; lastSent: string | null }>();
    for (const log of emailLogs || []) {
      const email = (log.recipient_email as string)?.toLowerCase();
      if (!email) continue;
      const existing = emailCountsByRecipient.get(email);
      if (existing) {
        existing.count++;
        if (!existing.lastSent || log.created_at > existing.lastSent) existing.lastSent = log.created_at;
      } else {
        emailCountsByRecipient.set(email, { count: 1, lastSent: log.created_at });
      }
    }

    // Process checkout abandonments (pre-submission)
    for (const ab of rawData.abandonments) {
      const email = ab.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email)) continue;

      const tracking = trackingMap.get(email);
      const emailStats = emailCountsByRecipient.get(email);
      const intent = intentByEmail.get(email);

      const promoData = rawData.promoByEmail.get(email);
      leadMap.set(email, {
        email: ab.email,
        name: ab.name || null,
        phone: ab.phone || promoData?.phone || null,
        source: "checkout_abandonment",
        ticket_type: ab.ticket_type,
        furthest_step: ab.converted_at ? "converted" : "email_captured",
        failure_reason: "Abandoned before submitting",
        attempt_count: 1,
        first_seen: ab.captured_at,
        last_activity: ab.captured_at,
        total_potential_value: 0,
        tracking_id: tracking?.id || null,
        status: tracking?.status || "new",
        assigned_to: tracking?.assigned_to || null,
        last_contacted_at: tracking?.last_contacted_at || null,
        recovery_emails_sent: emailStats?.count || 0,
        last_recovery_email: emailStats?.lastSent || null,
        has_checkout_error: errorsByEmail.has(email),
        chat_sessions: chatsByEmail.get(email)?.length || 0,
        chat_email_captured: (chatsByEmail.get(email)?.length || 0) > 0,
        intent_signals: intent?.count || 0,
        ad_source: intent?.adSource || null,
        device_type: intent?.deviceType || null,
        past_purchases: getProfile(ab.email),
        engagement_status: null,
        segments: [],
        has_promo_code: !!promoData,
        promo_code_source: promoData?.source || null,
        promo_code_used: promoData?.used || false,
        promo_code_string: promoData?.code || null,
        promo_code_expires: promoData?.expires || null,
        sms_sent: rawData.smsSentEmails.has(email),
        converted_at: ab.converted_at || null,
      });
    }

    // Process pending/failed registrations (post-submission)
    for (const reg of rawData.pendingRegs) {
      const email = reg.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email)) continue;

      const existing = leadMap.get(email);
      const tracking = trackingMap.get(email);
      const emailStats = emailCountsByRecipient.get(email);
      const attemptCount = (existing?.attempt_count || 0) + 1;
      const intent = intentByEmail.get(email);

      const computedFurthestStep = reg.stripe_session_id 
        ? (reg.payment_status === "failed" ? "payment_failed" : "checkout_started")
        : "form_submitted";

      const failureReason = reg.payment_status === "failed" 
        ? "Payment declined/failed" 
        : (reg.stripe_session_id ? "Checkout session expired" : "Never reached payment");

      const promoData = rawData.promoByEmail.get(email);
      leadMap.set(email, {
        email: reg.email,
        name: reg.name || existing?.name || null,
        phone: existing?.phone || promoData?.phone || null,
        source: reg.payment_status === "failed" ? "failed_registration" : "pending_registration",
        ticket_type: reg.ticket_type || existing?.ticket_type,
        furthest_step: computedFurthestStep,
        failure_reason: failureReason,
        attempt_count: attemptCount,
        first_seen: existing?.first_seen || reg.created_at,
        last_activity: reg.created_at > (existing?.last_activity || "") ? reg.created_at : (existing?.last_activity || reg.created_at),
        total_potential_value: reg.total_amount || 0,
        tracking_id: tracking?.id || existing?.tracking_id || null,
        status: tracking?.status || existing?.status || "new",
        assigned_to: tracking?.assigned_to || existing?.assigned_to || null,
        last_contacted_at: tracking?.last_contacted_at || existing?.last_contacted_at || null,
        recovery_emails_sent: emailStats?.count || existing?.recovery_emails_sent || 0,
        last_recovery_email: emailStats?.lastSent || existing?.last_recovery_email || null,
        has_checkout_error: errorsByEmail.has(email) || (existing?.has_checkout_error ?? false),
        chat_sessions: chatsByEmail.get(email)?.length || existing?.chat_sessions || 0,
        chat_email_captured: (chatsByEmail.get(email)?.length || 0) > 0 || (existing?.chat_email_captured ?? false),
        intent_signals: (intent?.count || 0) + (existing?.intent_signals || 0),
        ad_source: intent?.adSource || existing?.ad_source || null,
        device_type: intent?.deviceType || existing?.device_type || null,
        past_purchases: getProfile(reg.email),
        engagement_status: existing?.engagement_status || null,
        segments: existing?.segments || [],
        has_promo_code: !!promoData || (existing?.has_promo_code ?? false),
        promo_code_source: promoData?.source || existing?.promo_code_source || null,
        promo_code_used: promoData?.used || (existing?.promo_code_used ?? false),
        promo_code_string: promoData?.code || existing?.promo_code_string || null,
        promo_code_expires: promoData?.expires || existing?.promo_code_expires || null,
        sms_sent: rawData.smsSentEmails.has(email) || (existing?.sms_sent ?? false),
        converted_at: existing?.converted_at || null,
      });
    }

    // Process identified intent signals that aren't already in the map (browsed + entered email but never hit checkout_abandonment)
    for (const [email, intent] of intentByEmail) {
      if (leadMap.has(email) || rawData.paidEmails.has(email)) continue;
      
      const tracking = trackingMap.get(email);
      const emailStats = emailCountsByRecipient.get(email);

      const promoData = rawData.promoByEmail.get(email);
      leadMap.set(email, {
        email,
        name: intent.name || null,
        phone: promoData?.phone || null,
        source: "intent_signal",
        ticket_type: intent.ticketType,
        furthest_step: "browsing",
        failure_reason: "Browsed but never started checkout",
        attempt_count: intent.count,
        first_seen: intent.firstSeen,
        last_activity: intent.lastSeen,
        total_potential_value: 0,
        tracking_id: tracking?.id || null,
        status: tracking?.status || "new",
        assigned_to: tracking?.assigned_to || null,
        last_contacted_at: tracking?.last_contacted_at || null,
        recovery_emails_sent: emailStats?.count || 0,
        last_recovery_email: emailStats?.lastSent || null,
        has_checkout_error: false,
        chat_sessions: chatsByEmail.get(email)?.length || 0,
        chat_email_captured: (chatsByEmail.get(email)?.length || 0) > 0,
        intent_signals: intent.count,
        ad_source: intent.adSource,
        device_type: intent.deviceType,
        past_purchases: getProfile(email),
        engagement_status: null,
        segments: [],
        has_promo_code: !!promoData,
        promo_code_source: promoData?.source || null,
        promo_code_used: promoData?.used || false,
        promo_code_string: promoData?.code || null,
        promo_code_expires: promoData?.expires || null,
        sms_sent: rawData.smsSentEmails.has(email),
        converted_at: null,
      });
    }

    // Process anonymous intent signals with high signal counts (no email, but show as anonymous leads)
    for (const [sessionId, intent] of intentBySession) {
      // Only show anonymous sessions with multiple ticket selections (high intent)
      if (intent.count < 2) continue;
      
      const anonKey = `anon:${sessionId}`;
      leadMap.set(anonKey, {
        email: `anonymous-${sessionId.slice(0, 8)}`,
        name: null,
        phone: null,
        source: "anonymous_browsing",
        ticket_type: intent.ticketType,
        furthest_step: "browsing",
        failure_reason: "Anonymous visitor — never identified",
        attempt_count: intent.count,
        first_seen: intent.firstSeen,
        last_activity: intent.lastSeen,
        total_potential_value: 0,
        tracking_id: null,
        status: "new",
        assigned_to: null,
        last_contacted_at: null,
        recovery_emails_sent: 0,
        last_recovery_email: null,
        has_checkout_error: false,
        chat_sessions: 0,
        chat_email_captured: false,
        intent_signals: intent.count,
        ad_source: intent.adSource,
        device_type: intent.deviceType,
        past_purchases: { ...defaultProfile },
        engagement_status: null,
        segments: [],
        has_promo_code: false,
        promo_code_source: null,
        promo_code_used: false,
        promo_code_string: null,
        promo_code_expires: null,
        sms_sent: false,
        converted_at: null,
      });
    }

    // Enrich existing leads with newsletter/SMS data, and CREATE leads from site-activity sources
    const SITE_ACTIVITY_SOURCES = ["exit_intent_popup", "high_intent_popup"];
    for (const nl of (newsletterLeads || [])) {
      const email = nl.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email)) continue;

      const name = [nl.first_name, nl.last_name].filter(Boolean).join(" ").trim() || null;
      const normalizedSource =
        nl.source === "flodesk"
          ? "newsletter"
          : nl.source === "simpletexting"
            ? "sms_list"
            : nl.source;
      const shouldCreateLead = SITE_ACTIVITY_SOURCES.includes(nl.source);

      const existing = leadMap.get(email);
      if (existing) {
        // Enrich the existing lead with newsletter/SMS metadata
        if (!existing.name && name) existing.name = name;
        if (!existing.engagement_status && nl.engagement_status) existing.engagement_status = nl.engagement_status;
        if (nl.segments?.length) existing.segments = [...new Set([...existing.segments, ...nl.segments])];
        if (["newsletter", "sms_list", "csv_import"].includes(normalizedSource)) {
          existing.source = existing.source === "anonymous_browsing" ? normalizedSource : existing.source;
        }
      } else if (shouldCreateLead) {
        // Site-activity popups and known named contacts should appear as leads even before tracked browsing activity exists
        const tracking = trackingMap.get(email);
        const emailStats = emailCountsByRecipient.get(email);
        const promoData = rawData.promoByEmail.get(email);
        const isSiteActivityLead = SITE_ACTIVITY_SOURCES.includes(nl.source);
        leadMap.set(email, {
          email: nl.email,
          name,
          phone: promoData?.phone || null,
          source: normalizedSource,
          ticket_type: null,
          furthest_step: "email_captured",
          failure_reason: isSiteActivityLead
            ? "Gave email via popup but didn't start checkout"
            : `Known ${normalizedSource === "sms_list" ? "SMS" : normalizedSource === "newsletter" ? "newsletter" : "imported"} lead with captured identity but no tracked site activity yet`,
          attempt_count: 1,
          first_seen: nl.synced_at || nl.created_at || new Date().toISOString(),
          last_activity: nl.synced_at || nl.created_at || new Date().toISOString(),
          total_potential_value: 0,
          tracking_id: tracking?.id || null,
          status: tracking?.status || "new",
          assigned_to: tracking?.assigned_to || null,
          last_contacted_at: tracking?.last_contacted_at || null,
          recovery_emails_sent: emailStats?.count || 0,
          last_recovery_email: emailStats?.lastSent || null,
          has_checkout_error: false,
          chat_sessions: chatsByEmail.get(email)?.length || 0,
          chat_email_captured: (chatsByEmail.get(email)?.length || 0) > 0,
          intent_signals: isSiteActivityLead ? 1 : 0,
          ad_source: null,
          device_type: null,
          past_purchases: getProfile(nl.email),
          engagement_status: nl.engagement_status || null,
          segments: nl.segments || [],
          has_promo_code: !!promoData,
          promo_code_source: promoData?.source || null,
          promo_code_used: promoData?.used || false,
          promo_code_string: promoData?.code || null,
          promo_code_expires: promoData?.expires || null,
          sms_sent: rawData.smsSentEmails.has(email),
          converted_at: null,
        });
      }
      // If they're not already a lead and we still don't know who they are, keep list syncs enrichment-only
    }

    // Process crew bids (expired/pending = tried to buy but didn't complete)
    for (const bid of rawData.crewBids) {
      const email = bid.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email)) continue;
      const existing = leadMap.get(email);
      if (existing) {
        // Enrich — they tried to buy group tickets, that's high intent
        if (!existing.name && bid.captain_name) existing.name = bid.captain_name;
        if (!existing.ticket_type && bid.ticket_type) existing.ticket_type = bid.ticket_type;
        existing.source = "crew_bid";
        existing.furthest_step = "form_submitted";
        existing.total_potential_value = Math.max(existing.total_potential_value, (bid.bid_price || 0) * (bid.crew_size || 1) * 100);
      } else {
        const tracking = trackingMap.get(email);
        const promoData = rawData.promoByEmail.get(email);
        leadMap.set(email, {
          email: bid.email, name: bid.captain_name || null, phone: promoData?.phone || null,
          source: "crew_bid", ticket_type: bid.ticket_type,
          furthest_step: "form_submitted",
          failure_reason: `Crew bid ${bid.status} — ${bid.crew_size} tickets at $${bid.bid_price}`,
          attempt_count: 1, first_seen: bid.created_at, last_activity: bid.created_at,
          total_potential_value: (bid.bid_price || 0) * (bid.crew_size || 1) * 100,
          tracking_id: tracking?.id || null, status: tracking?.status || "new",
          assigned_to: tracking?.assigned_to || null, last_contacted_at: tracking?.last_contacted_at || null,
          recovery_emails_sent: 0, last_recovery_email: null,
          has_checkout_error: false, chat_sessions: 0, chat_email_captured: false,
          intent_signals: 2, ad_source: null, device_type: null,
          past_purchases: getProfile(bid.email),
          engagement_status: null, segments: [],
          has_promo_code: !!promoData, promo_code_source: promoData?.source || null,
          promo_code_used: promoData?.used || false, promo_code_string: promoData?.code || null,
          promo_code_expires: promoData?.expires || null,
          sms_sent: rawData.smsSentEmails.has(email), converted_at: null,
        });
      }
    }

    // Process raffle/giveaway entries (engaged with brand)
    for (const entry of rawData.raffleEntries) {
      const email = entry.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email)) continue;
      const existing = leadMap.get(email);
      if (existing) {
        if (!existing.name && entry.first_name) existing.name = entry.first_name;
      } else {
        const tracking = trackingMap.get(email);
        const promoData = rawData.promoByEmail.get(email);
        leadMap.set(email, {
          email: entry.email, name: entry.first_name || null, phone: promoData?.phone || null,
          source: "giveaway", ticket_type: null,
          furthest_step: "email_captured",
          failure_reason: `Entered giveaway (${entry.tier}) but hasn't purchased`,
          attempt_count: 1, first_seen: entry.created_at, last_activity: entry.created_at,
          total_potential_value: 0,
          tracking_id: tracking?.id || null, status: tracking?.status || "new",
          assigned_to: tracking?.assigned_to || null, last_contacted_at: tracking?.last_contacted_at || null,
          recovery_emails_sent: 0, last_recovery_email: null,
          has_checkout_error: false, chat_sessions: 0, chat_email_captured: false,
          intent_signals: 1, ad_source: null, device_type: null,
          past_purchases: getProfile(entry.email),
          engagement_status: null, segments: [],
          has_promo_code: !!promoData, promo_code_source: promoData?.source || null,
          promo_code_used: promoData?.used || false, promo_code_string: promoData?.code || null,
          promo_code_expires: promoData?.expires || null,
          sms_sent: rawData.smsSentEmails.has(email), converted_at: null,
        });
      }
    }

    // Process accommodation waitlist (very high intent — wants lodging but couldn't get it)
    for (const wl of rawData.waitlist) {
      const email = wl.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email)) continue;
      const existing = leadMap.get(email);
      if (existing) {
        if (!existing.name && wl.name) existing.name = wl.name;
        // Waitlist = they already want to come, just couldn't get lodging
        existing.source = existing.source === "anonymous_browsing" ? "accommodation_waitlist" : existing.source;
      } else {
        const tracking = trackingMap.get(email);
        const promoData = rawData.promoByEmail.get(email);
        leadMap.set(email, {
          email: wl.email, name: wl.name || null, phone: promoData?.phone || null,
          source: "accommodation_waitlist", ticket_type: null,
          furthest_step: "email_captured",
          failure_reason: "Joined accommodation waitlist — wants to attend",
          attempt_count: 1, first_seen: wl.created_at, last_activity: wl.created_at,
          total_potential_value: 0,
          tracking_id: tracking?.id || null, status: tracking?.status || "new",
          assigned_to: tracking?.assigned_to || null, last_contacted_at: tracking?.last_contacted_at || null,
          recovery_emails_sent: 0, last_recovery_email: null,
          has_checkout_error: false, chat_sessions: 0, chat_email_captured: false,
          intent_signals: 2, ad_source: null, device_type: null,
          past_purchases: getProfile(wl.email),
          engagement_status: null, segments: [],
          has_promo_code: !!promoData, promo_code_source: promoData?.source || null,
          promo_code_used: promoData?.used || false, promo_code_string: promoData?.code || null,
          promo_code_expires: promoData?.expires || null,
          sms_sent: rawData.smsSentEmails.has(email), converted_at: null,
        });
      }
    }

    // Process contact submissions that look like potential ticket buyers (not vendor/artist inquiries)
    const VENDOR_KEYWORDS = /\b(vendor|booth|lineup|epk|art install|catering|sponsor|freelance|marketing|writer|SEO|booking|agency)\b/i;
    for (const cs of rawData.contactSubmissions) {
      const email = cs.email?.toLowerCase();
      if (!email || rawData.paidEmails.has(email) || leadMap.has(email)) continue;
      // Skip vendor/artist/business inquiries
      if (VENDOR_KEYWORDS.test(cs.message || "")) continue;
      
      const tracking = trackingMap.get(email);
      const promoData = rawData.promoByEmail.get(email);
      leadMap.set(email, {
        email: cs.email, name: cs.name || null, phone: promoData?.phone || null,
        source: "contact_form", ticket_type: null,
        furthest_step: "email_captured",
        failure_reason: "Reached out via contact form",
        attempt_count: 1, first_seen: cs.created_at, last_activity: cs.created_at,
        total_potential_value: 0,
        tracking_id: tracking?.id || null, status: tracking?.status || "new",
        assigned_to: tracking?.assigned_to || null, last_contacted_at: tracking?.last_contacted_at || null,
        recovery_emails_sent: 0, last_recovery_email: null,
        has_checkout_error: false, chat_sessions: chatsByEmail.get(email)?.length || 0, chat_email_captured: false,
        intent_signals: 1, ad_source: null, device_type: null,
        past_purchases: getProfile(cs.email),
        engagement_status: null, segments: [],
        has_promo_code: !!promoData, promo_code_source: promoData?.source || null,
        promo_code_used: promoData?.used || false, promo_code_string: promoData?.code || null,
        promo_code_expires: promoData?.expires || null,
        sms_sent: rawData.smsSentEmails.has(email), converted_at: null,
      });
    }

    const TEST_EMAIL_PATTERNS = [
      /@example\.com$/i,
      /@test\.internal$/i,
      /canary@/i,
      /e2e[-_]?test/i,
      /@lovable\.dev$/i,
      /\+test@/i,
    ];
    const isTestEmail = (email: string) => TEST_EMAIL_PATTERNS.some(p => p.test(email));

    return Array.from(leadMap.values())
      .filter(lead => !isTestEmail(lead.email))
      .sort((a, b) => {
        // Sort by: high intent first, then recency
        const scoreA = getIntentScore(a);
        const scoreB = getIntentScore(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
      });
  }, [rawData, emailLogs, newsletterLeads]);

  // Filter leads
  // Sources that indicate real buying intent (not just being on a mailing list)
  const HOT_SOURCES = new Set([
    "checkout_abandonment", "failed_registration", "pending_registration",
    "intent_signal", "crew_bid", "accommodation_waitlist",
    "exit_intent_popup", "high_intent_popup", "contact_form", "giveaway",
  ]);

  const filteredLeads = useMemo(() => {
    let filtered = leads;

    if (statusFilter === "hot") {
      // Only leads with real site engagement or active intent — no passive list subscribers
      filtered = filtered.filter(l => 
        !["converted", "closed", "lost"].includes(l.status) &&
        (HOT_SOURCES.has(l.source) || l.has_promo_code || l.intent_signals >= 1 || l.furthest_step !== "email_captured" || l.chat_sessions > 0)
      );
    } else if (statusFilter === "popup") {
      // People who responded to a popup coupon offer
      filtered = filtered.filter(l =>
        !["converted", "closed", "lost"].includes(l.status) &&
        (l.has_promo_code || l.source === "exit_intent_popup" || l.source === "high_intent_popup")
      );
    } else if (statusFilter === "active") {
      filtered = filtered.filter(l => !["converted", "closed", "lost"].includes(l.status));
    } else if (statusFilter === "expiring_soon") {
      const now = Date.now();
      const twelveHours = 12 * 60 * 60 * 1000;
      filtered = filtered.filter(l => {
        if (!l.promo_code_expires || l.promo_code_used) return false;
        const expiresAt = new Date(l.promo_code_expires).getTime();
        return expiresAt > now && expiresAt - now < twelveHours;
      });
    } else if (statusFilter !== "all") {
      filtered = filtered.filter(l => l.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.email.toLowerCase().includes(q) || 
        l.name?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [leads, statusFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const active = leads.filter(l => !["converted", "closed", "lost"].includes(l.status));
    const highIntent = active.filter(l => getIntentScore(l) >= 3);
    const converted = leads.filter(l => l.status === "converted" || l.status === "closed");
    const contacted = active.filter(l => l.status === "contacted" || l.status === "nurturing");
    
    // Revenue pipeline
    const revenuePipeline = active.reduce((sum, l) => sum + (l.total_potential_value || 0), 0);
    
    // Expiring soon count
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;
    const expiringSoon = active.filter(l => {
      if (!l.promo_code_expires || l.promo_code_used) return false;
      const expiresAt = new Date(l.promo_code_expires).getTime();
      return expiresAt > now && expiresAt - now < twelveHours;
    }).length;

    // Funnel breakdown
    const funnel = {
      browsing: active.filter(l => l.furthest_step === "browsing").length,
      email_captured: active.filter(l => l.furthest_step === "email_captured").length,
      form_started: active.filter(l => l.furthest_step === "form_started").length,
      form_submitted: active.filter(l => l.furthest_step === "form_submitted").length,
      checkout_started: active.filter(l => l.furthest_step === "checkout_started").length,
      payment_failed: active.filter(l => l.furthest_step === "payment_failed").length,
    };

    // Device breakdown
    const devices = {
      mobile: active.filter(l => l.device_type === "mobile").length,
      desktop: active.filter(l => l.device_type === "desktop").length,
      tablet: active.filter(l => l.device_type === "tablet").length,
      unknown: active.filter(l => !l.device_type).length,
    };

    return { total: active.length, highIntent: highIntent.length, converted: converted.length, contacted: contacted.length, revenuePipeline, expiringSoon, funnel, devices };
  }, [leads]);

  // Fetch notes for selected lead
  const { data: leadNotes = [] } = useAuthQuery({
    queryKey: ["lead-notes", selectedLead?.tracking_id],
    queryFn: async () => {
      if (!selectedLead?.tracking_id) return [];
      const { data, error } = await supabase
        .from("lead_notes")
        .select("id, note, created_by, created_at")
        .eq("lead_id", selectedLead.tracking_id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get creator names
      const creatorIds = [...new Set((data || []).map(n => n.created_by).filter(Boolean))];
      let creatorMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles").select("id, full_name, email")
          .in("id", creatorIds as string[]);
        creatorMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.email || "Unknown"]));
      }

      return (data || []).map(n => ({
        ...n,
        creator_name: n.created_by ? creatorMap.get(n.created_by) || "Unknown" : "System",
      })) as LeadNote[];
    },
    enabled: !!selectedLead?.tracking_id,
  });

  // Upsert lead tracking record
  const upsertTracking = useMutation({
    mutationFn: async ({ email, name, status, source, ticket_type }: { 
      email: string; name?: string | null; status: string; source: string; ticket_type?: string | null 
    }) => {
      const { data: existing } = await supabase
        .from("lead_tracking").select("id").eq("email", email).maybeSingle();

      if (existing) {
        const { error } = await supabase.from("lead_tracking")
          .update({ status, last_contacted_at: status === "contacted" ? new Date().toISOString() : undefined })
          .eq("id", existing.id);
        if (error) throw error;
        return existing.id;
      } else {
        const { data, error } = await supabase.from("lead_tracking")
          .insert({ email, name, status, source, ticket_type_interest: ticket_type })
          .select("id").single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads-crm-data"] });
    },
  });

  // Update lead status
  const handleStatusChange = async (lead: UnifiedLead, newStatus: string) => {
    try {
      await upsertTracking.mutateAsync({
        email: lead.email,
        name: lead.name,
        status: newStatus,
        source: lead.source,
        ticket_type: lead.ticket_type,
      });
      toast.success(`Lead marked as ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      if (selectedLead?.email === lead.email) {
        setSelectedLead({ ...lead, status: newStatus });
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  // Add note
  const addNoteMutation = useMutation({
    mutationFn: async ({ leadId, note }: { leadId: string; note: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("lead_notes")
        .insert({ lead_id: leadId, note, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["lead-notes"] });
      toast.success("Note added");
    },
    onError: () => toast.error("Failed to add note"),
  });

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedLead) return;

    let trackingId = selectedLead.tracking_id;
    if (!trackingId) {
      trackingId = await upsertTracking.mutateAsync({
        email: selectedLead.email,
        name: selectedLead.name,
        status: selectedLead.status,
        source: selectedLead.source,
        ticket_type: selectedLead.ticket_type,
      });
      setSelectedLead({ ...selectedLead, tracking_id: trackingId });
    }

    addNoteMutation.mutate({ leadId: trackingId, note: newNote.trim() });
  };

  // Outreach logging: auto-log note + move to contacted
  const handleOutreachLog = async (lead: UnifiedLead, method: string) => {
    const methodLabel = method === "email" ? "📧 Email sent" : method === "text" ? "💬 Text sent" : "📞 Called";
    
    // Auto-move to contacted if currently "new"
    if (lead.status === "new") {
      await handleStatusChange(lead, "contacted");
    }

    // Auto-add note
    let trackingId = lead.tracking_id;
    if (!trackingId) {
      trackingId = await upsertTracking.mutateAsync({
        email: lead.email,
        name: lead.name,
        status: "contacted",
        source: lead.source,
        ticket_type: lead.ticket_type,
      });
      if (selectedLead?.email === lead.email) {
        setSelectedLead({ ...lead, tracking_id: trackingId, status: "contacted" });
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("lead_notes").insert({ 
      lead_id: trackingId, 
      note: `${methodLabel} to ${lead.name || lead.email}`, 
      created_by: user?.id 
    });
    queryClient.invalidateQueries({ queryKey: ["lead-notes"] });
    queryClient.invalidateQueries({ queryKey: ["leads-crm-data"] });
  };

  // Map AI predictions to selected lead
  const selectedLeadWithAi = useMemo(() => {
    if (!selectedLead) return null;
    const activeLeads = leads.filter(l => !["converted", "closed", "lost"].includes(l.status));
    const idx = activeLeads.findIndex(l => l.email === selectedLead.email);
    const pred = aiPredictions.find(p => p.index === idx);
    return pred ? { ...selectedLead, ai_prediction: pred } : selectedLead;
  }, [selectedLead, aiPredictions, leads]);

  const formatTicketType = (type: string) => 
    type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <AdminPageHeader
          icon={Target}
          title="Lead Recovery"
          subtitle={`${stats.total} active leads • ${stats.highIntent} high intent • ${stats.converted} converted`}
        />
        <div className="flex gap-2 shrink-0">
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={handleSyncFlodesk}
            disabled={isSyncingFlodesk}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncingFlodesk ? "animate-spin" : ""}`} />
            {isSyncingFlodesk ? "Syncing..." : "Sync Flodesk"}
          </AdminButton>
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={handleRegisterWebhooks}
            disabled={isRegisteringWebhooks}
            className="gap-1.5"
          >
            <Webhook className={`h-3.5 w-3.5 ${isRegisteringWebhooks ? "animate-spin" : ""}`} />
            {isRegisteringWebhooks ? "Connecting..." : "Connect Webhooks"}
          </AdminButton>
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={handleSyncSms}
            disabled={isSyncingSms}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncingSms ? "animate-spin" : ""}`} />
            {isSyncingSms ? "Syncing..." : "Sync SMS"}
          </AdminButton>
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={() => csvInputRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </AdminButton>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvImport}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} label="Active Leads" value={stats.total} color="text-[hsl(var(--admin-primary))]" />
        <StatCard icon={Zap} label="High Intent" value={stats.highIntent} color="text-[hsl(var(--admin-warning))]" />
        <StatCard icon={MessageSquare} label="Contacted" value={stats.contacted} color="text-[hsl(var(--admin-info))]" />
        <StatCard icon={UserCheck} label="Converted" value={stats.converted} color="text-[hsl(var(--admin-success))]" />
        <StatCard icon={DollarSign} label="Pipeline" value={`$${Math.round(stats.revenuePipeline / 100).toLocaleString()}`} color="text-[hsl(var(--admin-primary))]" />
        {stats.expiringSoon > 0 && (
          <div onClick={() => setStatusFilter("expiring_soon")} className="cursor-pointer">
            <StatCard icon={Timer} label="Expiring Soon" value={stats.expiringSoon} color="text-[hsl(var(--admin-danger))]" />
          </div>
        )}
      </div>

      {/* Funnel & Device Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AdminCard>
          <AdminCardContent className="py-3 px-4">
            <p className="text-xs font-semibold text-[hsl(var(--admin-text-muted))] uppercase tracking-wide mb-3">Checkout Funnel</p>
            <div className="space-y-2">
              {([
                ["browsing", "Browsing", stats.funnel.browsing],
                ["email_captured", "Email Captured", stats.funnel.email_captured],
                ["form_submitted", "Form Submitted", stats.funnel.form_submitted],
                ["checkout_started", "Hit Stripe", stats.funnel.checkout_started],
                ["payment_failed", "Payment Failed", stats.funnel.payment_failed],
              ] as [string, string, number][]).map(([key, label, count]) => {
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-[hsl(var(--admin-text-muted))] w-28 shrink-0">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-[hsl(var(--admin-border))] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--admin-primary))]"
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[hsl(var(--admin-text))] w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardContent className="py-3 px-4">
            <p className="text-xs font-semibold text-[hsl(var(--admin-text-muted))] uppercase tracking-wide mb-3">Device Breakdown</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                [Smartphone, "Mobile", stats.devices.mobile],
                [Monitor, "Desktop", stats.devices.desktop],
                [Tablet, "Tablet", stats.devices.tablet],
                [Eye, "Unknown", stats.devices.unknown],
              ] as [any, string, number][]).map(([Icon, label, count]) => (
                <div key={label} className="flex items-center gap-2 p-2 rounded bg-[hsl(var(--admin-surface-hover))]">
                  <Icon className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--admin-text))]">{count}</p>
                    <p className="text-[10px] text-[hsl(var(--admin-text-muted))]">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Getting Started Guide - Collapsible */}
      <AdminCard className="border-[hsl(var(--admin-primary)/0.3)] bg-[hsl(var(--admin-primary)/0.04)]">
        <AdminCardContent className="py-0 px-0">
          <button
            onClick={() => setShowGettingStarted(!showGettingStarted)}
            className="w-full flex items-center justify-between py-3 px-5 hover:bg-[hsl(var(--admin-primary)/0.06)] transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
              <span className="text-sm font-semibold text-[hsl(var(--admin-text))]">How to Use Lead Recovery</span>
              <AdminBadge intent="info" className="text-[10px]">Setup Guide</AdminBadge>
            </div>
            {showGettingStarted ? (
              <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            )}
          </button>

          {showGettingStarted && (
            <div className="px-5 pb-4 space-y-3">
              <p className="text-xs text-[hsl(var(--admin-text-muted))] leading-relaxed">
                Leads become valuable when they have <strong>site activity signals</strong> — like visiting your ticket page, adding to cart, or entering their email.
                To connect marketing campaigns to this tracker, add <strong>UTM parameters</strong> to your links.
                AI scoring works best on leads with real intent data (not just newsletter subscribers).
              </p>

              <div className="space-y-2">
                <p className="text-xs font-medium text-[hsl(var(--admin-text))]">📱 SMS Campaign Link (copy & paste):</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-[11px] bg-[hsl(var(--admin-bg-muted))] text-[hsl(var(--admin-text))] px-3 py-2 rounded border border-[hsl(var(--admin-border))] select-all break-all">
                    https://example.org/tickets?utm_source=simpletexting&utm_medium=sms&utm_campaign=analog-commons-2026
                  </code>
                  <AdminButton
                    variant="adminOutline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText("https://example.org/tickets?utm_source=simpletexting&utm_medium=sms&utm_campaign=analog-commons-2026");
                      toast.success("Copied SMS link!");
                    }}
                  >
                    Copy
                  </AdminButton>
                </div>

                <p className="text-xs font-medium text-[hsl(var(--admin-text))] mt-2">📧 Email Campaign Link:</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-[11px] bg-[hsl(var(--admin-bg-muted))] text-[hsl(var(--admin-text))] px-3 py-2 rounded border border-[hsl(var(--admin-border))] select-all break-all">
                    https://example.org/tickets?utm_source=flodesk&utm_medium=email&utm_campaign=analog-commons-2026
                  </code>
                  <AdminButton
                    variant="adminOutline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText("https://example.org/tickets?utm_source=flodesk&utm_medium=email&utm_campaign=analog-commons-2026");
                      toast.success("Copied email link!");
                    }}
                  >
                    Copy
                  </AdminButton>
                </div>

                <p className="text-xs font-medium text-[hsl(var(--admin-text))] mt-2">📢 Facebook / Instagram Ad Link:</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-[11px] bg-[hsl(var(--admin-bg-muted))] text-[hsl(var(--admin-text))] px-3 py-2 rounded border border-[hsl(var(--admin-border))] select-all break-all">
                    {"https://example.org/tickets?utm_source=facebook&utm_medium=paid&utm_campaign=analog-commons-2026&utm_content={{ad.name}}"}
                  </code>
                  <AdminButton
                    variant="adminOutline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText("https://example.org/tickets?utm_source=facebook&utm_medium=paid&utm_campaign=analog-commons-2026&utm_content={{ad.name}}");
                      toast.success("Copied ad link!");
                    }}
                  >
                    Copy
                  </AdminButton>
                </div>
              </div>

              <div className="bg-[hsl(var(--admin-bg-muted))] rounded p-3 mt-2">
                <p className="text-[11px] text-[hsl(var(--admin-text-muted))] leading-relaxed">
                  <strong>💡 What happens next:</strong> When someone clicks your link and visits the site, they appear here as an anonymous lead.
                  If they select a ticket, enter their email, or add to cart — those signals stack and the AI can score them accurately.
                  Returning past customers are automatically matched and flagged as high-intent.
                </p>
              </div>
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* AI Insights Panel */}
      <AdminCard>
        <AdminCardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
              <span className="text-sm font-medium text-[hsl(var(--admin-text))]">AI Lead Scoring</span>
              {aiPredictions.length > 0 && (
                <AdminBadge intent="success" className="text-[10px]">{aiPredictions.length} scored</AdminBadge>
              )}
            </div>
            <AdminButton
              variant="admin"
              size="sm"
              onClick={handleRunAiScoring}
              disabled={isRunningAi || leads.length === 0}
              className="gap-1.5"
            >
              <Zap className={`h-3.5 w-3.5 ${isRunningAi ? "animate-pulse" : ""}`} />
              {isRunningAi ? "Analyzing..." : "Score Leads with AI"}
            </AdminButton>
          </div>

          {showInsights && aiPredictions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">Most Likely to Convert</p>
              {aiPredictions
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((pred, i) => {
                  const matchedLead = leads.filter(l => !["converted", "closed", "lost"].includes(l.status))[pred.index as number];
                  if (!matchedLead) return null;
                  return (
                    <div
                      key={i}
                      className="p-2.5 rounded-md bg-[hsl(var(--admin-surface-hover))] cursor-pointer hover:bg-[hsl(var(--admin-hover))] transition-colors"
                      onClick={() => setSelectedLead(matchedLead)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
                          {matchedLead.name || matchedLead.email}
                        </span>
                        <AdminBadge intent={pred.score >= 70 ? "success" : pred.score >= 40 ? "warning" : "neutral"}>
                          {pred.score}% likely
                        </AdminBadge>
                      </div>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">{pred.reasoning}</p>
                      <p className="text-xs text-[hsl(var(--admin-primary))] mt-1 font-medium">→ {pred.recommended_action}</p>
                    </div>
                  );
                })}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminInput
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <AdminSelect value={statusFilter} onValueChange={setStatusFilter}>
          <AdminSelectItem value="hot">🔥 Hot Leads</AdminSelectItem>
          <AdminSelectItem value="popup">🎟️ Popup / Promo</AdminSelectItem>
          <AdminSelectItem value="active">All Active</AdminSelectItem>
          <AdminSelectItem value="expiring_soon">⏰ Expiring Soon</AdminSelectItem>
          <AdminSelectItem value="all">Everything</AdminSelectItem>
          <AdminSelectItem value="contacted">Contacted</AdminSelectItem>
          <AdminSelectItem value="nurturing">Nurturing</AdminSelectItem>
          <AdminSelectItem value="converted">Converted</AdminSelectItem>
          <AdminSelectItem value="closed">Closed</AdminSelectItem>
        </AdminSelect>
      </div>

      {/* Main content: list + detail */}
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Lead List */}
        <div className="min-h-0 lg:col-span-3">
          <AdminCard className="h-full">
            <AdminCardHeader>
              <AdminCardTitle className="text-sm">
                {filteredLeads.length} Lead{filteredLeads.length !== 1 ? "s" : ""}
              </AdminCardTitle>
            </AdminCardHeader>
            <AdminCardContent className="min-h-0 p-0">
              <AdminScrollArea className="h-[calc(100dvh-16rem)] min-h-[24rem]">
                {isLoading ? (
                  <div className="p-8 text-center text-[hsl(var(--admin-text-muted))]">Loading leads...</div>
                ) : filteredLeads.length === 0 ? (
                  <div className="p-8 text-center text-[hsl(var(--admin-text-muted))]">No leads match your filters</div>
                ) : (
                  <div className="divide-y divide-[hsl(var(--admin-border))]">
                    {filteredLeads.map((lead) => (
                      <LeadRow
                        key={lead.email}
                        lead={lead}
                        isSelected={selectedLead?.email === lead.email}
                        onClick={() => setSelectedLead(lead)}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                )}
              </AdminScrollArea>
            </AdminCardContent>
          </AdminCard>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-2">
          {selectedLead ? (
            <>
              <LeadDetailPanel
                lead={selectedLeadWithAi || selectedLead}
                notes={leadNotes}
                newNote={newNote}
                onNewNoteChange={setNewNote}
                onAddNote={handleAddNote}
                isAddingNote={addNoteMutation.isPending}
                onStatusChange={handleStatusChange}
                onEmailClick={() => { setAiDraftBundle(null); setShowEmailComposer(true); }}
                onSmsClick={() => setShowSmsComposer(true)}
                onOutreachLog={handleOutreachLog}
                onAiDraftClick={() => {
                  const bundle = buildLeadDraftBundle(selectedLeadWithAi || selectedLead);
                  setAiDraftBundle(bundle);
                  handleOutreachLog(selectedLeadWithAi || selectedLead, "email");
                  setShowEmailComposer(true);
                }}
              />

              {/* Email Composer */}
              <IndividualEmailComposer
                recipientEmail={selectedLead.email}
                recipientName={selectedLead.name || selectedLead.email}
                isOpen={showEmailComposer}
                onClose={() => { setShowEmailComposer(false); setAiDraftBundle(null); }}
                defaultCc={["inbox@example.org"]}
                leadEmail={selectedLead.email}
                autoDraftPrompt={aiDraftBundle?.prompt}
                leadContext={aiDraftBundle?.context}
                onSent={() => {
                  queryClient.invalidateQueries({ queryKey: ["leads-crm-data"] });
                  queryClient.invalidateQueries({ queryKey: ["lead-notes"] });
                }}
              />

              {/* SMS Composer */}
              {selectedLead.phone && (
                <LeadSmsComposer
                  recipientPhone={selectedLead.phone}
                  recipientName={selectedLead.name || selectedLead.email}
                  leadEmail={selectedLead.email}
                  isOpen={showSmsComposer}
                  onClose={() => setShowSmsComposer(false)}
                  onSent={() => {
                    queryClient.invalidateQueries({ queryKey: ["leads-crm-data"] });
                    queryClient.invalidateQueries({ queryKey: ["lead-notes"] });
                  }}
                />
              )}
            </>
          ) : (
            <AdminCard>
              <AdminCardContent className="py-16 text-center">
                <Eye className="h-10 w-10 mx-auto mb-3 text-[hsl(var(--admin-text-muted))] opacity-40" />
                <p className="text-[hsl(var(--admin-text-muted))]">Select a lead to view details</p>
              </AdminCardContent>
            </AdminCard>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: intent score
function getIntentScore(lead: UnifiedLead): number {
  return getIntentReasons(lead).reduce((sum, r) => sum + r.points, 0);
}

interface IntentReason {
  label: string;
  points: number;
  emoji?: string;
}

/** Returns the labeled reasons that drive a lead's intent score, in points-desc order. */
function getIntentReasons(lead: UnifiedLead): IntentReason[] {
  const reasons: IntentReason[] = [];
  // Checkout progress
  if (lead.furthest_step === "payment_failed") reasons.push({ label: "Payment failed at checkout", points: 4, emoji: "💳" });
  else if (lead.furthest_step === "checkout_started") reasons.push({ label: "Reached Stripe checkout", points: 3, emoji: "🛒" });
  else if (lead.furthest_step === "form_submitted") reasons.push({ label: "Submitted checkout form", points: 2 });
  else if (lead.furthest_step === "email_captured") reasons.push({ label: "Captured email on site", points: 1 });
  // Past purchase history
  const pp = lead.past_purchases;
  if (pp.is_returning) reasons.push({ label: "Returning attendee", points: 3, emoji: "🔄" });
  else if (pp.total_events >= 1) reasons.push({ label: "Past Cosmico buyer", points: 2 });
  if (pp.had_vip) reasons.push({ label: "Bought VIP before", points: 2, emoji: "⭐" });
  if (pp.total_spent > 50000) reasons.push({ label: `Lifetime spend $${(pp.total_spent / 100).toFixed(0)}`, points: 2 });
  else if (pp.total_spent > 20000) reasons.push({ label: `Lifetime spend $${(pp.total_spent / 100).toFixed(0)}`, points: 1 });
  if (pp.had_lodging) reasons.push({ label: "Booked lodging before", points: 1 });
  if (pp.had_addon) reasons.push({ label: "Bought add-ons before", points: 1 });
  // Source-specific buying intent
  if (lead.source === "crew_bid") reasons.push({ label: "Submitted crew bid (group buy)", points: 3, emoji: "👥" });
  if (lead.source === "accommodation_waitlist") reasons.push({ label: "On lodging waitlist", points: 2, emoji: "🏕️" });
  if (lead.source === "exit_intent_popup" || lead.source === "high_intent_popup") reasons.push({ label: "Engaged with popup offer", points: 2 });
  if (lead.source === "giveaway") reasons.push({ label: "Entered giveaway", points: 1 });
  if (lead.source === "contact_form") reasons.push({ label: "Reached out via contact form", points: 1 });
  // Behavioral
  if (lead.attempt_count > 1) reasons.push({ label: `${lead.attempt_count} checkout attempts`, points: 1 });
  if (lead.has_checkout_error) reasons.push({ label: "Hit a checkout error", points: 1, emoji: "⚠️" });
  if (lead.chat_email_captured) reasons.push({ label: "Asked support a question", points: 2, emoji: "💬" });
  else if (lead.chat_sessions > 0) reasons.push({ label: "Visited support chat", points: 1 });
  if (lead.total_potential_value > 20000) reasons.push({ label: `Cart value $${(lead.total_potential_value / 100).toFixed(0)}+`, points: 1 });
  if (lead.intent_signals >= 3) reasons.push({ label: `${lead.intent_signals} ticket selections`, points: 2 });
  else if (lead.intent_signals >= 1) reasons.push({ label: `Picked a ticket type`, points: 1 });
  if (lead.ad_source) reasons.push({ label: `Came from ${lead.ad_source} ad`, points: 1 });
  // Outreach engagement
  if (lead.recovery_emails_sent >= 2) reasons.push({ label: `${lead.recovery_emails_sent} recovery emails sent`, points: 2 });
  else if (lead.recovery_emails_sent >= 1) reasons.push({ label: "Recovery email sent", points: 1 });
  if (lead.has_promo_code && !lead.promo_code_used) reasons.push({ label: "Holding active promo code", points: 2, emoji: "🎟️" });
  if (lead.sms_sent) reasons.push({ label: "Already SMS'd", points: 1 });
  // Email engagement
  if (lead.engagement_status === 'active') reasons.push({ label: "Active on email list", points: 1 });
  if (lead.segments && lead.segments.length > 1) reasons.push({ label: `In ${lead.segments.length} segments`, points: 1 });
  // Identity completeness
  if (lead.name) reasons.push({ label: "Name on file", points: 1 });
  if (lead.phone) reasons.push({ label: "Phone on file", points: 1 });

  return reasons.sort((a, b) => b.points - a.points);
}

/** Build a rich AI draft prompt + context bundle for a lead. */
function buildLeadDraftBundle(lead: UnifiedLead): { prompt: string; context: string } {
  const reasons = getIntentReasons(lead);
  const score = reasons.reduce((s, r) => s + r.points, 0);
  const firstName = lead.name?.split(" ")[0] || null;

  const ticketLabel = lead.ticket_type
    ? lead.ticket_type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : null;

  const lines: string[] = [];
  lines.push(`Lead: ${lead.name || lead.email} (${lead.email})`);
  lines.push(`Intent score: ${score}`);
  if (ticketLabel) lines.push(`Looking at: ${ticketLabel}`);
  lines.push(`Furthest step: ${STEP_LABELS[lead.furthest_step] || lead.furthest_step}`);
  if (lead.failure_reason) lines.push(`Failure reason: ${lead.failure_reason}`);
  if (lead.total_potential_value > 0) lines.push(`Cart value: $${(lead.total_potential_value / 100).toFixed(0)}`);
  if (lead.attempt_count > 1) lines.push(`Attempts: ${lead.attempt_count}`);
  if (lead.past_purchases.is_returning) lines.push(`Returning attendee — past events: ${lead.past_purchases.total_events}, lifetime spend $${(lead.past_purchases.total_spent / 100).toFixed(0)}${lead.past_purchases.had_vip ? ', has bought VIP before' : ''}`);
  if (lead.has_promo_code && !lead.promo_code_used && lead.promo_code_string) {
    lines.push(`Has unused promo code: ${lead.promo_code_string}${lead.promo_code_expires ? ` (expires ${new Date(lead.promo_code_expires).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })})` : ''}`);
  }
  if (lead.ad_source) lines.push(`Traffic source: ${lead.ad_source}`);
  lines.push(`Top reasons this lead is hot: ${reasons.slice(0, 5).map(r => r.label).join("; ")}`);

  const context = lines.join("\n");

  // Tailor the prompt by furthest step
  let prompt: string;
  if (lead.furthest_step === "payment_failed" || lead.furthest_step === "checkout_started") {
    prompt = `Write a warm, personal recovery email from the Cosmico team to ${firstName || "this person"}. They got all the way to checkout for ${ticketLabel || "Cosmico 2026"} but didn't complete. Acknowledge what they were looking at, offer to help with anything blocking them (questions, payment plans, holding their spot since we're capped at 700), and make it easy to come back. Don't apologize — just be human and helpful.`;
  } else if (lead.past_purchases.is_returning) {
    prompt = `Write a warm, personal note from the Cosmico team to ${firstName || "this returning attendee"}. They've been to past Cosmico events and are looking at coming back for Cosmico 2026. Reference their history briefly without listing it back to them. Tell them we'd love to have them again and offer to help with whatever they need.`;
  } else if (lead.source === "crew_bid") {
    prompt = `Write a warm, personal note from the Cosmico team to ${firstName || "this crew captain"}. They submitted a crew bid to bring a group to Cosmico 2026. Thank them for thinking of bringing their people, ask if they have questions about how the group flow works, and offer to help line up tickets for the whole crew.`;
  } else if (lead.has_promo_code && !lead.promo_code_used) {
    prompt = `Write a warm, personal nudge from the Cosmico team to ${firstName || "this person"}. They have an unused promo code (${lead.promo_code_string}) that's about to expire. Remind them gently it's there if they want it, mention we're at 700-person cap and tickets are moving, and offer to help with anything.`;
  } else {
    prompt = `Write a warm, personal outreach email from the Cosmico team to ${firstName || "this person"}. They've shown interest in Cosmico 2026 (see context). Reach out like a friend, acknowledge what's drawing them in, and offer to help with anything they're wondering about.`;
  }

  return { prompt, context };
}


function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <AdminCard>
      <AdminCardContent className="py-3 px-4 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${color}`} />
        <div>
          <p className="text-xl font-bold text-[hsl(var(--admin-text))]">{value}</p>
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">{label}</p>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}

function LeadRow({ lead, isSelected, onClick, onStatusChange }: {
  lead: UnifiedLead; isSelected: boolean; onClick: () => void;
  onStatusChange: (lead: UnifiedLead, status: string) => void;
}) {
  const reasons = getIntentReasons(lead);
  const intentScore = reasons.reduce((s, r) => s + r.points, 0);
  const heatLabel = intentScore >= 10 ? "🔥🔥 Scorching" : intentScore >= 6 ? "🔥 Hot" : intentScore >= 3 ? "Warm" : "Cool";
  const heatIntent: "danger" | "warning" | "info" | "neutral" =
    intentScore >= 10 ? "danger" : intentScore >= 6 ? "warning" : intentScore >= 3 ? "info" : "neutral";
  const topReason = reasons[0];
  const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;

  return (
    <div
      className={`p-3 cursor-pointer transition-colors hover:bg-[hsl(var(--admin-hover))] ${
        isSelected ? "bg-[hsl(var(--admin-surface-hover))] border-l-2 border-[hsl(var(--admin-primary))]" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-[hsl(var(--admin-text))] truncate">
              {lead.name || lead.email}
            </span>
            {intentScore >= 4 && (
              <AdminBadge intent={heatIntent} className="text-[10px] px-1.5 py-0" title={`Intent score: ${intentScore}`}>
                {heatLabel} · {intentScore}
              </AdminBadge>
            )}
            {lead.past_purchases.is_returning && (
              <AdminBadge intent="success" className="text-[10px] px-1.5 py-0">🔄 Returning</AdminBadge>
            )}
            {!lead.past_purchases.is_returning && lead.past_purchases.total_events >= 1 && (
              <AdminBadge intent="info" className="text-[10px] px-1.5 py-0">Past Buyer</AdminBadge>
            )}
          </div>
          {lead.name && (
            <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{lead.email}</p>
          )}
          {topReason && (
            <p className="text-[11px] text-[hsl(var(--admin-text))] mt-1 font-medium leading-snug" title={reasons.slice(0, 6).map(r => r.label).join(" · ")}>
              <span className="text-[hsl(var(--admin-text-muted))]">Why hot: </span>
              {topReason.emoji ? `${topReason.emoji} ` : ""}{topReason.label}
              {reasons.length > 1 && (
                <span className="text-[hsl(var(--admin-text-muted))]"> + {reasons.length - 1} more</span>
              )}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
              {STEP_LABELS[lead.furthest_step] || lead.furthest_step}
            </span>
            {lead.ticket_type && (
              <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
                • {lead.ticket_type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </span>
            )}
            {lead.intent_signals > 0 && (
              <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
                • {lead.intent_signals} signal{lead.intent_signals !== 1 ? "s" : ""}
              </span>
            )}
            {lead.ad_source && (
              <AdminBadge intent="info" className="text-[10px] px-1.5 py-0">
                via {lead.ad_source}
              </AdminBadge>
            )}
            {(lead.source === "newsletter" || lead.source === "csv_import" || lead.source === "sms_list") && (
              <AdminBadge intent="neutral" className="text-[10px] px-1.5 py-0">
                <Newspaper className="h-2.5 w-2.5 mr-0.5" />
                {lead.source === "newsletter" ? "Newsletter" : lead.source === "sms_list" ? "SMS List" : "Imported"}
              </AdminBadge>
            )}
            {lead.source === "crew_bid" && (
              <AdminBadge intent="warning" className="text-[10px] px-1.5 py-0">
                <Users className="h-2.5 w-2.5 mr-0.5" />
                Crew Bid
              </AdminBadge>
            )}
            {lead.source === "giveaway" && (
              <AdminBadge intent="info" className="text-[10px] px-1.5 py-0">
                <Gift className="h-2.5 w-2.5 mr-0.5" />
                Giveaway
              </AdminBadge>
            )}
            {lead.source === "accommodation_waitlist" && (
              <AdminBadge intent="warning" className="text-[10px] px-1.5 py-0">
                🏕️ Waitlist
              </AdminBadge>
            )}
            {lead.source === "contact_form" && (
              <AdminBadge intent="neutral" className="text-[10px] px-1.5 py-0">
                <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                Contact Form
              </AdminBadge>
            )}
            {(lead.source === "exit_intent_popup" || lead.source === "high_intent_popup") && (
              <AdminBadge intent="info" className="text-[10px] px-1.5 py-0">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                Popup Lead
              </AdminBadge>
            )}
            {lead.engagement_status && lead.engagement_status !== "unknown" && (
              <AdminBadge 
                intent={lead.engagement_status === "active" ? "success" : lead.engagement_status === "bounced" || lead.engagement_status === "complained" ? "danger" : "warning"} 
                className="text-[10px] px-1.5 py-0"
              >
                <Mail className="h-2.5 w-2.5 mr-0.5" />
                {lead.engagement_status}
              </AdminBadge>
            )}
            {lead.segments && lead.segments.length > 0 && (
              <span className="text-[10px] text-[hsl(var(--admin-text-muted))]" title={lead.segments.join(", ")}>
                • {lead.segments.length} segment{lead.segments.length !== 1 ? "s" : ""}
              </span>
            )}
            {lead.recovery_emails_sent > 0 && (
              <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
                • {lead.recovery_emails_sent} email{lead.recovery_emails_sent !== 1 ? "s" : ""} sent
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <AdminBadge intent={statusCfg.intent}>{statusCfg.label}</AdminBadge>
          <span className="text-[10px] text-[hsl(var(--admin-text-muted))]" title={format(new Date(lead.last_activity), "PPpp")}>
            {lead.intent_signals > 0 || lead.furthest_step !== "browsing"
              ? `On site ${formatDistanceToNow(new Date(lead.last_activity), { addSuffix: true })}`
              : `Added ${formatDistanceToNow(new Date(lead.last_activity), { addSuffix: true })}`
            }
          </span>
        </div>
      </div>
    </div>
  );
}

function LeadDetailPanel({ lead, notes, newNote, onNewNoteChange, onAddNote, isAddingNote, onStatusChange, onEmailClick, onSmsClick, onOutreachLog, onAiDraftClick }: {
  lead: UnifiedLead;
  notes: LeadNote[];
  newNote: string;
  onNewNoteChange: (v: string) => void;
  onAddNote: () => void;
  isAddingNote: boolean;
  onStatusChange: (lead: UnifiedLead, status: string) => void;
  onEmailClick: () => void;
  onSmsClick: () => void;
  onOutreachLog: (lead: UnifiedLead, method: string) => void;
  onAiDraftClick: () => void;
}) {
  const reasons = getIntentReasons(lead);
  const intentScore = reasons.reduce((s, r) => s + r.points, 0);
  const heatLabel = intentScore >= 10 ? "🔥🔥 Scorching" : intentScore >= 6 ? "🔥 Hot" : intentScore >= 3 ? "Warm" : "Cool";
  const heatIntent: "danger" | "warning" | "info" | "neutral" =
    intentScore >= 10 ? "danger" : intentScore >= 6 ? "warning" : intentScore >= 3 ? "info" : "neutral";

  return (
    <div className="space-y-4">
      {/* Lead Info */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base flex items-center gap-2">
            {lead.name || "Unknown"}
            <AdminBadge intent={heatIntent}>{heatLabel} · {intentScore}</AdminBadge>
            {lead.past_purchases.is_returning && <AdminBadge intent="success">🔄 Returning</AdminBadge>}
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent className="space-y-3">
          {/* AI Prediction - show prominently if available */}
          {lead.ai_prediction && (
            <div className="p-3 rounded-md bg-[hsl(var(--admin-surface-hover))] border border-[hsl(var(--admin-border))]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">AI Score</span>
                <AdminBadge intent={lead.ai_prediction.score >= 70 ? "success" : lead.ai_prediction.score >= 40 ? "warning" : "neutral"}>
                  {lead.ai_prediction.score}% likely to convert
                </AdminBadge>
              </div>
              <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-1.5">{lead.ai_prediction.reasoning}</p>
              <div className="flex items-start gap-1.5">
                <Zap className="h-3 w-3 text-[hsl(var(--admin-primary))] shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-[hsl(var(--admin-primary))]">{lead.ai_prediction.recommended_action}</p>
              </div>
            </div>
          )}

          {/* Why this lead is hot — full reason breakdown */}
          {reasons.length > 0 && (
            <div className="p-3 rounded-md bg-[hsl(var(--admin-surface-hover))] border border-[hsl(var(--admin-border))]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">
                  Why this lead is hot
                </span>
                <AdminBadge intent={heatIntent}>{heatLabel} · {intentScore}</AdminBadge>
              </div>
              <ul className="space-y-1">
                {reasons.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[hsl(var(--admin-text))]">
                      {r.emoji ? `${r.emoji} ` : ""}{r.label}
                    </span>
                    <span className="text-[hsl(var(--admin-text-muted))] tabular-nums">+{r.points}</span>
                  </li>
                ))}
              </ul>
              {reasons.length > 8 && (
                <p className="text-[10px] text-[hsl(var(--admin-text-muted))] mt-2">
                  + {reasons.length - 8} more signals
                </p>
              )}
            </div>
          )}

          {/* AI Draft Recovery — sends an AI-personalized email tailored to this lead */}
          <AdminButton
            variant="admin"
            size="sm"
            onClick={onAiDraftClick}
            className="w-full gap-2"
          >
            <Zap className="h-3.5 w-3.5" />
            ✨ AI Draft Recovery Email
          </AdminButton>

          {/* Quick Actions - with outreach logging */}
          <div className="flex gap-2 pb-2 border-b border-[hsl(var(--admin-border))]">
            <AdminButton variant="admin" size="sm" onClick={() => { onOutreachLog(lead, "email"); onEmailClick(); }} className="flex-1 gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Email
            </AdminButton>
            {lead.phone ? (
              <>
                <AdminButton variant="adminOutline" size="sm" onClick={() => { onOutreachLog(lead, "text"); onSmsClick(); }} className="flex-1 gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  Text
                </AdminButton>
                <AdminButton variant="adminOutline" size="sm" onClick={() => { onOutreachLog(lead, "call"); }} asChild className="gap-1.5">
                  <a href={`tel:${lead.phone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                </AdminButton>
              </>
            ) : (
              <AdminButton variant="adminOutline" size="sm" disabled className="flex-1 gap-1.5 opacity-50">
                <Smartphone className="h-3.5 w-3.5" />
                No Phone
              </AdminButton>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Email</p>
              <p className="text-[hsl(var(--admin-text))] font-medium break-all">{lead.email}</p>
            </div>
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Phone</p>
              <p className="text-[hsl(var(--admin-text))]">{lead.phone || "—"}</p>
            </div>
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Interested In</p>
              <p className="text-[hsl(var(--admin-text))]">
                {lead.ticket_type ? lead.ticket_type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Furthest Step</p>
              <p className="text-[hsl(var(--admin-text))]">{STEP_LABELS[lead.furthest_step] || lead.furthest_step}</p>
            </div>
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Failure Reason</p>
              <p className="text-[hsl(var(--admin-text))]">{lead.failure_reason || "Unknown"}</p>
            </div>
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Attempts</p>
              <p className="text-[hsl(var(--admin-text))]">{lead.attempt_count}</p>
            </div>
            <div>
              <p className="text-[hsl(var(--admin-text-muted))] text-xs">Potential Value</p>
              <p className="text-[hsl(var(--admin-text))]">
                {lead.total_potential_value > 0 ? `$${(lead.total_potential_value / 100).toFixed(2)}` : "—"}
              </p>
            </div>
            {lead.device_type && (
              <div>
                <p className="text-[hsl(var(--admin-text-muted))] text-xs">Device</p>
                <p className="text-[hsl(var(--admin-text))] capitalize">{lead.device_type}</p>
              </div>
            )}
            {lead.past_purchases.total_spent > 0 && (
              <>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))] text-xs">Lifetime Spend</p>
                  <p className="text-[hsl(var(--admin-text))] font-medium">${(lead.past_purchases.total_spent / 100).toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))] text-xs">Past Events</p>
                  <p className="text-[hsl(var(--admin-text))]">{lead.past_purchases.total_events} event{lead.past_purchases.total_events !== 1 ? "s" : ""}</p>
                </div>
              </>
            )}
          </div>

          {/* Promo Code Info */}
          {lead.has_promo_code && (
            <div className="p-3 rounded-md bg-[hsl(var(--admin-surface-hover))] border border-[hsl(var(--admin-border))]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[hsl(var(--admin-text-muted))] uppercase tracking-wide flex items-center gap-1">
                  <Gift className="h-3 w-3" /> Promo Code
                </span>
                <AdminBadge intent={lead.promo_code_used ? "success" : "warning"}>
                  {lead.promo_code_used ? "Used ✓" : "Active"}
                </AdminBadge>
              </div>
              <p className="text-sm font-mono font-bold text-[hsl(var(--admin-text))]">{lead.promo_code_string || "—"}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
                  Source: {lead.promo_code_source === "high_intent_popup" ? "High-Intent Popup" : lead.promo_code_source === "exit_intent_popup" ? "Exit-Intent" : lead.promo_code_source || "Unknown"}
                </span>
                {lead.promo_code_expires && !lead.promo_code_used && (
                  <PromoCountdown expiresAt={lead.promo_code_expires} />
                )}
              </div>
            </div>
          )}

          {/* Signal badges */}
          <div className="flex flex-wrap gap-1.5">
            {lead.past_purchases.had_vip && (
              <AdminBadge intent="warning">
                ⭐ Past VIP
              </AdminBadge>
            )}
            {lead.past_purchases.had_lodging && (
              <AdminBadge intent="info">
                🏕️ Past Lodging
              </AdminBadge>
            )}
            {lead.recovery_emails_sent > 0 && (
              <AdminBadge intent="info">
                <Mail className="h-3 w-3 mr-1" />
                {lead.recovery_emails_sent} recovery email{lead.recovery_emails_sent !== 1 ? "s" : ""}
              </AdminBadge>
            )}
            {lead.sms_sent && (
              <AdminBadge intent="info">
                <Smartphone className="h-3 w-3 mr-1" />
                SMS sent
              </AdminBadge>
            )}
            {lead.has_checkout_error && (
              <AdminBadge intent="danger">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Checkout error
              </AdminBadge>
            )}
            {lead.chat_sessions > 0 && (
              <AdminBadge intent="neutral">
                <MessageSquare className="h-3 w-3 mr-1" />
                {lead.chat_sessions} chat session{lead.chat_sessions !== 1 ? "s" : ""}
              </AdminBadge>
            )}
          </div>

          {/* Status actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[hsl(var(--admin-border))]">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <AdminButton
                key={key}
                variant={lead.status === key ? "admin" : "adminOutline"}
                size="sm"
                onClick={() => onStatusChange(lead, key)}
                className="text-xs"
              >
                {cfg.label}
              </AdminButton>
            ))}
          </div>

          {/* Timeline */}
          <div className="pt-2 border-t border-[hsl(var(--admin-border))]">
            <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-2">Timeline</p>
            <div className="space-y-1.5 text-xs text-[hsl(var(--admin-text-muted))]">
              <TimelineItem icon={Clock} text={`First seen ${format(new Date(lead.first_seen), "MMM d 'at' h:mm a")}`} />
              <TimelineItem icon={Target} text={`Last activity ${formatDistanceToNow(new Date(lead.last_activity), { addSuffix: true })}`} />
              {lead.last_recovery_email && (
                <TimelineItem icon={Mail} text={`Last recovery email ${formatDistanceToNow(new Date(lead.last_recovery_email), { addSuffix: true })}`} />
              )}
              {lead.last_contacted_at && (
                <TimelineItem icon={UserCheck} text={`Manually contacted ${formatDistanceToNow(new Date(lead.last_contacted_at), { addSuffix: true })}`} />
              )}
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Notes */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes ({notes.length})
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent className="space-y-3">
          <div className="flex gap-2">
            <AdminTextarea
              placeholder="Add a note about this lead..."
              value={newNote}
              onChange={(e) => onNewNoteChange(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>
          <AdminButton
            variant="admin"
            size="sm"
            onClick={onAddNote}
            disabled={!newNote.trim() || isAddingNote}
            className="w-full"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {isAddingNote ? "Adding..." : "Add Note"}
          </AdminButton>

          {notes.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[hsl(var(--admin-border))]">
              {notes.map((note) => (
                <div key={note.id} className="p-2 rounded bg-[hsl(var(--admin-surface-hover))] text-sm">
                  <p className="text-[hsl(var(--admin-text))]">{note.note}</p>
                  <p className="text-[10px] text-[hsl(var(--admin-text-muted))] mt-1">
                    {note.creator_name} • {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>
    </div>
  );
}

function TimelineItem({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3 w-3 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function PromoCountdown({ expiresAt }: { expiresAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const diff = expires - now;

  if (diff <= 0) {
    return <span className="text-[10px] font-medium text-[hsl(var(--admin-danger))]">Expired</span>;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = hours < 6;

  return (
    <span className={`text-[10px] font-medium ${isUrgent ? "text-[hsl(var(--admin-danger))]" : "text-[hsl(var(--admin-warning))]"}`}>
      ⏰ {hours}h {minutes}m left
    </span>
  );
}
