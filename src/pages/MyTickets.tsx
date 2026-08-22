import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatTicketType } from "@/lib/utils";
import { getTicketDateRange } from "@/config/ticketTypes";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Ticket, ArrowRight, UserPlus, ShoppingCart, X, Plus, Minus, Heart, Calendar, Sparkles, QrCode, Home, MapPin, Clock, Car, Backpack, CheckCircle2, Pencil, Check, LogOut, ExternalLink, Send, Users, History, ChevronDown, ChevronUp, Shield, Phone, Smartphone, Download } from "lucide-react";
import { generateMyTicketsPdf, fetchLodgingForPdf } from "@/lib/myTicketsPdf";
import { toast } from "sonner";
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { User } from "@supabase/supabase-js";
import { Skeleton } from "@/components/ui/skeleton";
import QRCode from "react-qr-code";
import { AddToAppleWalletButton } from "@/components/AddToAppleWalletButton";
import dinnerImg from "@/assets/may/dinner-long-table.jpg";
import kidsCampImg from "@/assets/may/kids-sprinkler.webp";
import wineCampImg from "@/assets/may/winecamp-gathering.webp";
import { COLORS, typography } from "@/styles/may-theme";
import { useCheckoutErrorReporting } from "@/hooks/useCheckoutErrorReporting";
import { useIsMobile } from "@/hooks/use-mobile";
import { createEligibilitySignature, resolveAccordionState } from "./myTicketsAccordionState";
import { isQualifyingLodgingTicketType } from "@/lib/bookingRouteGuard";
import { LodgingSelector } from "@/components/may/LodgingSelector";
import { useLodgingVisualAssets, getAssetsByProductType } from "@/hooks/useLodgingVisualAssets";
import WineCampCardState, { getWineCampCardState } from "@/components/may/WineCampCardState";
import {
  type AddonItem,
  type SelectedAddon,
  DINNER_ADDON_TYPE,
  getAddonAvailability,
  getDisplayAddonsForTicket,
  getTicketIncludes,
  getMaxForAddon,
  normalizeSelectedAddonsForCheckout,
  validateSelectedAddonDietary,
} from "@/lib/addons";
import { getEligibleMyTicketsUpgradeDestinations } from "@/lib/ticketUpgrades";
import { CHECKOUT_TICKET_STORAGE_KEY, createCheckoutTicketSelection } from "@/lib/checkoutTicket";
import {
  type AccommodationUnit,
  type AccommodationZone,
  ACCOMMODATION_FAMILY_UNIT_SELECT,
  ACCOMMODATION_ZONE_SELECT,
  getLodgingEligibility,
  getLodgingSelectionState,
} from "@/lib/lodging";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackCustomEvent } from "@/components/AnalyticsTracking";
import { getTicketConfig } from "@/config/ticketTypes";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import {
  MayButton,
  LODGING_IMAGES,
  type VerifiedAccess,
  type TicketUpgradeSelection,
  type FamilyTicketSummary,
  type CartItem,
} from "@/components/my-tickets/shared";
import { PurchasedLodgingSection } from "@/components/my-tickets/PurchasedLodgingSection";
import { AddOnsPurchaseSection } from "@/components/my-tickets/AddOnsPurchaseSection";
import { ArrivalInfoSection } from "@/components/my-tickets/ArrivalInfoSection";
import { EventHistorySection } from "@/components/my-tickets/EventHistorySection";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/platform/config/env";
import { redirectToExternal } from "@/lib/safeRedirect";

export default function MyTickets() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [verifiedAccess, setVerifiedAccess] = useState<VerifiedAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessMode, setAccessMode] = useState<"code" | "lastName" | "magic">("magic");

  // Order lookup state
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupLastName, setLookupLastName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  // Magic link fallback
  const [magicEmail, setMagicEmail] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  // Tick the resend cooldown down every second
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const mintAuthenticatedTicketSession = async (sessionUser: User | null) => {
    if (!sessionUser?.email) {
      setVerifiedAccess(null);
      return;
    }

    const { data, error } = await supabase.rpc("mint_my_tickets_session_for_auth");
    if (error || !data?.[0]) {
      console.error("Unable to mint My Tickets session:", error);
      toast.error("We couldn't open your ticket wallet. Please use order lookup below.");
      setVerifiedAccess(null);
      return;
    }

    setVerifiedAccess({ email: data[0].email, registrationId: "", sessionToken: data[0].token });
  };

  useEffect(() => {
    if (searchParams.get("addon_success") === "true") {
      toast.success("Add-on purchase successful!");
    } else if (searchParams.get("addon_canceled") === "true") {
      toast.info("Add-on purchase was canceled.");
    } else if (searchParams.get("upgrade_success") === "true") {
      toast.success("Your upgrade is complete and your ticket wallet has been refreshed.");
    }

    const token = searchParams.get("token");
    if (token) {
      validateToken(token);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user?.email) {
          setLoading(true);
          setTimeout(() => {
            mintAuthenticatedTicketSession(session.user).finally(() => setLoading(false));
          }, 0);
        } else {
          setVerifiedAccess(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        mintAuthenticatedTicketSession(session.user).finally(() => setLoading(false));
      } else {
        setVerifiedAccess(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [searchParams]);

  const validateToken = async (token: string) => {
    try {
      const { data: tokenData, error: tokenError } = await supabase
        .rpc("validate_ticket_access_token", { p_token: token });

      if (tokenError || !tokenData || tokenData.length === 0) {
        toast.error("Invalid or expired access link. Please use the order lookup below.");
        setLoading(false);
        return;
      }

      // Mint a MyTickets session via the access token (server-side, validated)
      const { data: sessionData, error: sessionError } = await supabase
        .rpc("mint_my_tickets_session_from_token", { p_access_token: token });

      if (sessionError || !sessionData || sessionData.length === 0) {
        toast.error("Could not start a verified session. Please use the order lookup below.");
        setLoading(false);
        return;
      }

      const session = sessionData[0];
      setVerifiedAccess({
        email: session.email,
        registrationId: tokenData[0].registration_id,
        sessionToken: session.token,
      });
      setLoading(false);
    } catch (error) {
      console.error("Token validation error:", error);
      toast.error("Failed to validate access link");
      setLoading(false);
    }
  };

  const handleOrderLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupEmail || !lookupCode) {
      toast.error("Please enter both email and confirmation code");
      return;
    }

    setLookingUp(true);
    try {
      const emailLower = lookupEmail.toLowerCase().trim();
      const normalizedCode = lookupCode.trim().toUpperCase();

      const { data, error } = await supabase.rpc("mint_my_tickets_session", {
        p_email: emailLower,
        p_code: normalizedCode,
        p_last_name: null,
      });

      if (error || !data || data.length === 0) {
        toast.error("No paid order found for that email + code combo.", {
          description: "Double-check the email you used at checkout (try other addresses), or use the Magic Link tab to receive a one-tap login.",
          duration: 8000,
        });
        return;
      }

      const session = data[0];
      setVerifiedAccess({
        email: session.email,
        registrationId: "",
        sessionToken: session.token,
      });
      toast.success("Order verified! Loading your tickets...");
    } catch (error: any) {
      console.error("Error looking up order:", error);
      toast.error("Something went wrong looking up your order.", {
        description: "Please try again, or email hello@example.org and we'll sort it manually.",
        duration: 8000,
      });
    } finally {
      setLookingUp(false);
    }
  };

  const handleLastNameLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupEmail || !lookupLastName) {
      toast.error("Please enter both email and last name");
      return;
    }

    setLookingUp(true);
    try {
      const emailLower = lookupEmail.toLowerCase().trim();
      // Normalize: strip apostrophes, hyphens, spaces, accents — so O'Neil/ONeil/oneil all match
      const lastName = lookupLastName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      const { data, error } = await supabase.rpc("mint_my_tickets_session", {
        p_email: emailLower,
        p_code: null,
        p_last_name: lastName,
      });

      if (error || !data || data.length === 0) {
        toast.error("No paid order found for that email + last name.", {
          description: "Try another email you may have used at checkout, or use the Magic Link tab — we'll email you a one-tap login.",
          duration: 8000,
        });
        return;
      }

      const session = data[0];
      setVerifiedAccess({
        email: session.email,
        registrationId: "",
        sessionToken: session.token,
      });
      toast.success("Order verified! Loading your tickets...");
    } catch (error: any) {
      console.error("Error looking up order by last name:", error);
      toast.error("Something went wrong looking up your order.", {
        description: "Please try again, or email hello@example.org and we'll sort it manually.",
        duration: 8000,
      });
    } finally {
      setLookingUp(false);
    }
  };

  const handleSendMagicLink = async (e?: React.FormEvent, opts?: { resend?: boolean }) => {
    if (e) e.preventDefault();
    const isResend = !!opts?.resend;
    const targetEmail = isResend ? magicEmail : magicEmail;
    if (!targetEmail) {
      toast.error("Please enter your email");
      return;
    }

    // Client-side rate limit: 30s between sends, max 5 per session
    if (resendCooldown > 0) {
      toast.info(`Please wait ${resendCooldown}s before sending another link.`);
      return;
    }
    if (isResend && resendCount >= 5) {
      toast.error("Too many resends.", {
        description: "If you still haven't received the email, check spam or email hello@example.org.",
        duration: 8000,
      });
      return;
    }

    setSendingLink(true);
    try {
      const normalizedEmail = targetEmail.toLowerCase().trim();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: `${window.location.origin}/my-tickets` },
      });

      if (error) throw error;

      setMagicEmail(normalizedEmail);
      setLinkSent(true);
      setResendCooldown(30);
      if (isResend) setResendCount((c) => c + 1);
      toast.success(isResend ? "New access link sent — check your inbox." : "Secure access link sent! Check your email.");
    } catch (error: any) {
      console.error("Error sending magic link:", error);
      // Supabase returns specific rate-limit errors; surface them gracefully
      const msg = error?.message || "";
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        toast.error("You've requested links too quickly.", {
          description: "Wait a minute before trying again, or check your spam folder for an earlier link.",
          duration: 8000,
        });
        setResendCooldown(60);
      } else {
        toast.error(msg || "Failed to send magic link");
      }
    } finally {
      setSendingLink(false);
    }
  };

  const handleSignOut = async () => {
    if (user) {
      await supabase.auth.signOut();
      setUser(null);
    }
    setVerifiedAccess(null);
    toast.success("Signed out successfully");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  const accessEmail = verifiedAccess?.email;

  // ===== LOGGED OUT STATE =====
  if (!accessEmail) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
        <MayHeader minimal />

        <section className="relative overflow-hidden px-6 pb-20 pt-28 md:pb-28 md:pt-36" style={{ backgroundColor: COLORS.dustySky }}>
          <FilmGrainOverlay opacity={0.28} />

          <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_520px] lg:items-start">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-xl pt-4 lg:pt-16"
            >
              <p style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.12em' }}>
                ACCESS YOUR ORDER
              </p>
              <h1 className="mt-4" style={{ ...typography.headline, color: COLORS.charcoal, fontSize: 'clamp(30px, 5.4vw, 56px)', lineHeight: 1.02 }}>
                Access Your Order
              </h1>
              <p className="mt-5 max-w-lg" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.6 }}>
                View your tickets, manage lodging, and transfer passes from one place.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { icon: <Ticket className="h-5 w-5" />, label: "Tickets", detail: "QR tickets" },
                  { icon: <Home className="h-5 w-5" />, label: "Stay", detail: "Lodging add-ons" },
                  { icon: <Users className="h-5 w-5" />, label: "Transfer", detail: "Send to a friend" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="border px-4 py-4"
                    style={{
                      backgroundColor: `${COLORS.white}c9`,
                      borderColor: `${COLORS.charcoal}12`,
                      boxShadow: `0 18px 36px -30px ${COLORS.charcoal}55`,
                    }}
                  >
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: `${COLORS.denim}10`, color: COLORS.denim }}>
                      {item.icon}
                    </div>
                    <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>{item.label}</p>
                    <p className="mt-1" style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>{item.detail}</p>
                  </div>
                ))}
              </div>

              <p className="mt-8" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px', letterSpacing: '0.1em' }}>
                MAY 14–16, 2027 · EXAMPLE MEADOW · EXAMPLE VALLEY, CA
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="border p-5 sm:p-8"
              style={{
                backgroundColor: `${COLORS.white}de`,
                borderColor: `${COLORS.charcoal}10`,
                boxShadow: `0 36px 90px -54px ${COLORS.clay}95`,
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-full" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
                <Ticket className="h-9 w-9" style={{ color: COLORS.charcoal }} />
              </div>

              <div className="mt-6 text-center">
                <h2 style={{ ...typography.headline, color: COLORS.charcoal, fontSize: 'clamp(24px, 3vw, 32px)' }}>
                  Find Your Order
                </h2>
                <p className="mx-auto mt-3 max-w-md" style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px' }}>
                  The easiest way in: tap <strong style={{ color: COLORS.charcoal }}>Magic Link</strong> and we&apos;ll email you a one-tap login. No code or last name needed.
                </p>
                <p className="mx-auto mt-2 max-w-md" style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', fontStyle: 'italic' }}>
                  Tip: use the exact email you typed at checkout. If one doesn&apos;t work, try another address you may have used — orders are stored per-email.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if ('serviceWorker' in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map((r) => r.unregister()));
                      }
                      if ('caches' in window) {
                        const names = await caches.keys();
                        await Promise.all(names.map((n) => caches.delete(n)));
                      }
                    } catch (err) {
                      console.warn('Cache clear failed', err);
                    }
                    const url = new URL(window.location.href);
                    url.searchParams.set('__refresh', Date.now().toString(36));
                    window.location.replace(url.toString());
                  }}
                  className="mx-auto mt-3 inline-block underline text-xs"
                  style={{ color: COLORS.boulder }}
                >
                  Page acting weird? Tap here to refresh & clear cache.
                </button>
              </div>

              <div className="mt-8 grid grid-cols-3 p-1" style={{ backgroundColor: `${COLORS.charcoal}06` }}>
                {[
                  { key: 'magic', label: 'Magic Link' },
                  { key: 'code', label: 'Confirmation Code' },
                  { key: 'lastName', label: 'Last Name' },
                ].map((tab) => {
                  const isActive = accessMode === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setAccessMode(tab.key as "code" | "lastName" | "magic")}
                      className="px-4 py-3 transition-all duration-200"
                      style={{
                        ...typography.button,
                        fontSize: '13px',
                        color: COLORS.charcoal,
                        backgroundColor: isActive ? COLORS.white : 'transparent',
                        boxShadow: isActive ? `0 10px 24px -20px ${COLORS.charcoal}80` : 'none',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-7">
                {accessMode === "code" ? (
                  <form onSubmit={handleOrderLookup} className="space-y-5">
                    <div className="space-y-2">
                      <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px' }}>Email address</p>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={lookupEmail}
                        onChange={(e) => setLookupEmail(e.target.value)}
                        style={{
                          ...typography.body,
                          borderColor: `${COLORS.charcoal}14`,
                          backgroundColor: `${COLORS.white}f0`,
                          height: '52px',
                          fontSize: '15px',
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px' }}>Confirmation code</p>
                      <Input
                        type="text"
                        placeholder="E.g. A1B2C3D4"
                        value={lookupCode}
                        onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                        style={{
                          ...typography.body,
                          borderColor: `${COLORS.charcoal}14`,
                          backgroundColor: `${COLORS.white}f0`,
                          height: '52px',
                          fontSize: '15px',
                          textTransform: 'uppercase',
                        }}
                        required
                      />
                    </div>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      Use the email address and confirmation code from your original confirmation email when it&apos;s available.
                    </p>
                    <MayButton type="submit" disabled={lookingUp} className="w-full justify-center py-4 text-base" size="lg">
                      {lookingUp ? <><Loader2 className="h-4 w-4 animate-spin" />Looking up...</> : <>Find My Order<ArrowRight className="h-4 w-4" /></>}
                    </MayButton>
                  </form>
                ) : accessMode === "lastName" ? (
                  <form onSubmit={handleLastNameLookup} className="space-y-5">
                    <div className="space-y-2">
                      <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px' }}>Email address</p>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={lookupEmail}
                        onChange={(e) => setLookupEmail(e.target.value)}
                        style={{
                          ...typography.body,
                          borderColor: `${COLORS.charcoal}14`,
                          backgroundColor: `${COLORS.white}f0`,
                          height: '52px',
                          fontSize: '15px',
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px' }}>Last name</p>
                      <Input
                        type="text"
                        placeholder="Your last name"
                        value={lookupLastName}
                        onChange={(e) => setLookupLastName(e.target.value)}
                        style={{
                          ...typography.body,
                          borderColor: `${COLORS.charcoal}14`,
                          backgroundColor: `${COLORS.white}f0`,
                          height: '52px',
                          fontSize: '15px',
                        }}
                        required
                      />
                    </div>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      Older confirmation emails may not show a code, so you can also verify with the email address and last name from the order.
                    </p>
                    <MayButton type="submit" disabled={lookingUp} className="w-full justify-center py-4 text-base" size="lg">
                      {lookingUp ? <><Loader2 className="h-4 w-4 animate-spin" />Looking up...</> : <>Find My Order<ArrowRight className="h-4 w-4" /></>}
                    </MayButton>
                  </form>
                ) : linkSent ? (
                  <div className="py-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${COLORS.forest}12` }}>
                      <Mail className="h-8 w-8" style={{ color: COLORS.forest }} />
                    </div>
                    <h3 className="mt-5" style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '24px' }}>Check your email</h3>
                    <p className="mx-auto mt-3 max-w-sm" style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                      We sent a secure access link to <strong style={{ color: COLORS.charcoal }}>{magicEmail}</strong>.
                    </p>
                    <p className="mx-auto mt-2 max-w-sm" style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', fontStyle: 'italic' }}>
                      Didn&apos;t get it? Check spam, or resend below.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-center">
                      <MayButton
                        type="button"
                        onClick={() => handleSendMagicLink(undefined, { resend: true })}
                        disabled={sendingLink || resendCooldown > 0 || resendCount >= 5}
                      >
                        {sendingLink
                          ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</>
                          : resendCooldown > 0
                            ? `Resend link (${resendCooldown}s)`
                            : resendCount >= 5
                              ? "Resend limit reached"
                              : <>Resend link<Mail className="h-4 w-4" /></>}
                      </MayButton>
                      <MayButton variant="outline" onClick={() => { setLinkSent(false); setResendCount(0); }}>
                        Use a different email
                      </MayButton>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendMagicLink} className="space-y-5">
                    <div className="space-y-2">
                      <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px' }}>Email address</p>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={magicEmail}
                        onChange={(e) => setMagicEmail(e.target.value)}
                        style={{
                          ...typography.body,
                          borderColor: `${COLORS.charcoal}14`,
                          backgroundColor: `${COLORS.white}f0`,
                          height: '52px',
                          fontSize: '15px',
                        }}
                        required
                      />
                    </div>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.6 }}>
                      We&apos;ll send a secure link to the email used for your order so you can open your ticket wallet directly.
                    </p>
                    <MayButton type="submit" disabled={sendingLink} className="w-full justify-center py-4 text-base" size="lg">
                      {sendingLink ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</> : <>Send me a secure access link<Mail className="h-4 w-4" /></>}
                    </MayButton>
                  </form>
                )}
              </div>

              <p className="mt-8 text-center" style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                Need help?{" "}
                <a href="mailto:hello@example.org" className="underline hover:opacity-70" style={{ color: COLORS.charcoal }}>
                  hello@example.org
                </a>
              </p>
            </motion.div>
          </div>
        </section>

        <MayFooter />
      </div>
    );
  }

  // ===== AUTHENTICATED STATE =====
  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader minimal />

      <main className="max-w-5xl mx-auto px-6 pt-28 pb-20 md:pt-32">
        <div className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div style={{ width: '32px', height: '2px', backgroundColor: COLORS.clay, marginBottom: '14px' }} />
              <p style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px' }}>COSMICO · MAY 14–16</p>
              <h1 style={{ ...typography.headline, color: COLORS.charcoal, fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.02, marginTop: '6px' }}>My Order</h1>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', marginTop: '8px' }}>{accessEmail}</p>
            </div>

            <MayButton variant="outline" size="sm" onClick={handleSignOut} className="self-start md:self-auto">
              <LogOut className="h-3.5 w-3.5" />
              <span>{user ? "Sign Out" : "Switch Order"}</span>
            </MayButton>
          </div>
        </div>

        <TicketsDashboard
          userEmail={accessEmail}
          verifiedEmail={verifiedAccess?.email}
          sessionToken={verifiedAccess?.sessionToken}
          upgradeSessionId={searchParams.get("upgrade_session_id") || undefined}
        />
      </main>

      {/* ===== ONE WEEK OUT — COMPACT LINK STRIP ===== */}
      <section className="px-6 pb-16 pt-2" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="max-w-5xl mx-auto">
          <div
            className="flex flex-wrap items-baseline gap-x-4 gap-y-2"
            style={{ borderTop: `1px solid ${COLORS.charcoal}20`, paddingTop: '16px' }}
          >
            <p
              style={{
                ...typography.caption,
                color: COLORS.clay,
                letterSpacing: '0.16em',
                fontSize: '10px',
              }}
            >
              ESSENTIAL INFO
            </p>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-3" style={{ flex: '1 1 auto' }}>
              {[
                { to: '/getting-here', label: 'Getting here' },
                { to: '/schedule', label: 'Schedule' },
                { to: '/stay', label: 'Lodging' },
                { to: '/almost-here', label: 'FAQ' },
                { to: '/contact', label: 'Get in touch' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    ...typography.caption,
                    color: COLORS.charcoal,
                    fontSize: '13px',
                    letterSpacing: '0.10em',
                    borderBottom: `1px solid ${COLORS.charcoal}60`,
                    paddingBottom: '2px',
                    textDecoration: 'none',
                  }}
                  className="hover:opacity-70 transition-opacity"
                >
                  {link.label} →
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>


      <MayFooter />
    </div>
  );
}

// ===== TICKETS DASHBOARD =====
function TicketsDashboard({ userEmail, verifiedEmail, sessionToken, upgradeSessionId }: { userEmail: string; verifiedEmail?: string; sessionToken?: string; upgradeSessionId?: string }) {
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([]);
  const [incompleteRegs, setIncompleteRegs] = useState<any[]>([]);
  const [resumingRegId, setResumingRegId] = useState<string | null>(null);
  const [transferHistory, setTransferHistory] = useState<Record<string, any[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [transferTicket, setTransferTicket] = useState<any | null>(null);
  const [assignTicket, setAssignTicket] = useState<any | null>(null);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [cancellingTransferId, setCancellingTransferId] = useState<string | null>(null);
  const [startingUpgradeKey, setStartingUpgradeKey] = useState<string | null>(null);
  const [selectedUpgrade, setSelectedUpgrade] = useState<TicketUpgradeSelection | null>(null);
  const [upgradeCheckoutLoading, setUpgradeCheckoutLoading] = useState(false);
  const [processingUpgradeSession, setProcessingUpgradeSession] = useState(false);
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());
  const activeVerifiedEmail = (verifiedEmail || userEmail).trim().toLowerCase();
  const toggleTicketExpanded = (id: string) => {
    setExpandedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("kids_tickets_success") === "true") {
      toast.success("Family tickets added to your booking.");
    } else if (params.get("kids_tickets_canceled") === "true") {
      toast.info("Family ticket checkout was canceled.");
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    fetchUserTickets();
  }, [userEmail, sessionToken]);

  useEffect(() => {
    if (!upgradeSessionId) return;

    let cancelled = false;

    const finalizeUpgrade = async () => {
      setProcessingUpgradeSession(true);

      try {
        const { data, error } = await supabase.functions.invoke("process-upgrade-payment", {
          body: { sessionId: upgradeSessionId },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (!cancelled) {
          await fetchUserTickets();
          toast.success(data?.alreadyProcessed
            ? "Your upgraded ticket is already active in your wallet."
            : "Upgrade complete — your ticket wallet is now up to date.");

          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("upgrade_session_id");
          nextUrl.searchParams.delete("upgrade_pending");
          window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
        }
      } catch (error: any) {
        console.error("Upgrade processing error:", error);
        if (!cancelled) {
          toast.error(error.message || "We couldn't finalize your upgrade yet.");
        }
      } finally {
        if (!cancelled) setProcessingUpgradeSession(false);
      }
    };

    finalizeUpgrade();

    return () => {
      cancelled = true;
    };
  }, [upgradeSessionId]);

  const fetchUserTickets = async () => {
    try {
      const supabaseUrl = getSupabaseUrl();
      const supabaseKey = getSupabaseAnonKey();
      const normalizedUserEmail = userEmail.toLowerCase().trim();

      const registrationUrl = new URL(`${supabaseUrl}/rest/v1/registrations`);
      registrationUrl.searchParams.set("select", "*,event_details(*)");
      registrationUrl.searchParams.set("email", `ilike.${normalizedUserEmail}`);
      registrationUrl.searchParams.set("payment_status", "eq.paid");
      registrationUrl.searchParams.set("order", "created_at.desc");

      const regResponse = await fetch(
        registrationUrl.toString(),
        { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" } }
      );
      if (!regResponse.ok) throw new Error("Failed to fetch registrations");
      const regs = await regResponse.json();
      setRegistrations(regs || []);

      // Fetch incomplete (in-progress / expired / failed) ticket checkouts so
      // the customer knows what to do next.
      try {
        const incompleteUrl = new URL(`${supabaseUrl}/rest/v1/registrations`);
        incompleteUrl.searchParams.set("select", "id,email,name,ticket_type,quantity,total_amount,payment_status,checkout_status,checkout_expires_at,last_payment_error_message,last_payment_error_code,stripe_session_id,updated_at,created_at");
        incompleteUrl.searchParams.set("email", `ilike.${normalizedUserEmail}`);
        incompleteUrl.searchParams.set("payment_status", "in.(pending,expired,failed)");
        incompleteUrl.searchParams.set("order", "updated_at.desc");
        const incResponse = await fetch(
          incompleteUrl.toString(),
          { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" } }
        );
        if (incResponse.ok) {
          const inc = await incResponse.json();
          // Hide rows that have already been superseded by a paid registration with the same ticket type.
          const paidTypes = new Set((regs || []).map((r: any) => r.ticket_type));
          const filtered = (inc || []).filter((r: any) => {
            if (paidTypes.has(r.ticket_type)) return false;
            // Hide stale "pending" rows that are clearly abandoned (>24h old, no checkout still open)
            const isStalePending = r.payment_status === "pending"
              && (!r.checkout_expires_at || new Date(r.checkout_expires_at).getTime() < Date.now())
              && (Date.now() - new Date(r.updated_at).getTime()) > 24 * 60 * 60 * 1000;
            if (isStalePending) return false;
            return true;
          });
          setIncompleteRegs(filtered);
        }
      } catch (e) {
        console.warn("Failed to fetch incomplete registrations", e);
      }

      let ticketIds: string[] = [];
      const ticketResults: any[] = [];

      if (regs && regs.length > 0) {
        const regIds = regs.map((r: any) => r.id);
        const regIdsFilter = regIds.map((id: string) => `"${id}"`).join(",");
        const registrationTicketsUrl = new URL(`${supabaseUrl}/rest/v1/tickets`);
        registrationTicketsUrl.searchParams.set("select", "*,event_details(*)");
        registrationTicketsUrl.searchParams.set("registration_id", `in.(${regIdsFilter})`);
        registrationTicketsUrl.searchParams.set("status", "eq.active");
        registrationTicketsUrl.searchParams.set("order", "created_at.desc");

        const tixResponse = await fetch(
          registrationTicketsUrl.toString(),
          { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" } }
        );
        if (!tixResponse.ok) throw new Error("Failed to fetch tickets");
        const tix = await tixResponse.json();
        ticketResults.push(...(tix || []));
      }

      const transferredTicketsUrl = new URL(`${supabaseUrl}/rest/v1/tickets`);
      transferredTicketsUrl.searchParams.set("select", "*,event_details(*)");
      transferredTicketsUrl.searchParams.set("status", "eq.active");
      transferredTicketsUrl.searchParams.set("order", "created_at.desc");
      transferredTicketsUrl.searchParams.set("or", `(owner_email.ilike.${normalizedUserEmail},holder_email.ilike.${normalizedUserEmail})`);

      const transferredTicketsResponse = await fetch(
        transferredTicketsUrl.toString(),
        { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" } }
      );

      if (!transferredTicketsResponse.ok) {
        throw new Error("Failed to fetch transferred tickets");
      }

      const transferredTickets = await transferredTicketsResponse.json();
      ticketResults.push(...(transferredTickets || []));

      const dedupedTickets = Array.from(
        new Map(ticketResults.map((ticket: any) => [ticket.id, ticket])).values()
      );

      setTickets(dedupedTickets);
      ticketIds = dedupedTickets.map((ticket: any) => ticket.id);

      const transfersUrl = new URL(`${supabaseUrl}/rest/v1/pending_ticket_transfers`);
      transfersUrl.searchParams.set("select", "*,tickets(holder_name,ticket_type,event_details(title,event_date))");
      transfersUrl.searchParams.set("initiated_by_email", `ilike.${normalizedUserEmail}`);
      transfersUrl.searchParams.set("completed_at", "is.null");
      transfersUrl.searchParams.set("cancelled_at", "is.null");
      transfersUrl.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
      transfersUrl.searchParams.set("order", "created_at.desc");
      const transfersResponse = await fetch(transfersUrl.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" },
      });
      if (transfersResponse.ok) setPendingTransfers((await transfersResponse.json()) || []);

      if (ticketIds.length > 0) {
        const ticketIdsFilter = ticketIds.map((id) => `"${id}"`).join(",");
        const histUrl = new URL(`${supabaseUrl}/rest/v1/pending_ticket_transfers`);
        histUrl.searchParams.set("select", "*");
        histUrl.searchParams.set("ticket_id", `in.(${ticketIdsFilter})`);
        histUrl.searchParams.set("completed_at", "not.is.null");
        histUrl.searchParams.set("order", "completed_at.desc");
        const histResponse = await fetch(histUrl.toString(), {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" },
        });
        if (histResponse.ok) {
          const completedTransfers = await histResponse.json();
          const historyByTicket: Record<string, any[]> = {};
          (completedTransfers || []).forEach((transfer: any) => {
            if (!historyByTicket[transfer.ticket_id]) historyByTicket[transfer.ticket_id] = [];
            historyByTicket[transfer.ticket_id].push(transfer);
          });
          setTransferHistory(historyByTicket);
        }
      }
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    setCancellingTransferId(transferId);
    try {
      const { error } = await supabase
        .from("pending_ticket_transfers").update({ cancelled_at: new Date().toISOString() })
        .eq("id", transferId).ilike("initiated_by_email", userEmail.toLowerCase().trim());
      if (error) throw error;
      toast.success("Transfer cancelled successfully");
      fetchUserTickets();
    } catch (error: any) {
      console.error("Error cancelling transfer:", error);
      toast.error("Failed to cancel transfer");
    } finally {
      setCancellingTransferId(null);
    }
  };

  const handleEditName = (ticket: any) => { setEditingTicketId(ticket.id); setEditingName(ticket.holder_name); };
  const handleCancelEdit = () => { setEditingTicketId(null); setEditingName(""); };

  const handleSaveName = async (ticketId: string) => {
    if (!editingName.trim()) { toast.error("Name cannot be empty"); return; }
    setSavingName(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-ticket-holder", {
        body: { ticketId, newName: editingName.trim(), verifiedEmail: activeVerifiedEmail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Ticket holder name updated!");
      setEditingTicketId(null); setEditingName("");
      fetchUserTickets();
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error(error.message || "Failed to update name");
    } finally { setSavingName(false); }
  };

  const formatDate = (dateStr: string) => {
    // Parse YYYY-MM-DD as a local date to avoid UTC shifting it back a day
    const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  };

  const shouldShowQRCodes = () => {
    const eventDate = tickets[0]?.event_details?.event_date || registrations[0]?.event_details?.event_date;
    if (!eventDate) return false;
    const [y, m, d] = eventDate.split("T")[0].split("-").map(Number);
    const event = new Date(y, (m || 1) - 1, d || 1);
    const now = new Date();
    const daysUntilEvent = Math.ceil((event.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilEvent <= 7;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  if (registrations.length === 0 && tickets.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
        <Ticket className="h-12 w-12 mx-auto mb-4" style={{ color: COLORS.boulder }} />
        <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', marginBottom: '8px' }}>No tickets found</h3>
        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
          We couldn't find any tickets associated with {userEmail}.
        </p>
      </div>
    );
  }

  const userTicketTypes = new Set<string>();
  registrations.forEach((reg) => userTicketTypes.add(reg.ticket_type));
  tickets.forEach((ticket) => userTicketTypes.add(ticket.ticket_type));
  const showQR = shouldShowQRCodes();

  // Split tickets into upcoming vs past for visual hierarchy.
  // A ticket is only "upcoming" if it's tied to Cosmico 2026 with a future event_date.
  // Tickets with no event_date OR not associated with Cosmico 2026 are considered historical.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isDemoEventTicket = (t: any) => {
    const title = (t.event_details?.title || "").toLowerCase();
    return title.includes("Cosmico");
  };
  const isUpcoming = (t: any) => {
    const ds = t.event_details?.event_date;
    if (!ds) return false;
    if (!isDemoEventTicket(t)) return false;
    const [y, m, d] = ds.split("T")[0].split("-").map(Number);
    // Keep tickets visible through the entire festival weekend (Fri–Sun),
    // not just up to the event start date. Treat anything within 3 days
    // after event_date as still upcoming so Saturday/Sunday holders don't
    // lose their tickets while the festival is in progress.
    const eventStart = new Date(y, (m || 1) - 1, d || 1);
    const festivalEnd = new Date(eventStart);
    festivalEnd.setDate(festivalEnd.getDate() + 3);
    return festivalEnd >= today;
  };
  const upcomingTickets = tickets.filter(isUpcoming);
  const pastTickets = tickets.filter((t) => !isUpcoming(t));
  const actualFamilyTicketCountsByRegistration = tickets.reduce<Record<string, { child: number; youth: number }>>((acc, ticket) => {
    const registrationId = ticket.registration_id;
    if (!registrationId) return acc;

    if (!acc[registrationId]) {
      acc[registrationId] = { child: 0, youth: 0 };
    }

    if (ticket.ticket_type === "child_free") {
      acc[registrationId].child += 1;
    } else if ((ticket.ticket_type || "").startsWith("youth_")) {
      acc[registrationId].youth += 1;
    }

    return acc;
  }, {});

  const familyTicketSummaries = registrations.reduce<FamilyTicketSummary[]>((acc, registration) => {
    const childCount = Number(registration.metadata?.child_count || 0);
    const youthCount = Number(registration.metadata?.youth_count || 0);
    const youthTicketType = registration.metadata?.youth_ticket_type || null;
    const existingFamilyCounts = actualFamilyTicketCountsByRegistration[registration.id] || { child: 0, youth: 0 };
    const missingChildCount = Math.max(0, childCount - existingFamilyCounts.child);
    const missingYouthCount = Math.max(0, youthCount - existingFamilyCounts.youth);

    if (missingChildCount <= 0 && missingYouthCount <= 0) return acc;

    acc.push({
      registrationId: registration.id,
      eventId: registration.event_id ?? null,
      eventDetails: registration.event_details ?? null,
      childCount: missingChildCount,
      youthCount: missingYouthCount,
      youthTicketType,
      parentTicketType: registration.ticket_type ?? null,
    });

    return acc;
  }, []);

  const familyTickets = familyTicketSummaries.flatMap((summary) => {
    const childTickets = Array.from({ length: summary.childCount }, (_, index) => ({
      id: `${summary.registrationId}:child:${index + 1}`,
      registration_id: summary.registrationId,
      event_details: summary.eventDetails,
      ticket_type: "child_free",
      unit_price: 0,
      status: "active",
      checked_in_at: null,
      transfer_count: 0,
      is_transferable: false,
      holder_name: `Child Guest ${index + 1}`,
      holder_email: null,
      wallet_read_only: true,
    }));

    const youthTickets = Array.from({ length: summary.youthCount }, (_, index) => ({
      id: `${summary.registrationId}:youth:${index + 1}`,
      registration_id: summary.registrationId,
      event_details: summary.eventDetails,
      ticket_type: summary.youthTicketType || "youth_2day",
      unit_price: 0,
      status: "active",
      checked_in_at: null,
      transfer_count: 0,
      is_transferable: false,
      holder_name: `Youth Guest ${index + 1}`,
      holder_email: null,
      wallet_read_only: true,
    }));

    return [...childTickets, ...youthTickets];
  });

  const walletTickets = [...upcomingTickets, ...familyTickets.filter(isUpcoming)];
  const upcomingIncludedExperienceCount = upcomingTickets.reduce((count, ticket) => {
    const perks = getTicketIncludes(ticket.ticket_type);
    return count + (perks.some((perk) => perk.toLowerCase().includes("wine camp")) ? 1 : 0);
  }, 0);
  const upcomingUpgradeableCount = upcomingTickets.filter((ticket) => getEligibleMyTicketsUpgradeDestinations(ticket.ticket_type).length > 0).length;
  const lodgingUnlockLabel = upcomingTickets.some((ticket) => getEligibleMyTicketsUpgradeDestinations(ticket.ticket_type).includes("tier_1_vip_3day"))
    ? "Upgradeable to unlock lodging"
    : "Lodging status set by ticket";
  const upcomingEventDetails = upcomingTickets.find((ticket) => ticket.event_details?.event_date)?.event_details || registrations.find((r) => {
    const ds = r.event_details?.event_date;
    if (!ds) return false;
    const [y, m, d] = ds.split("T")[0].split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1) >= today;
  })?.event_details || registrations[0]?.event_details;

  // Color accents per event for ticket left-stripe
  const eventColors = [COLORS.clay, COLORS.denim, COLORS.forest, COLORS.electricLavender, COLORS.mustard];
  const eventColorMap = new Map<string, string>();
  upcomingTickets.forEach((t) => {
    const key = t.event_details?.id || t.event_details?.title || "default";
    if (!eventColorMap.has(key)) {
      eventColorMap.set(key, eventColors[eventColorMap.size % eventColors.length]);
    }
  });

  const renderTicketCard = (ticket: any, opts: { dimmed?: boolean } = {}) => {
    const dimmed = !!opts.dimmed;
    const isReadOnly = !!ticket.wallet_read_only;
    const eventKey = ticket.event_details?.id || ticket.event_details?.title || "default";
    const accent = dimmed ? COLORS.boulder : (eventColorMap.get(eventKey) || COLORS.clay);
    const eventTitle = ticket.event_details?.title || "Event";
    const ticketDays = getTicketDateRange(ticket.ticket_type);
    const eventDate = ticketDays.dateRange;
    const includedPerks = getTicketIncludes(ticket.ticket_type);
    const eligibleUpgradeDestinations = getEligibleMyTicketsUpgradeDestinations(ticket.ticket_type);
    const upgradeBenefitCopy = eligibleUpgradeDestinations.includes("tier_1_vip_3day")
      ? "Upgrade to unlock VIP access, lodging eligibility, and more weekend perks."
      : "Upgrade to expand your weekend access and included experiences.";
    const handleUpgradeSelection = (destination: string) => {
      setSelectedUpgrade({ ticket, destination });
    };

    const isExpanded = expandedTickets.has(ticket.id) || editingTicketId === ticket.id;

    return (
      <div
        key={ticket.id}
        className="relative rounded-xl overflow-hidden flex"
        style={{
          backgroundColor: COLORS.white,
          border: `1px solid ${COLORS.charcoal}15`,
          opacity: dimmed ? 0.65 : 1,
          boxShadow: dimmed ? "none" : "0 1px 2px rgba(47,47,47,0.04)",
        }}
      >
        {/* Left accent stripe — like a real ticket stub */}
        <div
          className="w-2 flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        <div className="flex-1">
          {/* === COLLAPSED HEADER (always visible, click to toggle) === */}
          <button
            type="button"
            onClick={() => toggleTicketExpanded(ticket.id)}
            className="w-full flex items-center gap-3 sm:gap-4 px-4 py-3 sm:px-5 sm:py-4 text-left hover:opacity-90 transition-opacity"
            aria-expanded={isExpanded}
            aria-controls={`ticket-body-${ticket.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${accent}15`, color: accent, ...typography.caption, fontSize: '10px', letterSpacing: '0.08em' }}
                >
                  {formatTicketType(ticket.ticket_type)}
                </span>
                {dimmed && (
                  <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>· PAST</span>
                )}
                {ticket.checked_in_at && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${COLORS.forest}12`, color: COLORS.forest, ...typography.caption, fontSize: '10px' }}
                  >
                    <CheckCircle2 className="h-3 w-3" />Checked in
                  </span>
                )}
              </div>
              <p
                className="mt-1 truncate"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600 }}
              >
                {ticket.holder_name || "Unassigned"}
              </p>
            </div>
            {/* Mini QR if available, else placeholder */}
            {!dimmed && !isReadOnly && showQR ? (
              <div className="p-1 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.charcoal}15` }}>
                <QRCode value={ticket.id} size={40} />
              </div>
            ) : !dimmed && !isReadOnly ? (
              <div
                className="flex flex-col items-center justify-center flex-shrink-0 w-12 h-12 rounded-md"
                style={{ backgroundColor: `${COLORS.charcoal}06`, color: COLORS.boulder }}
                title="QR available 7 days before"
              >
                <QrCode className="h-4 w-4" />
              </div>
            ) : null}
            <ChevronDown
              className="h-5 w-5 flex-shrink-0 transition-transform"
              style={{ color: COLORS.boulder, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>

          {/* === EXPANDED BODY === */}
          {isExpanded && (
            <div id={`ticket-body-${ticket.id}`} className="px-6 pb-6 pt-1" style={{ borderTop: `1px dashed ${COLORS.charcoal}10` }}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pt-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${accent}15`, color: accent, ...typography.caption, fontSize: '10px', letterSpacing: '0.08em' }}
                    >
                      {eventTitle}
                    </span>
                  </div>
                  {eventDate && (
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                      {eventDate}
                    </p>
                  )}
                  {includedPerks.length > 0 && (
                    <div
                      className="mt-4 rounded-lg p-4"
                      style={{ backgroundColor: `${accent}08`, border: `1px solid ${accent}20` }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-4 w-4" style={{ color: accent }} />
                        <p style={{ ...typography.caption, color: accent, fontSize: '11px', letterSpacing: '0.08em' }}>
                          What&apos;s included
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {includedPerks.map((perk) => (
                          <div key={perk} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
                            <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', lineHeight: 1.5 }}>
                              {perk}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {isReadOnly && (
                    <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: `${accent}08`, border: `1px solid ${accent}20` }}>
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>Family ticket linked to this order</p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px', lineHeight: 1.5 }}>
                        This ticket is active in the wallet, but transfers, upgrades, and holder edits are limited to the main adult tickets on the booking.
                      </p>
                    </div>
                  )}
                  {!dimmed && !isReadOnly && eligibleUpgradeDestinations.length > 0 && (
                    <div
                      className="mt-4 rounded-lg p-4"
                      style={{ backgroundColor: `${COLORS.denim}08`, border: `1px solid ${COLORS.denim}20` }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowRight className="h-4 w-4" style={{ color: COLORS.denim }} />
                        <p style={{ ...typography.caption, color: COLORS.denim, fontSize: '11px', letterSpacing: '0.08em' }}>
                          Upgrade options
                        </p>
                      </div>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
                        {upgradeBenefitCopy}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {eligibleUpgradeDestinations.map((destination) => {
                          const liveDestinationPrice = getTicketConfig(destination)?.price || 0;
                          const liveOriginalPrice = getTicketConfig(ticket.ticket_type)?.price || 0;
                          const paidUnitPrice = ticket.unit_price || 0;
                          const priceRatio = liveOriginalPrice > 0 ? Math.min(paidUnitPrice / liveOriginalPrice, 1) : 1;
                          const loyaltyPrice = Math.round(liveDestinationPrice * priceRatio);
                          const upgradeEstimate = Math.max(loyaltyPrice - paidUnitPrice, 0);
                          const standardEstimate = Math.max(liveDestinationPrice - paidUnitPrice, 0);
                          const savings = Math.max(standardEstimate - upgradeEstimate, 0);

                          return (
                            <MayButton
                              key={destination}
                              variant="primary"
                              size="sm"
                              className="w-full justify-between"
                              onClick={() => handleUpgradeSelection(destination)}
                              disabled={startingUpgradeKey === `${ticket.id}:${destination}`}
                            >
                              <span className="truncate">
                                Upgrade to {formatTicketType(destination)}{upgradeEstimate > 0 ? ` · pay only $${(upgradeEstimate / 100).toFixed(0)} more` : ""}
                                {savings > 0 ? ` · save $${(savings / 100).toFixed(0)}` : ""}
                              </span>
                              {startingUpgradeKey === `${ticket.id}:${destination}` ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ArrowRight className="h-4 w-4 shrink-0" />}
                            </MayButton>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start md:items-end gap-3 md:min-w-[200px]">
                  <div className="text-left md:text-right w-full">
                    <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>TICKET HOLDER</p>
                    {editingTicketId === ticket.id ? (
                      <div className="flex items-center gap-2 mt-1 justify-end">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8 w-40 text-sm"
                          placeholder="Enter name"
                          autoFocus
                          style={{ borderColor: `${COLORS.charcoal}20` }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName(ticket.id);
                            if (e.key === "Escape") handleCancelEdit();
                          }}
                        />
                        <MayButton size="icon" variant="ghost" onClick={() => handleSaveName(ticket.id)} disabled={savingName}>
                          {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" style={{ color: COLORS.forest }} />}
                        </MayButton>
                        <MayButton size="icon" variant="ghost" onClick={handleCancelEdit} disabled={savingName}>
                          <X className="h-4 w-4" style={{ color: COLORS.boulder }} />
                        </MayButton>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 md:justify-end">
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>{ticket.holder_name}</p>
                        {!ticket.checked_in_at && !dimmed && !isReadOnly && (
                          <button onClick={() => handleEditName(ticket)} className="opacity-50 hover:opacity-100 transition-opacity" title="Edit name">
                            <Pencil className="h-3 w-3" style={{ color: COLORS.boulder }} />
                          </button>
                        )}
                      </div>
                    )}
                    {ticket.holder_email && (
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>{ticket.holder_email}</p>
                    )}
                  </div>
                  {!dimmed && !isReadOnly && showQR && (
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.charcoal}10` }}>
                        <QRCode value={ticket.id} size={96} />
                      </div>
                      <AddToAppleWalletButton
                        ticketId={ticket.id}
                        holderName={ticket.holder_name}
                        ticketTypeLabel={formatTicketType(ticket.ticket_type)}
                        requireConfirm={tickets.length > 1}
                      />
                    </div>
                  )}
                  {!dimmed && !isReadOnly && !showQR && (
                    <div className="flex flex-col items-end gap-2">
                      <AddToAppleWalletButton
                        ticketId={ticket.id}
                        holderName={ticket.holder_name}
                        ticketTypeLabel={formatTicketType(ticket.ticket_type)}
                        requireConfirm={tickets.length > 1}
                      />
                    </div>
                  )}
                  {!dimmed && !isReadOnly && !showQR && (
                    <div className="flex items-center gap-1" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                      <QrCode className="h-3 w-3" />
                      <span>QR available 7 days before</span>
                    </div>
                  )}
                  {!ticket.checked_in_at && !dimmed && !isReadOnly && (
                    <div className="w-full rounded-lg p-3" style={{ backgroundColor: `${COLORS.charcoal}03`, border: `1px solid ${COLORS.charcoal}10` }}>
                      <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', marginBottom: '8px' }}>MANAGE TICKET</p>
                      <div className="flex w-full flex-col gap-2 sm:flex-row">
                        <MayButton size="sm" variant="clay" onClick={() => setAssignTicket(ticket)} className="w-full">
                          <Users className="h-3.5 w-3.5" />Assign ticket
                        </MayButton>
                        <MayButton size="sm" variant="outline" onClick={() => setTransferTicket(ticket)} className="w-full">
                          <Send className="h-3.5 w-3.5" />Transfer ticket
                        </MayButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Transfer History */}
              {ticket.transfer_count > 0 && transferHistory[ticket.id] && transferHistory[ticket.id].length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${COLORS.charcoal}15` }}>
                  <button
                    className="flex items-center gap-2 transition-opacity hover:opacity-70"
                    style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}
                    onClick={() => setExpandedHistory(expandedHistory === ticket.id ? null : ticket.id)}
                  >
                    <History className="h-4 w-4" />
                    <span>Transfer History ({transferHistory[ticket.id].length})</span>
                    {expandedHistory === ticket.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedHistory === ticket.id && (
                    <div className="mt-3 space-y-2">
                      {transferHistory[ticket.id].map((transfer: any) => (
                        <div key={transfer.id} className="p-3 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
                          <div className="flex items-center gap-2 mb-1" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
                            <span>{new Date(transfer.completed_at).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</span>
                          </div>
                          <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                            <span style={{ color: COLORS.boulder }}>From:</span> {transfer.old_holder_name || "Original purchaser"}
                            {transfer.old_holder_email && <span style={{ color: COLORS.boulder, fontSize: '11px' }}> ({transfer.old_holder_email})</span>}
                          </p>
                          <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                            <span style={{ color: COLORS.boulder }}>To:</span> {transfer.new_holder_name}
                            {transfer.new_holder_email && <span style={{ color: COLORS.boulder, fontSize: '11px' }}> ({transfer.new_holder_email})</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10">
      {/* === 1. TICKETS — top priority === */}
      {walletTickets.length > 0 && (
        <div id="ticket-wallet">
          <div className="flex items-baseline justify-between mb-4 gap-3">
            <div>
              <h2 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '22px' }}>Your Tickets</h2>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginTop: '2px' }}>
                {walletTickets.length} {walletTickets.length === 1 ? "ticket" : "tickets"} ready · tap any ticket to manage
                {walletTickets.length > 1 && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => {
                        const allExpanded = walletTickets.every((t) => expandedTickets.has(t.id));
                        setExpandedTickets(allExpanded ? new Set() : new Set(walletTickets.map((t) => t.id)));
                      }}
                      className="underline hover:opacity-70 transition-opacity"
                      style={{ color: COLORS.charcoal }}
                    >
                      {walletTickets.every((t) => expandedTickets.has(t.id)) ? "Collapse all" : "Expand all"}
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {showQR && (
                <span
                  className="px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
                  style={{ backgroundColor: `${COLORS.forest}12`, color: COLORS.forest, ...typography.caption, fontSize: '10px' }}
                >
                  <QrCode className="h-3 w-3" />QR codes live
                </span>
              )}
              <MayButton
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    toast.info("Preparing your PDF…");
                    const lodging = await fetchLodgingForPdf(userEmail, registrations.map((r) => r.id).filter(Boolean), sessionToken);
                    generateMyTicketsPdf({ userEmail, tickets: walletTickets, lodging });
                    toast.success("PDF ready — check your downloads.");
                  } catch (err: any) {
                    console.error("PDF generation failed:", err);
                    toast.error("Couldn't generate PDF. Please try again.");
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" />Download PDF
              </MayButton>
            </div>
          </div>
          <div className="grid gap-3">
            {walletTickets.map((t) => renderTicketCard(t, { dimmed: !!t.wallet_read_only && !t.event_details?.event_date ? false : false }))}
          </div>
        </div>
      )}

      {/* === Incomplete checkouts (expired / failed / in-progress) === */}
      {incompleteRegs.length > 0 && (
        <IncompleteCheckoutsSection
          registrations={incompleteRegs}
          resumingId={resumingRegId}
          onResume={async (reg) => {
            const attempt = async (): Promise<void> => {
              setResumingRegId(reg.id);
              const { data, error } = await invokeCheckout<{ url?: string }>("resume-ticket-checkout-session", {
                registrationId: reg.id,
                email: userEmail,
              });
              if (error) {
                console.error("Resume ticket error:", error.rawMessage);
                showCheckoutErrorToast(error, () => void attempt());
                setResumingRegId(null);
                return;
              }
              if (data?.url) {
                redirectToExternal(data.url);
                return;
              }
              toast.error("Couldn't resume checkout. Please try again.");
              setResumingRegId(null);
            };
            await attempt();
          }}
        />
      )}

      {/* === Pending Transfers (only when present) === */}
      {pendingTransfers.length > 0 && (
        <div>
          <h2 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', marginBottom: '12px' }}>Pending Transfers</h2>
          <div className="grid gap-3">
            {pendingTransfers.map((transfer) => (
              <div key={transfer.id} className="rounded-xl border p-5" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.mustard}40` }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                      Transfer to <strong>{transfer.new_holder_name}</strong>
                    </p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      {transfer.new_holder_email}
                    </p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
                      {transfer.tickets?.ticket_type && formatTicketType(transfer.tickets.ticket_type)}
                      {transfer.tickets?.event_details?.title && ` · ${transfer.tickets.event_details.title}`}
                    </p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', marginTop: '6px' }}>
                      Expires: {new Date(transfer.expires_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                    </p>
                  </div>
                  <MayButton variant="danger" size="sm" onClick={() => handleCancelTransfer(transfer.id)} disabled={cancellingTransferId === transfer.id}>
                    {cancellingTransferId === transfer.id ? <><Loader2 className="h-4 w-4 animate-spin" />Cancelling...</> : <><X className="h-4 w-4" />Cancel Transfer</>}
                  </MayButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === 2. ADD-ONS — promoted above lodging (sales priority) === */}
      <div id="add-ons-section">
        <AddOnsPurchaseSection
          userTicketTypes={Array.from(userTicketTypes)}
          userEmail={userEmail}
          registrations={registrations}
          onRefresh={fetchUserTickets}
        />
      </div>
      {/* === 3. LODGING — appears under add-ons (the component handles its own locked/quiet state) === */}
      <PurchasedLodgingSection userEmail={userEmail} verifiedEmail={verifiedEmail || userEmail} sessionToken={sessionToken} registrations={registrations} />

      {/* === 4. PLAN YOUR TRIP — arrival info (collapsible) === */}
      {upcomingEventDetails && (
        <ArrivalInfoSection eventDetails={upcomingEventDetails} userTicketTypes={Array.from(userTicketTypes)} />
      )}

      {/* === 5. ORDER HISTORY — past events (collapsed by default) === */}
      <EventHistorySection userEmail={userEmail} currentRegistrations={registrations} />

      {transferTicket && (
        <TransferTicketDialog ticket={transferTicket} verifiedEmail={verifiedEmail || userEmail} onClose={() => setTransferTicket(null)} onSuccess={() => { setTransferTicket(null); fetchUserTickets(); }} />
      )}
      {assignTicket && (
        <AssignTicketDialog ticket={assignTicket} verifiedEmail={verifiedEmail || userEmail} onClose={() => setAssignTicket(null)} onSuccess={() => { setAssignTicket(null); fetchUserTickets(); }} />
      )}
      {selectedUpgrade && (
        <Dialog open={true} onOpenChange={(open) => !open && setSelectedUpgrade(null)}>
          <DialogContent className="sm:max-w-lg" style={{ backgroundColor: COLORS.white }}>
            <DialogHeader>
              <DialogTitle style={{ ...typography.subhead, color: COLORS.charcoal }}>Confirm your upgrade</DialogTitle>
              <DialogDescription style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                Review this change before heading to secure checkout.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.denim}08`, border: `1px solid ${COLORS.denim}20` }}>
                <p style={{ ...typography.caption, color: COLORS.denim, fontSize: '10px', letterSpacing: '0.08em' }}>UPGRADE PATH</p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600, marginTop: '8px' }}>
                  {formatTicketType(selectedUpgrade.ticket.ticket_type)} → {formatTicketType(selectedUpgrade.destination)}
                </p>
              </div>
              {(() => {
                const liveDestinationPrice = getTicketConfig(selectedUpgrade.destination)?.price || 0;
                const liveOriginalPrice = getTicketConfig(selectedUpgrade.ticket.ticket_type)?.price || 0;
                const paidUnitPrice = selectedUpgrade.ticket.unit_price || 0;
                const priceRatio = liveOriginalPrice > 0 ? Math.min(paidUnitPrice / liveOriginalPrice, 1) : 1;
                const loyaltyPrice = Math.round(liveDestinationPrice * priceRatio);
                const dueNow = Math.max(loyaltyPrice - paidUnitPrice, 0);
                const standardDue = Math.max(liveDestinationPrice - paidUnitPrice, 0);
                const savings = Math.max(standardDue - dueNow, 0);
                const discountPct = Math.round((1 - priceRatio) * 100);
                return (
                  <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.charcoal}04`, border: `1px solid ${COLORS.charcoal}10` }}>
                    <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>PRICE BREAKDOWN</p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between" style={{ ...typography.body, fontSize: '13px', color: COLORS.charcoal }}>
                        <span>Current {formatTicketType(selectedUpgrade.destination)} price</span>
                        <span style={{ fontWeight: 600, textDecoration: savings > 0 ? 'line-through' : undefined, color: savings > 0 ? COLORS.boulder : undefined }}>${(liveDestinationPrice / 100).toFixed(2)}</span>
                      </div>
                      {savings > 0 && (
                        <div className="flex items-center justify-between" style={{ ...typography.body, fontSize: '13px', color: COLORS.forest }}>
                          <span>Your loyalty price ({discountPct}% off)</span>
                          <span style={{ fontWeight: 600 }}>${(loyaltyPrice / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between" style={{ ...typography.body, fontSize: '13px', color: COLORS.boulder }}>
                        <span>Credit for your current ticket</span>
                        <span>−${(paidUnitPrice / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 mt-2" style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
                        <span style={{ ...typography.body, fontSize: '14px', color: COLORS.charcoal, fontWeight: 600 }}>Due at checkout</span>
                        <span style={{ ...typography.body, fontSize: '18px', color: COLORS.charcoal, fontWeight: 700 }}>${(dueNow / 100).toFixed(2)}</span>
                      </div>
                      {savings > 0 && (
                        <p style={{ ...typography.body, fontSize: '12px', color: COLORS.forest, marginTop: '8px', lineHeight: 1.5 }}>
                          You saved ${(savings / 100).toFixed(0)} by keeping the early pricing tier you locked in at purchase.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.charcoal}04`, border: `1px solid ${COLORS.charcoal}10` }}>
                <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>UNLOCKS</p>
                <div className="mt-3 grid gap-2">
                  {getTicketIncludes(selectedUpgrade.destination).map((perk) => (
                    <div key={perk} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COLORS.forest }} />
                      <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', lineHeight: 1.5 }}>{perk}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <MayButton variant="outline" onClick={() => setSelectedUpgrade(null)}>Cancel</MayButton>
              <MayButton
                onClick={async () => {
                  const upgradeKey = `${selectedUpgrade.ticket.id}:${selectedUpgrade.destination}`;
                  const fallbackEmail = (selectedUpgrade.ticket.owner_email || selectedUpgrade.ticket.holder_email || verifiedEmail || userEmail || "").trim().toLowerCase();
                  const fallbackName = selectedUpgrade.ticket.holder_name || "Guest";
                  if (!fallbackEmail) {
                    toast.error("We couldn't find an email on this ticket. Please contact support.");
                    return;
                  }
                  const upgradeSelection = createCheckoutTicketSelection({
                    selectedTicket: selectedUpgrade.destination,
                    ticketType: selectedUpgrade.destination,
                    ticketName: formatTicketType(selectedUpgrade.destination),
                    ticketPrice: 0,
                    quantity: 1,
                    name: fallbackName,
                    email: fallbackEmail,
                  });
                  window.sessionStorage.setItem(CHECKOUT_TICKET_STORAGE_KEY, JSON.stringify(upgradeSelection));

                  const startUpgrade = async (): Promise<void> => {
                    setStartingUpgradeKey(upgradeKey);
                    setUpgradeCheckoutLoading(true);
                    const { data, error } = await invokeCheckout<{ checkoutUrl?: string }>("create-self-serve-upgrade-checkout", {
                      ticketId: selectedUpgrade.ticket.id,
                      destinationTicketType: selectedUpgrade.destination,
                      verifiedEmail: fallbackEmail,
                    });
                    if (error) {
                      console.error("Upgrade checkout error:", error.rawMessage);
                      showCheckoutErrorToast(error, () => void startUpgrade());
                      setUpgradeCheckoutLoading(false);
                      setStartingUpgradeKey(null);
                      return;
                    }
                    if (data?.checkoutUrl) {
                      redirectToExternal(data.checkoutUrl);
                      return;
                    }
                    toast.error("Unable to start your upgrade. Please try again.");
                    setUpgradeCheckoutLoading(false);
                    setStartingUpgradeKey(null);
                  };
                  await startUpgrade();
                }}
                disabled={upgradeCheckoutLoading}
              >
                {upgradeCheckoutLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Preparing checkout...</> : <>Continue to secure checkout<ArrowRight className="h-4 w-4" /></>}
              </MayButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Sticky mobile summary bar — quick jump to add-ons */}
      {walletTickets.length > 0 && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3 border-t"
          style={{
            backgroundColor: COLORS.white,
            borderColor: `${COLORS.charcoal}15`,
            boxShadow: `0 -4px 16px -8px ${COLORS.charcoal}30`,
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>
                {walletTickets.length} {walletTickets.length === 1 ? "ticket" : "tickets"} ready
              </p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', marginTop: '1px' }}>
                Make your weekend better
              </p>
            </div>
            <MayButton
              size="sm"
              variant="clay"
              onClick={() => {
                document.getElementById("add-ons-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />Add-Ons
            </MayButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== INCOMPLETE CHECKOUTS =====
type IncompleteStatus = {
  label: string;
  tone: "warning" | "danger" | "info";
  body: string;
  cta: string;
};

function describeIncompleteStatus(reg: any): IncompleteStatus {
  const expiresAt = reg.checkout_expires_at ? new Date(reg.checkout_expires_at).getTime() : null;
  const stillOpen = reg.payment_status === "pending"
    && reg.checkout_status === "open"
    && expiresAt && expiresAt > Date.now();

  if (reg.payment_status === "failed") {
    const reason = reg.last_payment_error_message || "Your card was declined.";
    return {
      label: "Payment failed",
      tone: "danger",
      body: `${reason} Try a different card to complete your purchase.`,
      cta: "Try a different card",
    };
  }
  if (reg.payment_status === "expired") {
    return {
      label: "Checkout expired",
      tone: "warning",
      body: "Your previous checkout window expired before payment finished. Pick up right where you left off.",
      cta: "Resume checkout",
    };
  }
  // pending
  if (stillOpen) {
    const mins = Math.max(1, Math.round((expiresAt! - Date.now()) / 60000));
    return {
      label: "Checkout in progress",
      tone: "info",
      body: `Your Stripe checkout is still open${mins < 60 ? ` for the next ~${mins} min` : ""}. Finish payment to confirm your spot.`,
      cta: "Continue checkout",
    };
  }
  return {
    label: "Awaiting payment",
    tone: "warning",
    body: "We started a checkout but haven't received payment yet. Resume to confirm your spot.",
    cta: "Resume checkout",
  };
}

function IncompleteCheckoutsSection({
  registrations,
  resumingId,
  onResume,
}: {
  registrations: any[];
  resumingId: string | null;
  onResume: (reg: any) => void;
}) {
  return (
    <details className="rounded-xl border overflow-hidden group" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between gap-3 list-none">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="px-2 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: `${COLORS.mustard}18`, color: COLORS.mustard, ...typography.caption, fontSize: '10px' }}
          >
            {registrations.length} UNFINISHED
          </span>
          <span className="truncate" style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
            Checkout(s) in progress — resume to confirm your spot
          </span>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: COLORS.boulder }} />
      </summary>
      <div className="px-5 pb-4 pt-1 space-y-2" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
        {registrations.map((reg) => {
          const status = describeIncompleteStatus(reg);
          const isResuming = resumingId === reg.id;
          return (
            <div key={reg.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>
                  {formatTicketType(reg.ticket_type)} × {reg.quantity || 1}
                  <span style={{ color: COLORS.boulder, fontWeight: 400, marginLeft: '8px', fontSize: '11px' }}>· {status.label}</span>
                </p>
              </div>
              <MayButton variant="outline" size="sm" onClick={() => onResume(reg)} disabled={isResuming}>
                {isResuming ? <><Loader2 className="h-4 w-4 animate-spin" />…</> : status.cta}
              </MayButton>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ===== TRANSFER DIALOG =====
function TransferTicketDialog({ ticket, verifiedEmail, onClose, onSuccess }: { ticket: any; verifiedEmail: string; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<"verify" | "transfer">("verify");
  const [otpCode, setOtpCode] = useState("");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpMethod, setOtpMethod] = useState<string | null>(null);
  const [otpDestination, setOtpDestination] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Tick the resend cooldown down every second
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendOtp = async (opts?: { resend?: boolean }) => {
    const isResend = !!opts?.resend;
    if (isResend && resendCooldown > 0) {
      toast.info(`Please wait ${resendCooldown}s before requesting a new code.`);
      return;
    }
    setSendingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-transfer-otp", { body: { ticketId: ticket.id, verifiedEmail } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOtpMethod(data.method);
      setOtpDestination(data.maskedDestination);
      if (isResend) {
        setOtpCode("");
        toast.success(`New code sent to ${data.maskedDestination}`);
      } else {
        toast.success(data.message);
      }
      setResendCooldown(30);
    } catch (error: any) {
      console.error("Send OTP error:", error);
      toast.error(error.message || "Failed to send verification code");
    } finally { setSendingOtp(false); }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) { toast.error("Please enter the 6-digit code"); return; }
    setVerifyingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-transfer-otp", { body: { ticketId: ticket.id, code: otpCode, verifiedEmail } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOtpId(data.otpId);
      setStep("transfer");
      toast.success("Identity verified!");
    } catch (error: any) {
      console.error("Verify OTP error:", error);
      toast.error(error.message || "Verification failed");
    } finally { setVerifyingOtp(false); }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) { toast.error("Please enter the new ticket holder's name"); return; }
    setTransferring(true);
    try {
      const { data, error } = await supabase.functions.invoke("transfer-ticket", {
        body: { ticketId: ticket.id, newHolderName: newName.trim(), newHolderEmail: newEmail.trim() || null, verifiedEmail, otpId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Ticket transferred successfully!");
      onSuccess();
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error(error.message || "Failed to transfer ticket");
    } finally { setTransferring(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" style={{ backgroundColor: COLORS.white }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ ...typography.subhead, color: COLORS.charcoal }}>
            <Shield className="h-5 w-5" style={{ color: COLORS.denim }} />
            {step === "verify" ? "Verify Your Identity" : "Transfer Ticket Ownership"}
          </DialogTitle>
          <DialogDescription style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
            {step === "verify" ? (
              "For security, we need to verify your identity before transferring this ticket."
            ) : (
              <>
                Transfer this ticket to someone else. They will become the new owner.
                <span className="block mt-2" style={{ color: COLORS.mustard, fontWeight: 600 }}>
                  Note: Tickets can only be transferred {2 - (ticket.transfer_count || 0)} more time(s).
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "verify" ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Ticket: {ticket.holder_name}</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                {ticket.ticket_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </p>
            </div>

            {!otpDestination ? (
              <div className="text-center space-y-3">
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  We'll send a 6-digit verification code to your phone number or email on file.
                </p>
                <MayButton onClick={handleSendOtp} disabled={sendingOtp} className="w-full">
                  {sendingOtp ? <><Loader2 className="h-4 w-4 animate-spin" />Sending code...</> : <><Send className="h-4 w-4" />Send Verification Code</>}
                </MayButton>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: `${COLORS.denim}08` }}>
                  {otpMethod === "sms" ? <Smartphone className="h-4 w-4 shrink-0" style={{ color: COLORS.denim }} /> : <Mail className="h-4 w-4 shrink-0" style={{ color: COLORS.denim }} />}
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                    Code sent via {otpMethod === "sms" ? "SMS" : "email"} to <strong>{otpDestination}</strong>
                  </span>
                </div>

                <div className="space-y-2">
                  <label style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>Enter 6-digit code</label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    style={{ borderColor: `${COLORS.charcoal}20` }}
                    autoFocus
                  />
                </div>

                <div className="flex gap-2">
                  <MayButton variant="outline" onClick={() => handleSendOtp({ resend: true })} disabled={sendingOtp || resendCooldown > 0} className="flex-1">
                    {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                  </MayButton>
                  <MayButton onClick={handleVerifyOtp} disabled={verifyingOtp || otpCode.length !== 6} className="flex-1">
                    {verifyingOtp ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying...</> : "Verify"}
                  </MayButton>
                </div>

                <p className="text-center" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                  Code expires in 10 minutes. Didn't receive it? Check your spam folder or click Resend.
                </p>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
              <a
                href={`mailto:hello@example.org?subject=${encodeURIComponent(`Help with ticket transfer — ${ticket.id.substring(0,8).toUpperCase()}`)}&body=${encodeURIComponent(`Hi Analog team,\n\nI need help with a ticket transfer.\n\nTicket ID: ${ticket.id}\nHolder: ${ticket.holder_name}\nMy email: ${verifiedEmail}\n\nWhat's going on:\n(please describe — e.g. didn't get the code, transferred to the wrong person, need to reverse a transfer)\n\nThanks!`)}`}
                style={{ ...typography.body, color: COLORS.denim, fontSize: '12px', textDecoration: 'underline' }}
              >
                Need help? Email support
              </a>
              <MayButton variant="outline" onClick={onClose}>Cancel</MayButton>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleTransfer} className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: `${COLORS.forest}08`, border: `1px solid ${COLORS.forest}20` }}>
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: COLORS.forest }} />
              <span style={{ ...typography.body, color: COLORS.forest, fontSize: '13px' }}>Identity verified</span>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Current holder: {ticket.holder_name}</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                {ticket.ticket_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                Any upgrade level, included perks, and access attached to this ticket will transfer with it.
              </p>
            </div>
            <div className="space-y-2">
              <label style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>New owner's name *</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" style={{ borderColor: `${COLORS.charcoal}20` }} required />
            </div>
            <div className="space-y-2">
              <label style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>New owner's email *</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" style={{ borderColor: `${COLORS.charcoal}20` }} required />
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>The transfer is instant. They'll get a notification with a link to view their ticket. You'll get a 30-minute undo link in case of a typo.</p>
            </div>
            <div className="text-center pt-1">
              <a
                href={`mailto:hello@example.org?subject=${encodeURIComponent(`Help with ticket transfer — ${ticket.id.substring(0,8).toUpperCase()}`)}&body=${encodeURIComponent(`Hi Analog team,\n\nI need help with a ticket transfer.\n\nTicket ID: ${ticket.id}\nCurrent holder: ${ticket.holder_name}\nMy email: ${verifiedEmail}\n\nWhat's going on:\n(please describe — e.g. need to reverse a transfer, recipient never got the ticket, sent to the wrong person)\n\nThanks!`)}`}
                style={{ ...typography.body, color: COLORS.denim, fontSize: '12px', textDecoration: 'underline' }}
              >
                Need help? Email support
              </a>
            </div>
            <DialogFooter>
              <MayButton variant="outline" onClick={onClose}>Cancel</MayButton>
              <MayButton type="submit" disabled={transferring}>
                {transferring ? <><Loader2 className="h-4 w-4 animate-spin" />Transferring...</> : "Transfer Ownership"}
              </MayButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===== ASSIGN DIALOG =====
function AssignTicketDialog({ ticket, verifiedEmail, onClose, onSuccess }: { ticket: any; verifiedEmail: string; onClose: () => void; onSuccess: () => void }) {
  const [holderName, setHolderName] = useState(ticket.holder_name || "");
  const [holderEmail, setHolderEmail] = useState(ticket.holder_email || "");
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holderName.trim()) { toast.error("Please enter the attendee's name"); return; }
    setAssigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("assign-ticket", {
        body: { ticketId: ticket.id, holderName: holderName.trim(), holderEmail: holderEmail.trim() || null, verifiedEmail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Ticket assigned successfully!");
      onSuccess();
    } catch (error: any) {
      console.error("Assign error:", error);
      toast.error(error.message || "Failed to assign ticket");
    } finally { setAssigning(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: COLORS.white }}>
        <DialogHeader>
          <DialogTitle style={{ ...typography.subhead, color: COLORS.charcoal }}>Assign Ticket</DialogTitle>
          <DialogDescription style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
            Name who will be attending with this ticket. You keep ownership and control of the ticket.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleAssign} className="space-y-4">
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
              {ticket.ticket_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
            </p>
          </div>
          <div className="space-y-2">
            <label style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>Attendee name *</label>
            <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Full name" style={{ borderColor: `${COLORS.charcoal}20` }} required />
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>This name will appear on the ticket for check-in.</p>
          </div>
          <div className="space-y-2">
            <label style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>Attendee email (optional)</label>
            <Input type="email" value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} placeholder="email@example.com" style={{ borderColor: `${COLORS.charcoal}20` }} />
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>Optional. They won't be able to transfer or manage this ticket.</p>
          </div>
          <DialogFooter>
            <MayButton variant="outline" onClick={onClose}>Cancel</MayButton>
            <MayButton type="submit" disabled={assigning}>
              {assigning ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Assign Ticket"}
            </MayButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ArrivalInfoSection moved to src/components/my-tickets/ArrivalInfoSection.tsx

// ===== UNIFIED ORDER SUMMARY =====
// Merges every transaction tied to this email — tickets, lodging, and add-ons —
// into one consolidated view, regardless of how many separate Stripe sessions
// or apostrophe-laden registrations make up the order.
function UnifiedOrderSummary({
  userEmail,
  sessionToken,
  registrations,
  tickets,
}: {
  userEmail: string;
  sessionToken?: string;
  registrations: any[];
  tickets: any[];
}) {
  const [lodging, setLodging] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabaseUrl = getSupabaseUrl();
        const supabaseKey = getSupabaseAnonKey();
        const normalizedEmail = userEmail.toLowerCase().trim();
        const regIds = registrations.map((r) => r.id).filter(Boolean);

        const lodgingUrl = new URL(`${supabaseUrl}/rest/v1/lodging_bookings`);
        lodgingUrl.searchParams.set("select", "id,zone_key,quantity,total_amount,payment_status,created_at,assignment_status");
        lodgingUrl.searchParams.set("payment_status", "eq.paid");
        if (regIds.length > 0) {
          lodgingUrl.searchParams.set("or", `(email.ilike.${normalizedEmail},registration_id.in.(${regIds.join(",")}))`);
        } else {
          lodgingUrl.searchParams.set("email", `ilike.${normalizedEmail}`);
        }

        const addonsUrl = new URL(`${supabaseUrl}/rest/v1/addon_purchases`);
        addonsUrl.searchParams.set("select", "id,quantity,total_amount,payment_status,purchase_type,addon_inventory(display_name)");
        addonsUrl.searchParams.set("purchaser_email", `ilike.${normalizedEmail}`);
        addonsUrl.searchParams.set("payment_status", "eq.paid");
        addonsUrl.searchParams.set("purchase_type", "eq.addon");

        const [lodgingRes, addonsRes] = await Promise.all([
          fetch(lodgingUrl.toString(), {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "x-mytickets-session": sessionToken || "",
            },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch(addonsUrl.toString(), {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "x-mytickets-session": sessionToken || "",
            },
          }).then((r) => (r.ok ? r.json() : [])),
        ]);

        if (cancelled) return;
        setLodging(Array.isArray(lodgingRes) ? lodgingRes : []);
        setAddons(Array.isArray(addonsRes) ? addonsRes : []);
      } catch (e) {
        console.warn("UnifiedOrderSummary fetch failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userEmail, sessionToken, registrations.map((r) => r.id).join(",")]);

  if (loading) return null;

  const ticketTotal = registrations.reduce((sum, r) => sum + (r.total_amount || 0), 0);
  const lodgingTotal = lodging.reduce((sum, l) => sum + (l.total_amount || 0), 0);
  const addonTotal = addons.reduce((sum, a) => sum + (a.total_amount || 0), 0);
  const grandTotal = ticketTotal + lodgingTotal + addonTotal;

  if (grandTotal === 0 && tickets.length === 0) return null;

  const fmt = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  const orderRefs = registrations.map((r) => r.order_number).filter(Boolean);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
      <div className="px-6 py-4 flex items-center justify-between gap-3" style={{ borderBottom: `1px solid ${COLORS.charcoal}10`, backgroundColor: `${COLORS.forest}06` }}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.forest}15` }}>
            <CheckCircle2 className="h-5 w-5" style={{ color: COLORS.forest }} />
          </div>
          <div>
            <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}>Your Complete Order</h3>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
              {orderRefs.length > 0 ? `Receipt summary · ${orderRefs.join(" · ")}` : "Receipt summary across every confirmed purchase"}
            </p>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', marginTop: '2px', fontStyle: 'italic' }}>
              Manage individual tickets, lodging, and add-ons in the sections below.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>TOTAL PAID</p>
          <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '22px' }}>{fmt(grandTotal)}</p>
        </div>
      </div>
      <div className="p-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.clay}08`, border: `1px solid ${COLORS.clay}18` }}>
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="h-4 w-4" style={{ color: COLORS.clay }} />
            <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>TICKETS</p>
          </div>
          <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '20px' }}>
            {tickets.length || registrations.reduce((s, r) => s + (r.quantity || 0), 0)}
          </p>
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>{fmt(ticketTotal)}</p>
        </div>
        <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.denim}08`, border: `1px solid ${COLORS.denim}18` }}>
          <div className="flex items-center gap-2 mb-2">
            <Home className="h-4 w-4" style={{ color: COLORS.denim }} />
            <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>LODGING</p>
          </div>
          <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '20px' }}>
            {lodging.reduce((s, l) => s + (l.quantity || 0), 0) || "—"}
          </p>
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
            {lodging.length > 0 ? fmt(lodgingTotal) : "Not booked"}
          </p>
        </div>
        <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.forest}08`, border: `1px solid ${COLORS.forest}18` }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4" style={{ color: COLORS.forest }} />
            <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>ADD-ONS</p>
          </div>
          <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '20px' }}>
            {addons.reduce((s, a) => s + (a.quantity || 0), 0) || "—"}
          </p>
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
            {addons.length > 0 ? fmt(addonTotal) : "None added"}
          </p>
        </div>
      </div>
    </div>
  );
}


// EventHistorySection moved to src/components/my-tickets/EventHistorySection.tsx

