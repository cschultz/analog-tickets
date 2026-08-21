import { useState, useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography } from "@/styles/may-theme";
import { trackLead, generateEventId } from "@/components/AnalyticsTracking";
import { motion, AnimatePresence } from "framer-motion";

interface ExitIntentPopupProps {
  open: boolean;
  onClose: () => void;
  mode?: "modal" | "sheet";
  autoCloseMs?: number;
}

function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "ANALOG-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const ExitIntentPopup = ({ open, onClose, mode = "modal", autoCloseMs }: ExitIntentPopupProps) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState("");
  const [applyingNow, setApplyingNow] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-close timer — cancelled the moment user starts typing or interacts.
  // Without this, mobile users filling the form had it disappear mid-typing.
  useEffect(() => {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    if (!open || !autoCloseMs || generatedCode || hasInteracted) return;

    autoCloseRef.current = setTimeout(() => {
      onClose();
    }, autoCloseMs);

    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, [open, autoCloseMs, generatedCode, onClose, hasInteracted]);

  // Reset interaction flag when popup closes
  useEffect(() => {
    if (!open) setHasInteracted(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setApplyingNow(false);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) { setCountdown("Expired"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [expiresAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email");
      return;
    }
    if (!trimmedPhone || trimmedPhone.length < 7) {
      toast.error("Phone number is needed for festival text updates");
      return;
    }

    setIsSubmitting(true);
    try {
      // Check for existing active code (via safe RPC)
      const { data: existing } = await supabase
        .rpc("get_active_popup_promo_code", {
          p_email: trimmedEmail,
          p_sources: ["high_intent_popup", "exit_intent_popup"],
        });

      if (existing && existing.length > 0) {
        setGeneratedCode(existing[0].code);
        setExpiresAt(new Date(existing[0].valid_until));
        try { sessionStorage.setItem("cosmico_hi_promo_claimed", "1"); } catch {}
        setIsSubmitting(false);
        return;
      }

      // Check if already purchased
      const { count } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("email", trimmedEmail)
        .eq("payment_status", "paid");

      if (count && count > 0) {
        toast.info("Looks like you already have tickets! See you there 🎉");
        onClose();
        return;
      }

      const code = generatePromoCode();
      const now = new Date();
      const codeExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      const { error: insertError } = await supabase
        .from("promo_codes")
        .insert({
          code,
          description: `Exit intent popup – ${trimmedName || trimmedEmail}`,
          discount_type: "percentage",
          discount_value: 20,
          is_active: true,
          is_single_use: true,
          max_uses: 1,
          valid_from: now.toISOString(),
          valid_until: codeExpiresAt.toISOString(),
          source: "exit_intent_popup",
          is_stackable: false,
          recipient_email: trimmedEmail,
          recipient_name: trimmedName || null,
          recipient_phone: trimmedPhone,
        });

      if (insertError) throw insertError;

      await supabase.functions.invoke("upsert-checkout-abandonment", {
        body: {
          email: trimmedEmail,
          name: trimmedName || null,
          ticket_type: null,
        },
      });

      // Upsert into newsletter_leads so they appear in lead recovery dashboard
      const nameParts = trimmedName.split(" ");
      await supabase.from("newsletter_leads").upsert(
        {
          email: trimmedEmail,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(" ") || null,
          source: "exit_intent_popup",
          lead_status: "new",
          has_purchased: false,
        } as any,
        { onConflict: "email,source" }
      );

      // Log intent signal
      const sessionId = sessionStorage.getItem("cart_session_id") || crypto.randomUUID();
      await supabase.from("cart_intent_signals").insert({
        session_id: sessionId,
        signal_type: "exit_intent_promo_claimed",
        email: trimmedEmail,
        name: trimmedName || null,
      });

      // Track as lead
      const leadEventId = generateEventId("Lead");
      trackLead("Exit Intent Promo Capture", trimmedEmail, leadEventId);

      // Sync phone to SMS list
      supabase.functions.invoke("sync-simpletexting", {
        body: {
          phone: trimmedPhone,
          email: trimmedEmail,
          firstName: trimmedName || undefined,
          listName: "Cosmico Full List",
        },
      }).catch(() => {});

      // Auto-send promo code via email
      supabase.functions.invoke("send-high-intent-promo-email", {
        body: {
          code,
          email: trimmedEmail,
          name: trimmedName || null,
        },
      }).catch(() => {});

      // Auto-send promo code via SMS (log errors instead of swallowing)
      supabase.functions.invoke("send-promo-sms-batch", {
        body: {
          leads: [{
            phone: trimmedPhone,
            name: trimmedName || undefined,
            code,
          }],
        },
      }).then(({ error: smsErr, data }) => {
        if (smsErr) console.error("[ExitIntent] SMS invoke error:", smsErr);
        else console.log("[ExitIntent] SMS sent", { ok: !!data });
      }).catch((e) => console.error("[ExitIntent] SMS exception:", e));

      setGeneratedCode(code);
      setExpiresAt(codeExpiresAt);
      // Mark as claimed so the page-level trigger no longer re-shows the popup.
      try { sessionStorage.setItem("cosmico_hi_promo_claimed", "1"); } catch {}
    } catch (err) {
      console.error("Exit intent promo error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyNow = () => {
    if (!generatedCode) return;
    setApplyingNow(true);
    sessionStorage.setItem("cosmico_auto_promo", generatedCode);
    window.location.href = "/tickets";
  };

  const handleEmailIt = async () => {
    if (!generatedCode) return;
    try {
      await supabase.functions.invoke("send-high-intent-promo-email", {
        body: {
          code: generatedCode,
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
        },
      });
      toast.success("Check your inbox! Your code is on its way.");
      setTimeout(onClose, 2000);
    } catch {
      toast.error("Could not send email, but your code is above — save it!");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-50 flex ${mode === "sheet" ? "items-end justify-center" : "items-center justify-center p-4"}`}
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => {
            // Don't dismiss on backdrop tap if user has started filling the form —
            // prevents accidental loss of typed input on mobile.
            if (e.target === e.currentTarget && !hasInteracted) onClose();
          }}
        >
          <motion.div
            initial={mode === "sheet" ? { opacity: 0, y: 48 } : { scale: 0.9, opacity: 0, y: 20 }}
            animate={mode === "sheet" ? { opacity: 1, y: 0 } : { scale: 1, opacity: 1, y: 0 }}
            exit={mode === "sheet" ? { opacity: 0, y: 48 } : { scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`relative w-full ${mode === "sheet" ? "max-w-none rounded-t-[28px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[72vh] overflow-y-auto" : "max-w-md rounded-2xl p-8"}`}
            style={{ backgroundColor: COLORS.white }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-full hover:opacity-70 z-10"
              style={{ color: COLORS.boulder }}
            >
              <X className="w-5 h-5" />
            </button>

            {generatedCode ? (
              <div className="text-center space-y-5">
                <div>
                  <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: COLORS.clay }} />
                  <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "22px" }}>
                    You're in 🤝
                  </h3>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "14px", marginTop: "8px", lineHeight: 1.6 }}>
                    Here's your exclusive code — 20% off tickets, good for 48 hours.
                  </p>
                </div>

                <div
                  className="py-4 px-6 rounded-xl text-center"
                  style={{ backgroundColor: COLORS.dustySky }}
                >
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: "11px", marginBottom: "4px" }}>
                    YOUR CODE
                  </p>
                  <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "28px", letterSpacing: "0.05em" }}>
                    {generatedCode}
                  </p>
                  {countdown && (
                    <p style={{ ...typography.caption, color: COLORS.clay, fontSize: "13px", marginTop: "8px", fontWeight: 600 }}>
                      ⏳ Expires in {countdown}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleApplyNow}
                    disabled={applyingNow}
                    className="w-full py-3.5 uppercase hover:opacity-90 transition-opacity disabled:opacity-50 rounded-lg"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.white,
                      border: "none",
                      fontSize: "13px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {applyingNow ? "Redirecting..." : "Apply Now"}
                  </button>
                  <button
                    onClick={handleEmailIt}
                    className="w-full py-3 uppercase hover:opacity-70 transition-opacity rounded-lg"
                    style={{
                      ...typography.button,
                      backgroundColor: "transparent",
                      color: COLORS.charcoal,
                      border: `1px solid ${COLORS.charcoal}20`,
                      fontSize: "12px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Email It To Me
                  </button>
                </div>

                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}>
                  Applies to tickets only. One-time use. Expires in 48 hours. Cannot be combined with other offers.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "22px", letterSpacing: "0.01em" }}>
                    Not everyone gets this.
                  </h3>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "14px", marginTop: "10px", lineHeight: 1.7 }}>
                    But something tells us you belong here. Consider this your hookup — 20% off tickets to Cosmico, just for you. Grab it before it's gone.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  onFocus={() => setHasInteracted(true)}
                  onInput={() => setHasInteracted(true)}
                  className="space-y-3"
                >

                  <Input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      backgroundColor: COLORS.dustySky,
                      borderColor: `${COLORS.charcoal}15`,
                      color: COLORS.charcoal,
                    }}
                  />
                  <div>
                    <Input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={{
                        backgroundColor: COLORS.dustySky,
                        borderColor: `${COLORS.charcoal}15`,
                        color: COLORS.charcoal,
                      }}
                    />
                    <p className="mt-1 ml-1" style={{ ...typography.body, color: COLORS.boulder, fontSize: "10px" }}>
                      Where we'll send your code
                    </p>
                  </div>
                  <div>
                    <Input
                      type="tel"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      autoComplete="tel"
                      style={{
                        backgroundColor: COLORS.dustySky,
                        borderColor: `${COLORS.charcoal}15`,
                        color: COLORS.charcoal,
                      }}
                    />
                    <p className="mt-1 ml-1" style={{ ...typography.body, color: COLORS.boulder, fontSize: "10px" }}>
                      Festival updates are sent via text
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 uppercase hover:opacity-90 transition-opacity disabled:opacity-50 rounded-lg"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.white,
                      border: "none",
                      fontSize: "13px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {isSubmitting ? "Creating your code..." : "Unlock 20% Off Tickets"}
                  </button>
                </form>

                <p
                  className="text-center mt-3"
                  style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}
                >
                  One-time use. Expires in 48 hours. No spam.
                </p>
                {mode === "sheet" && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-3 uppercase hover:opacity-70 transition-opacity rounded-lg mt-2"
                    style={{
                      ...typography.button,
                      backgroundColor: "transparent",
                      color: COLORS.boulder,
                      border: `1px solid ${COLORS.charcoal}20`,
                      fontSize: "12px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Maybe Later
                  </button>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
