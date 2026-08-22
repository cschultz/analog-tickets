import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, staggerContainer } from "@/styles/may-theme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { redirectToExternal } from "@/lib/safeRedirect";

const TICKET_LABELS: Record<string, string> = {
  "2day_ga": "2-Day GA",
  "saturday_ga": "Saturday GA",
  "friday_ga": "Friday GA",
};

interface CrewBid {
  id: string;
  captain_name: string;
  email: string;
  crew_size: number;
  ticket_type: string;
  accepted_price: number;
  payment_status: string;
  checkout_expires_at: string | null;
}

interface Assignee {
  name: string;
  email: string;
}

const CrewCheckout = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const isSuccess = params.get("success") === "true";
  const [bid, setBid] = useState<CrewBid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid checkout link.");
      setLoading(false);
      return;
    }

    const fetchBid = async () => {
      const { data, error: fetchErr } = await (supabase as any)
        .from("crew_bids")
        .select("*")
        .eq("checkout_token", token)
        .eq("status", "accepted")
        .single();

      if (fetchErr || !data) {
        setError("This checkout link is invalid or has expired.");
        setLoading(false);
        return;
      }

      // Check if link has expired
      if (data.checkout_expires_at && new Date(data.checkout_expires_at) < new Date()) {
        setIsExpired(true);
        setBid(data as CrewBid);
        setLoading(false);
        return;
      }

      setBid(data as CrewBid);
      setAssignees(Array.from({ length: data.crew_size }, () => ({ name: "", email: "" })));
      setLoading(false);
    };
    fetchBid();
  }, [token]);

  const handleAssigneeChange = (index: number, field: keyof Assignee, value: string) => {
    setAssignees(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleCheckout = async () => {
    if (!bid) return;
    setCheckoutLoading(true);
    const { data, error } = await invokeCheckout<{ url?: string }>("create-crew-checkout", {
      checkout_token: token,
      assignees,
    });
    if (error) {
      showCheckoutErrorToast(error, () => void handleCheckout());
      setCheckoutLoading(false);
      return;
    }
    if (data?.url) {
      redirectToExternal(data.url);
    } else {
      toast.error("No checkout URL returned. Please try again.");
      setCheckoutLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    ...typography.body,
    fontSize: '14px',
    backgroundColor: COLORS.white,
    border: `1.5px solid ${COLORS.boulder}`,
    borderRadius: '8px',
    padding: '10px 14px',
    width: '100%',
    color: COLORS.charcoal,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <p style={{ ...typography.body, color: COLORS.charcoal }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
        <MayHeader />
        <div className="max-w-xl mx-auto px-6 py-32 text-center">
          <h1 className="text-3xl mb-4" style={{ ...typography.headline, color: COLORS.charcoal }}>{error}</h1>
          <p style={{ ...typography.body, color: COLORS.boulder }}>
            If you believe this is an error, please reach out to us at <a href="mailto:hello@example.org" style={{ color: COLORS.clay, textDecoration: 'underline' }}>hello@example.org</a>.
          </p>
        </div>
        <MayFooter />
      </div>
    );
  }

  if (!bid) return null;

  const total = bid.accepted_price * bid.crew_size;

  // Expired state
  if (isExpired && bid.payment_status !== "paid") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
        <MayHeader />
        <div className="max-w-xl mx-auto px-6 py-32 text-center">
          <h1 className="text-3xl mb-4" style={{ ...typography.headline, color: COLORS.charcoal }}>
            This checkout link has expired
          </h1>
          <p className="mb-6" style={{ ...typography.body, color: COLORS.boulder }}>
            The 24-hour window to complete your crew's purchase has passed. If you'd still like to secure tickets for your crew, please reach out and we'll get you sorted.
          </p>
          <a
            href="mailto:hello@example.org?subject=Crew%20Bid%20Expired%20-%20${encodeURIComponent(bid.captain_name)}"
            className="inline-block py-3 px-8 rounded-full text-base transition-all duration-300 hover:scale-[1.02]"
            style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, textDecoration: 'none' }}
          >
            Contact Us
          </a>
        </div>
        <MayFooter />
      </div>
    );
  }

  // Success state after Stripe redirect or revisit of paid bid
  if (isSuccess || bid.payment_status === "paid") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
        <MayHeader />
        <section className="relative py-32">
          <FilmGrainOverlay opacity={0.3} />
          <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
            <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
              <motion.p variants={fadeInUp} className="text-6xl mb-6">🎉</motion.p>
              <motion.h1 variants={fadeInUp} className="text-3xl md:text-5xl mb-4" style={{ ...typography.headline, color: COLORS.charcoal }}>
                You're All Set, {bid.captain_name.split(" ")[0]}!
              </motion.h1>
              <motion.p variants={fadeInUp} className="text-lg mb-8" style={{ ...typography.body, color: COLORS.boulder }}>
                Your crew of {bid.crew_size} is confirmed for Cosmico. A confirmation email with all the details has been sent to <strong>{bid.email}</strong>.
              </motion.p>
              <motion.div variants={fadeInUp} className="rounded-xl p-6 mb-8" style={{ backgroundColor: COLORS.charcoal }}>
                <div className="flex justify-between mb-3">
                  <span style={{ ...typography.body, color: COLORS.boulder }}>Ticket Type</span>
                  <span style={{ ...typography.subhead, color: COLORS.white }}>{TICKET_LABELS[bid.ticket_type] || bid.ticket_type}</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span style={{ ...typography.body, color: COLORS.boulder }}>Crew Size</span>
                  <span style={{ ...typography.subhead, color: COLORS.white }}>{bid.crew_size} tickets</span>
                </div>
                <div className="border-t border-white/10 mt-4 pt-4 flex justify-between">
                  <span style={{ ...typography.subhead, color: COLORS.white }}>Total Paid</span>
                  <span className="text-2xl" style={{ ...typography.headline, color: COLORS.mustard }}>${total.toLocaleString()}</span>
                </div>
              </motion.div>
              <motion.p variants={fadeInUp} className="text-sm" style={{ ...typography.body, color: COLORS.boulder }}>
                Each crew member will receive their own ticket with a unique QR code closer to the event.
              </motion.p>
            </motion.div>
          </div>
        </section>
        <MayFooter />
      </div>
    );
  }

  // Format deadline for display
  const deadlineDisplay = bid.checkout_expires_at
    ? new Date(bid.checkout_expires_at).toLocaleString("en-US", { weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short", timeZone: "America/Los_Angeles" })
    : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader />

      <section className="relative py-32">
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.p variants={fadeInUp} className="text-center mb-3" style={{ ...typography.caption, color: COLORS.clay }}>
              CREW BID ACCEPTED
            </motion.p>
            <motion.h1 variants={fadeInUp} className="text-3xl md:text-5xl text-center mb-4" style={{ ...typography.headline, color: COLORS.charcoal }}>
              Complete Your Crew's Purchase
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-center mb-10" style={{ ...typography.body, color: COLORS.boulder }}>
              Congratulations, {bid.captain_name}! Your crew bid has been accepted.
            </motion.p>

            {/* Deadline banner */}
            {deadlineDisplay && (
              <motion.div variants={fadeInUp} className="rounded-lg p-4 mb-6 text-center" style={{ backgroundColor: '#FFF8F0', border: '1px solid #E9835E33' }}>
                <p className="text-sm" style={{ ...typography.body, color: COLORS.charcoal }}>
                  ⏰ This link expires <strong>{deadlineDisplay}</strong>
                </p>
              </motion.div>
            )}

            {/* Order Summary */}
            <motion.div variants={fadeInUp} className="rounded-xl p-6 mb-10" style={{ backgroundColor: COLORS.charcoal }}>
              <div className="flex justify-between mb-3">
                <span style={{ ...typography.body, color: COLORS.boulder }}>Ticket Type</span>
                <span style={{ ...typography.subhead, color: COLORS.white }}>{TICKET_LABELS[bid.ticket_type] || bid.ticket_type}</span>
              </div>
              <div className="flex justify-between mb-3">
                <span style={{ ...typography.body, color: COLORS.boulder }}>Crew Size</span>
                <span style={{ ...typography.subhead, color: COLORS.white }}>{bid.crew_size} tickets</span>
              </div>
              <div className="flex justify-between mb-3">
                <span style={{ ...typography.body, color: COLORS.boulder }}>Price Per Ticket</span>
                <span style={{ ...typography.subhead, color: COLORS.mustard }}>${bid.accepted_price}</span>
              </div>
              <div className="border-t border-white/10 mt-4 pt-4 flex justify-between">
                <span style={{ ...typography.subhead, color: COLORS.white }}>Total</span>
                <span className="text-2xl" style={{ ...typography.headline, color: COLORS.mustard }}>${total.toLocaleString()}</span>
              </div>
            </motion.div>

            {/* Ticket Assignment */}
            <motion.div variants={fadeInUp}>
              <h3 className="text-xl mb-4" style={{ ...typography.subhead, color: COLORS.charcoal }}>
                Assign Tickets (optional — you can do this later)
              </h3>
              <div className="space-y-4 mb-8">
                {assignees.map((a, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs mb-1 block" style={{ ...typography.caption, color: COLORS.boulder }}>
                        TICKET {i + 1} — NAME
                      </span>
                      <input
                        type="text"
                        value={a.name}
                        onChange={e => handleAssigneeChange(i, "name", e.target.value)}
                        style={inputStyle}
                        placeholder={i === 0 ? bid.captain_name : ""}
                      />
                    </div>
                    <div>
                      <span className="text-xs mb-1 block" style={{ ...typography.caption, color: COLORS.boulder }}>
                        EMAIL
                      </span>
                      <input
                        type="email"
                        value={a.email}
                        onChange={e => handleAssigneeChange(i, "email", e.target.value)}
                        style={inputStyle}
                        placeholder={i === 0 ? bid.email : ""}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs mb-6" style={{ ...typography.body, color: COLORS.boulder }}>
                Tickets are transferable — you can reassign them later if plans change.
              </p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full py-4 rounded-full text-lg transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white }}
              >
                {checkoutLoading ? "Redirecting to checkout..." : `Complete Purchase — $${total.toLocaleString()}`}
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default CrewCheckout;