import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams, Link } from "react-router-dom";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import CountdownTimer from "@/components/may/CountdownTimer";
import { COLORS, typography, heavyGrain, halftonePatternDense, fadeInUp } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { usePageMeta } from "@/hooks/usePageMeta";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Photos
import crewFriendsGolden from "@/assets/may/crew-friends-golden.webp";
import sundropDetail from "@/assets/may/saunavendors/sundrop-detail.jpg";
import tentStars from "@/assets/wildhaven/tent-stars.webp";
import rivianGiveaway from "@/assets/may/rivian-giveaway.jpg";
import { redirectToExternal } from "@/lib/safeRedirect";
import { PRODUCER_DISPLAY_NAME } from "@/platform/externalLinks";

// Every entrant gets exactly ONE entry. Donations are 100% optional and do not
// increase chances of winning — required for sweepstakes-law and Meta-policy compliance.

const grandPrizeHighlights = [
  {
    eyebrow: "Festival access",
    title: "Two VIP Weekend Tix",
    description: "Come all the way in — full VIP access to Cosmico, shared with someone you actually want beside you.",
  },
  {
    eyebrow: "Stay on-site",
    title: "Example Meadow — 2 Nights",
    description: "An overnight setup already waiting for you, so the win feels like an arrival instead of a logistics project. Two nights included via Example Meadow's buy-one-get-one promotion.",
  },
  {
    eyebrow: "Partner perks",
    title: "Stacked Extras From Our Partners",
    description: "Redeem on your own time — a Sunhouse sauna ritual at the demo wellness outpost, plus a 72-hour Demo Adventure Vehicle weekend getaway booked whenever it suits you.",
  },
];

const prizeStoryCards = [
  {
    eyebrow: "Stay on-site",
    title: "Sleep inside the weekend.",
    description: "A Example Meadow tent stay turns the giveaway into a full escape, not just a pair of tickets. Wake up in the trees, walk straight into the day, and stay close to the river all weekend.",
    image: tentStars,
    alt: "Glamping tent at Example Meadow lit warmly at dusk",
  },
  {
    eyebrow: "Reset on your time",
    title: "A Sunhouse sauna ritual.",
    description: "Sunhouse brings the kind of ritual that resets the whole nervous system — heat, cold water, deep exhale. Redeemable at their the demo wellness outpost location, on a date that works for you.",
    image: sundropDetail,
    alt: "Sunhouse Sauna outdoor ritual setting at the demo wellness outpost",
  },
  {
    eyebrow: "Take the long way",
    title: "A Demo Adventure Vehicle weekend getaway.",
    description: "A 72-hour Demo Adventure Vehicle adventure — beautiful, capable, and built for detours through wine country. Book it whenever it fits your calendar; no need to tie it to the festival weekend.",
    image: rivianGiveaway,
    alt: "Demo Adventure Vehicle SUV in Example Valley wine country during golden hour",
  },
];

const partnerPrizeDetails = [
  {
    name: "Sunhouse Sauna",
    bio: "Outdoor sauna and cold-water ritual experiences rooted in Northern California landscapes.",
    offering: "A bathing experience at a Sunhouse original location — the demo wellness outpost — with sauna, cold plunge, and outdoor lounge time. Booked on a date that works for you.",
    finePrint: "Redeemable at the demo wellness outpost locations only — not on-site at Cosmico. Sauna is first-come, first-served. All participants must wear proper bathing suits, be 18+, and complete the safety waiver.",
  },
  {
    name: "Demo Adventure Vehicle",
    bio: "A 72-hour weekend adventure with a Demo Adventure Vehicle R1T or R1S, built for a memorable getaway.",
    offering: "Vehicle access, charging support, and adventure-ready outfitting coordinated by the Demo Adventure Vehicle team. Booked on a weekend that works for you — no need to tie it to the festival.",
    finePrint: "Driver must be age 21+. All passengers must complete a waiver. Please give 2 weeks’ notice to request the weekend getaway.",
  },
  {
    name: "Bon Ton Studio",
    bio: "Through the vision of owner Erika Dawkins, Bon Ton Studio was born in Example Valley, California in 2016. Inspired by a decade of experiences and adventures from around the world, Bon Ton Studio is an evolving collection of wovens, apparel, soft goods, and beautiful designs from artisans all over the world.",
    offering: "A $100 gift card to Bon Ton Studio, redeemable online or in their Example Valley shop. Explore the collection at bonton-studio.com.",
    finePrint: "Gift card is non-transferable, has no cash value, and does not expire. Shipping and applicable taxes are the winner's responsibility.",
  },
];

const MayWin = () => {
  useCanonicalUrl("/win");
  usePageMeta({
    title: "Win a VIP Weekend — Cosmico 2026 Giveaway",
    description: "Enter free to win 2 VIP weekend tix, 2 nights on-site at Example Meadow, a Sunhouse sauna ritual, and a Demo Adventure Vehicle weekend. Open to U.S. residents 18+. Ends May 8, 2026.",
    ogImage: "https://example.org/og-win.jpg",
    ogUrl: "https://example.org/win",
  });
  const [searchParams] = useSearchParams();
  const [selectedTier, setSelectedTier] = useState<string | null>("free");
  const [donationAmount, setDonationAmount] = useState<number>(0); // dollars
  const [customDonation, setCustomDonation] = useState<string>("");
  const [email, setEmail] = useState("");
  const [heroEmail, setHeroEmail] = useState("");
  const [heroSubmitted, setHeroSubmitted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isSuccess = searchParams.get("success") === "true";
  const entriesWon = searchParams.get("entries");

  useEffect(() => {
    if (isSuccess) {
      toast.success("You're in. We'll be in touch.");
      // Fire giveaway promo + confirmation email for paid entries returning from Stripe
      const returnEmail = searchParams.get("email");
      const returnName = searchParams.get("name");
      const returnDonation = Number(searchParams.get("donation") || 0);
      if (returnEmail) {
        supabase.functions.invoke("send-giveaway-promo", {
          body: { email: returnEmail, name: returnName || undefined },
        }).catch((e) => console.error("Giveaway promo error:", e));
        supabase.functions.invoke("send-raffle-confirmation", {
          body: { email: returnEmail, firstName: returnName || undefined, donationAmount: returnDonation },
        }).catch((e) => console.error("Raffle confirmation error:", e));
      }
    }
  }, [isSuccess, entriesWon, searchParams]);

  const scrollToForm = () => {
    const el = document.getElementById("enter");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  const handleHeroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroEmail) return;
    const cleanEmail = heroEmail.trim().toLowerCase();
    setEmail(heroEmail);
    setSelectedTier("free");
    setHeroSubmitted(true);
    setTimeout(() => scrollToForm(), 100);

    // Immediately capture email as a partial entry
    try {
      await supabase.from("raffle_entries").insert({
        email: cleanEmail,
        tier: "free",
        entries_count: 1,
        donation_amount: 0,
        payment_status: "partial",
      });
      // Sync to Flodesk immediately — awaited so the request isn't cancelled
      await supabase.functions.invoke("sync-flodesk", {
        body: { email: cleanEmail, segmentIds: ["6930a0da231c07add766b8a0"] },
      });
    } catch (err) {
      console.error("Early email capture error:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Resolve donation amount in dollars (custom field overrides chip if filled)
    const customNum = customDonation.trim() === "" ? NaN : Number(customDonation);
    const donationDollars = !Number.isNaN(customNum) && customNum > 0 ? Math.floor(customNum) : donationAmount;
    const isPaid = donationDollars >= 1;

    setLoading(true);
    try {
      if (!isPaid) {
        // Free entry path — promote partial row (or insert) via edge fn
        // because anon RLS forbids selecting/updating raffle_entries.
        const { data: result, error: completeErr } = await supabase.functions.invoke(
          "complete-raffle-entry",
          {
            body: {
              email: email.trim().toLowerCase(),
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              phone: phone || undefined,
            },
          }
        );
        if (completeErr) throw completeErr;

        // Marketing sync now happens server-side inside complete-raffle-entry
        setSubmitted(true);

        if (result?.status === "already_entered") {
          toast.success("You're already entered. We'll be in touch.");
        } else {
          toast.success("You're in. We'll be in touch.");
        }

        supabase.functions.invoke("send-giveaway-promo", {
          body: { email: email.trim().toLowerCase(), name: firstName || undefined },
        }).catch((e) => console.error("Giveaway promo error:", e));
        supabase.functions.invoke("send-raffle-confirmation", {
          body: { email: email.trim().toLowerCase(), firstName: firstName || undefined, donationAmount: 0 },
        }).catch((e) => console.error("Raffle confirmation error:", e));
      } else {
        // Paid donation path — open Stripe checkout with custom amount
        const { data, error } = await supabase.functions.invoke("create-raffle-checkout", {
          body: {
            email,
            firstName,
            lastName,
            phone,
            donationAmount: donationDollars * 100, // cents
            tier: "custom",
          },
        });

        if (error) throw error;
        if (data?.url) {
          // Marketing sync now happens server-side inside create-raffle-checkout
          redirectToExternal(data.url);
        }
      }
    } catch (err: any) {
      console.error("Raffle entry error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Marketing sync (Flodesk + SimplyTexting) is invoked server-side from the
  // raffle edge functions to avoid the browser cancelling fire-and-forget
  // requests during page unload / Stripe redirect.

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO WITH INLINE EMAIL CAPTURE ===== */}
      {/* Mobile: copy-first (order-1), collage second (order-2) so the H1, countdown,
          and email field land above the fold. Desktop keeps the original side-by-side. */}
      <section className="relative md:min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 md:min-h-screen">
          {/* Left — Prize collage (mobile: order-2, slimmer) */}
          <div className="relative order-2 md:order-1 min-h-[34vh] md:min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.charcoal }}>
            <div className="grid grid-cols-2 md:grid-cols-12 h-full min-h-[34vh] md:min-h-screen gap-[1px]" style={{ backgroundColor: `${COLORS.deepWater}50` }}>
              <div className="relative col-span-2 md:col-span-12 min-h-[14rem] md:min-h-0">
                <img src={tentStars} alt="Glamping tent at Example Meadow" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${COLORS.charcoal}80 100%)` }} />
                <div className="absolute left-6 bottom-6 md:left-8 md:bottom-8 z-20 max-w-sm">
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.14em', fontSize: '10px', marginBottom: '10px' }}>
                    EXAMPLE MEADOW
                  </p>
                  <p style={{ ...typography.subhead, color: COLORS.white, fontSize: '1.2rem', lineHeight: 1.1 }}>
                    On-site tent stay included.
                  </p>
                </div>
              </div>

              <div className="relative col-span-1 md:col-span-6 min-h-[9rem] md:min-h-0">
                <img src={sundropDetail} alt="Sunhouse Sauna experience" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 10%, ${COLORS.charcoal}95 100%)` }} />
                <div className="absolute left-3 bottom-3 md:left-5 md:bottom-5 z-20">
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.14em', fontSize: '9px', marginBottom: '6px' }}>
                    SUNHOUSE SAUNA
                  </p>
                  <p style={{ ...typography.subhead, color: COLORS.white, fontSize: '0.85rem', lineHeight: 1.1 }}>
                    Heat. River. Reset.
                  </p>
                </div>
              </div>

              <div className="relative col-span-1 md:col-span-6 min-h-[9rem] md:min-h-0">
                <img src={rivianGiveaway} alt="Demo Adventure Vehicle weekend adventure in Example Valley" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 10%, ${COLORS.charcoal}95 100%)` }} />
                <div className="absolute left-3 bottom-3 md:left-5 md:bottom-5 z-20">
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.14em', fontSize: '9px', marginBottom: '6px' }}>
                    DEMO ADVENTURE VEHICLE WEEKEND
                  </p>
                  <p style={{ ...typography.subhead, color: COLORS.white, fontSize: '0.85rem', lineHeight: 1.1 }}>
                    A getaway, not just a ride.
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute inset-0 pointer-events-none z-30" style={{ ...heavyGrain, opacity: 0.18, mixBlendMode: 'overlay' }} />
            <div className="absolute inset-0 pointer-events-none z-30" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
          </div>

          {/* Right — Copy + inline email capture (mobile: order-1 so it lands above the fold) */}
          <motion.div
            className="relative order-1 md:order-2 md:min-h-screen flex flex-col justify-center px-6 pt-20 pb-10 md:px-12 md:py-16 lg:px-16 lg:py-20"
            style={{ backgroundColor: COLORS.deepWater }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 max-w-xl">
              <motion.p
                style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              >
                GIVEAWAY · COSMICO 2026
              </motion.p>

              <motion.h1
                className="text-[2.15rem] sm:text-[2.8rem] md:text-[3.25rem] lg:text-[3.85rem] leading-[0.98] tracking-tight mb-5"
                style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
              >
                Win A VIP<br />Weekend
              </motion.h1>

              <motion.p
                className="text-sm md:text-base max-w-lg mb-5"
                style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.9, lineHeight: 1.7 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              >
                Enter for free to win a fully built Cosmico escape — <strong style={{ color: COLORS.white }}>two VIP weekend tix for you and a guest</strong>, two nights on-site at Example Meadow, a Sunhouse sauna ritual, and a Demo Adventure Vehicle weekend layered in.
              </motion.p>

              <motion.p
                className="text-xs uppercase max-w-md mb-5"
                style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.12em', lineHeight: 1.7 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.73 }}
              >
                2× VIP WEEKEND TIX · 2 NIGHTS EXAMPLE MEADOW · SUNHOUSE SAUNA · DEMO ADVENTURE VEHICLE ADVENTURE
              </motion.p>

              <motion.p
                className="text-xs mb-6"
                style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.55, lineHeight: 1.6 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
              >
                📅 May 14–16 · 📍 Example Meadow, Example Valley, CA · Grand prize + partner experiences
              </motion.p>

              <motion.div
                className="mb-8"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82 }}
              >
                <CountdownTimer
                  targetDate="2026-05-09T06:59:00Z"
                  label="Entries close in"
                  variant="light"
                />
              </motion.div>

              {/* Inline email capture */}
              <motion.form
                onSubmit={handleHeroSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-lg"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
              >
                <input
                  type="email"
                  value={heroEmail}
                  onChange={(e) => setHeroEmail(e.target.value)}
                  required
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 text-sm outline-none"
                  style={{ ...typography.body, backgroundColor: `${COLORS.white}15`, color: COLORS.white, border: `1px solid ${COLORS.dustySky}30`, backdropFilter: 'blur(4px)' }}
                />
                <button
                  type="submit"
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity whitespace-nowrap"
                  style={{ ...typography.button, backgroundColor: COLORS.mustard, color: COLORS.charcoal, fontWeight: 500, letterSpacing: '0.05em' }}
                >
                  Enter Free
                </button>
              </motion.form>

              {/* Legal microcopy — required for sweepstakes / Meta compliance */}
              <motion.div
                className="mt-4 max-w-md space-y-1.5"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
              >
                <p className="text-xs" style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.65, lineHeight: 1.5 }}>
                  No purchase or donation necessary to enter or win. A donation will not increase your chances of winning.
                </p>
                <p className="text-xs" style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.5, lineHeight: 1.5 }}>
                  By entering, you agree to receive emails from Cosmico. You may unsubscribe at any time.
                </p>
                <p className="text-xs" style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.5, lineHeight: 1.5 }}>
                  Open to U.S. residents, 18+. Sweepstakes ends May 8, 2026 at 11:59 PM PT.{" "}
                  <Link to="/giveaway-rules" className="underline hover:opacity-80 transition-opacity" style={{ color: COLORS.mustard }}>
                    Official Rules
                  </Link>
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== HOW IT WORKS — EDITORIAL NUMBERED LIST ===== */}
      <section className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12">
          <motion.div
            className="mb-10 md:mb-12 max-w-xl"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <div className="flex items-center gap-4 mb-4">
              <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '11px' }}>HOW IT WORKS</p>
              <span className="block h-px w-10" style={{ backgroundColor: COLORS.mustard, opacity: 0.6 }} />
            </div>
            <h2 className="text-[1.5rem] sm:text-[1.9rem] md:text-[2.3rem] leading-[1.05] tracking-tight"
              style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}>
              Three steps,<br />one weekend.
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-px"
            style={{ backgroundColor: `${COLORS.boulder}20` }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            {[
              { step: "01", title: "Enter", desc: "Drop your email — everyone gets a free entry, no donation required." },
              { step: "02", title: "Donate (Optional)", desc: `Add a gift if you'd like — 100% supports ${PRODUCER_DISPLAY_NAME}. Donations don't affect your odds.` },
              { step: "03", title: "Win", desc: "VIP weekend tix, on-site stay, sauna ritual, and a Demo Adventure Vehicle for the long way home." },
            ].map((item) => (
              <div key={item.step} className="p-6 md:p-8" style={{ backgroundColor: COLORS.charcoal }}>
                <span
                  className="block text-[1.6rem] md:text-[1.9rem] leading-none mb-4"
                  style={{ ...typography.headline, color: COLORS.clay }}
                >
                  {item.step}
                </span>
                <h3 className="text-base md:text-lg mb-3" style={{ ...typography.subhead, color: COLORS.white, textTransform: 'uppercase' }}>{item.title}</h3>
                <p className="text-sm" style={{ ...typography.body, color: COLORS.boulder, lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== ENTRY FORM (NOW SECTION #2) ===== */}
      <section id="enter" className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 md:px-12">
          
          {isSuccess || submitted ? (
            <motion.div className="text-center py-12" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="text-5xl mb-6">🎉</div>
              <h2 className="text-[1.8rem] sm:text-[2.2rem] leading-[1.1] tracking-tight mb-4"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}>
                You're In.
              </h2>
              <p className="text-base max-w-md mx-auto" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8 }}>
                We'll be in touch. The winner will be selected at random and notified by email after the sweepstakes ends on May 8, 2026.
              </p>

              {/* Promo bridge — consolation 20% off */}
              <motion.div 
                className="mt-8 mx-auto max-w-sm p-6"
                style={{ backgroundColor: COLORS.white, border: `2px solid ${COLORS.mustard}` }}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              >
                <p className="text-xs uppercase mb-2" style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.12em' }}>
                  A little something while you wait
                </p>
                <p className="text-sm mb-4" style={{ ...typography.body, color: COLORS.charcoal, lineHeight: 1.5 }}>
                  Whether you win or not — take <strong>20% off</strong> tickets to Cosmico. Limited time, just for entrants.
                </p>
                <a
                  href="/tickets"
                  className="inline-block px-6 py-3 text-xs uppercase transition-opacity hover:opacity-90"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.clay,
                    color: COLORS.white,
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    textDecoration: 'none',
                  }}
                >
                  Grab Your 20% →
                </a>
                <p className="text-xs mt-3" style={{ color: COLORS.boulder, fontSize: '10px' }}>
                  Code will be sent to your email within a few minutes
                </p>
              </motion.div>

              {/* Social share prompt — turn entrants into a referral channel */}
              <motion.div
                className="mt-8 mx-auto max-w-md p-6"
                style={{ backgroundColor: COLORS.dustySky, border: `1px solid ${COLORS.denim}30` }}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              >
                <p className="text-xs uppercase mb-2" style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.14em' }}>
                  Bring a friend
                </p>
                <p className="text-sm mb-4" style={{ ...typography.body, color: COLORS.charcoal, lineHeight: 1.6 }}>
                  Better with someone you love. Send the giveaway to a friend — winning the weekend together is the whole point.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {(() => {
                    const shareUrl = "https://example.org/win";
                    const shareText = "I just entered to win the full Cosmico weekend in Example Valley — 2 festival passes, on-site glamping, sauna ritual, and a Demo Adventure Vehicle. Free to enter:";
                    const buttons: Array<{ label: string; href: string; bg: string; color: string }> = [
                      { label: "Text", href: `sms:?&body=${encodeURIComponent(shareText + " " + shareUrl)}`, bg: COLORS.forest, color: COLORS.white },
                      { label: "Email", href: `mailto:?subject=${encodeURIComponent("You should enter this — Cosmico giveaway")}&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`, bg: COLORS.charcoal, color: COLORS.white },
                      { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, bg: COLORS.denim, color: COLORS.white },
                      { label: "X / Twitter", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, bg: COLORS.charcoal, color: COLORS.white },
                    ];
                    return buttons.map((b) => (
                      <a
                        key={b.label}
                        href={b.href}
                        target={b.href.startsWith("http") ? "_blank" : undefined}
                        rel={b.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="inline-block px-4 py-2 text-xs uppercase hover:opacity-85 transition-opacity"
                        style={{ ...typography.button, backgroundColor: b.bg, color: b.color, fontWeight: 500, letterSpacing: '0.06em' }}
                      >
                        {b.label}
                      </a>
                    ));
                  })()}
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText("https://example.org/win");
                      toast.success("Link copied to clipboard");
                    }}
                    className="inline-block px-4 py-2 text-xs uppercase hover:opacity-85 transition-opacity"
                    style={{ ...typography.button, backgroundColor: COLORS.mustard, color: COLORS.charcoal, fontWeight: 500, letterSpacing: '0.06em' }}
                  >
                    Copy Link
                  </button>
                </div>
              </motion.div>

              <p className="text-sm mt-6 max-w-md mx-auto" style={{ ...typography.body, color: COLORS.denim, opacity: 0.7, lineHeight: 1.6 }}>
                If you'd like to support this work,{" "}
                <button onClick={() => { setSubmitted(false); setSelectedTier(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="underline hover:opacity-80 transition-opacity" style={{ color: COLORS.clay }}>
                  you can make a donation here
                </button>
                . Donations are completely separate from your entry and do not affect your chances of winning.
              </p>
            </motion.div>
          ) : (
            <>
              <motion.div className="text-center mb-12 md:mb-14" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <div className="flex items-center justify-center gap-4 mb-5">
                  <span className="block h-px w-10" style={{ backgroundColor: COLORS.denim, opacity: 0.5 }} />
                  <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px' }}>
                    {heroSubmitted ? "STEP 2 — FINISH YOUR ENTRY" : "ENTER FOR FREE"}
                  </p>
                  <span className="block h-px w-10" style={{ backgroundColor: COLORS.denim, opacity: 0.5 }} />
                </div>
                <h2 className="text-[1.5rem] sm:text-[2rem] md:text-[2.5rem] leading-[1.05] tracking-tight mb-4"
                  style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}>
                  {heroSubmitted ? (
                    <>You're In.<br />Want Us To Text You<br />If You Win?</>
                  ) : (
                    <>Enter To Win A VIP<br />Weekend At Analog<br />Reunion</>
                  )}
                </h2>
                <p className="text-sm max-w-xl mx-auto" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.72, lineHeight: 1.7 }}>
                  {heroSubmitted
                    ? "Your email is locked in — you're already entered. Add your name and number so we can reach you fast if your name comes up. Winners are notified within 24 hours; text is fastest."
                    : `Free entry. Donations are optional and do not increase your chances of winning. Every gift supports ${PRODUCER_DISPLAY_NAME}.`}
                </p>
                {heroSubmitted && (
                  <div className="inline-flex items-center gap-2 mt-5 px-4 py-2" style={{ backgroundColor: `${COLORS.forest}15` }}>
                    <span style={{ color: COLORS.forest, fontSize: '13px' }}>✓</span>
                    <span style={{ ...typography.caption, color: COLORS.forest, letterSpacing: '0.12em', fontSize: '10px' }}>
                      EMAIL SAVED — {email}
                    </span>
                  </div>
                )}
              </motion.div>

              {/* ===== UNIFIED ENTRY FORM ===== */}
              <motion.form
                onSubmit={handleSubmit}
                className="space-y-4"
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                <div className="p-6 md:p-8" style={{ backgroundColor: COLORS.white }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '10px', letterSpacing: '0.12em' }}>
                        FIRST NAME
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 text-sm outline-none"
                        style={{ ...typography.body, backgroundColor: COLORS.dustySky, color: COLORS.charcoal, border: 'none' }}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '10px', letterSpacing: '0.12em' }}>
                        LAST NAME
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 text-sm outline-none"
                        style={{ ...typography.body, backgroundColor: COLORS.dustySky, color: COLORS.charcoal, border: 'none' }}
                        placeholder="Last name"
                      />
                    </div>
                  </div>

                  {!heroSubmitted && (
                    <div className="mb-4">
                      <label className="block text-xs mb-1.5" style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '10px', letterSpacing: '0.12em' }}>
                        EMAIL *
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 text-sm outline-none"
                        style={{ ...typography.body, backgroundColor: COLORS.dustySky, color: COLORS.charcoal, border: 'none' }}
                        placeholder="your@email.com"
                      />
                    </div>
                  )}

                  <div className="mb-6">
                    <label className="text-xs mb-1.5 flex items-center gap-2" style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '10px', letterSpacing: '0.12em' }}>
                      <span>PHONE NUMBER</span>
                      <span style={{ ...typography.caption, color: COLORS.clay, fontSize: '9px', letterSpacing: '0.14em' }}>
                        · RECOMMENDED
                      </span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 text-sm outline-none"
                      style={{ ...typography.body, backgroundColor: COLORS.dustySky, color: COLORS.charcoal, border: 'none' }}
                      placeholder="(555) 123-4567"
                    />
                    <p className="text-xs mt-2" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.5 }}>
                      Winners are notified within 24 hours — text is fastest.
                    </p>
                  </div>

                  {/* ===== OPTIONAL DONATION ===== */}
                  <div className="pt-6 border-t" style={{ borderColor: `${COLORS.boulder}30` }}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label className="text-xs" style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '10px', letterSpacing: '0.12em' }}>
                        ADD AN OPTIONAL DONATION
                      </label>
                      <span className="text-xs uppercase" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '9px', letterSpacing: '0.14em' }}>
                        OPTIONAL
                      </span>
                    </div>
                    <p className="text-xs mb-4" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.6 }}>
                      100% to {PRODUCER_DISPLAY_NAME}. Donations don't affect your odds — every entrant gets one entry.
                    </p>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[0, 10, 50, 250].map((amt) => {
                        const isActive = donationAmount === amt && customDonation.trim() === "";
                        const label = amt === 0 ? "None" : `$${amt}`;
                        return (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => { setDonationAmount(amt); setCustomDonation(""); }}
                            className="py-3 text-sm transition-all"
                            style={{
                              ...typography.body,
                              backgroundColor: isActive ? COLORS.charcoal : COLORS.dustySky,
                              color: isActive ? COLORS.white : COLORS.charcoal,
                              fontWeight: isActive ? 600 : 400,
                              border: 'none',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative">
                      <span
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                        style={{ ...typography.body, color: COLORS.boulder }}
                      >
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={customDonation}
                        onChange={(e) => { setCustomDonation(e.target.value); setDonationAmount(0); }}
                        className="w-full pl-8 pr-4 py-3 text-sm outline-none"
                        style={{ ...typography.body, backgroundColor: COLORS.dustySky, color: COLORS.charcoal, border: 'none' }}
                        placeholder="Custom amount"
                      />
                    </div>
                  </div>
                </div>

                {/* Summary + submit */}
                {(() => {
                  const customNum = customDonation.trim() === "" ? NaN : Number(customDonation);
                  const finalDollars = !Number.isNaN(customNum) && customNum > 0 ? Math.floor(customNum) : donationAmount;
                  const isPaid = finalDollars >= 1;
                  return (
                    <div className="p-6 flex items-center justify-between gap-4" style={{ backgroundColor: COLORS.charcoal }}>
                      <div>
                        <p className="text-xs" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
                          1 ENTRY{isPaid && ' · OPTIONAL DONATION'}
                        </p>
                        <p className="text-lg" style={{ ...typography.subhead, color: COLORS.white }}>
                          {isPaid ? `$${finalDollars} donation` : 'Free entry'}
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={loading || !email}
                        className="px-6 md:px-8 py-3 text-xs uppercase transition-opacity disabled:opacity-50"
                        style={{
                          ...typography.button,
                          backgroundColor: COLORS.mustard,
                          color: COLORS.charcoal,
                          fontWeight: 500,
                          letterSpacing: '0.05em',
                          opacity: loading ? 0.6 : 1,
                        }}
                      >
                        {loading
                          ? "Processing..."
                          : isPaid
                            ? `Donate $${finalDollars} & Enter`
                            : "Enter Free"}
                      </button>
                    </div>
                  );
                })()}
              </motion.form>

            </>
          )}
        </div>
      </section>

      {/* ===== PRIZE DETAILS ===== */}
      <section className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.white }}>
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12 text-center">
          <motion.div className="flex items-center justify-center gap-4 mb-5" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="block h-px w-10" style={{ backgroundColor: COLORS.denim, opacity: 0.5 }} />
            <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px' }}>
              THE PRIZE
            </p>
            <span className="block h-px w-10" style={{ backgroundColor: COLORS.denim, opacity: 0.5 }} />
          </motion.div>
          <motion.h2
            className="text-[1.75rem] sm:text-[2.2rem] md:text-[2.9rem] leading-[1.02] tracking-tight mb-6"
            style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Win The Whole<br />Weekend
          </motion.h2>

          <motion.p
            className="text-sm max-w-2xl mx-auto mb-6"
            style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, lineHeight: 1.7 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <strong>One (1) winner</strong> gets the full Cosmico weekend, fully dialed: two VIP weekend tix, two nights on-site at Example Meadow, and tent setup included — plus a curated set of partner experiences to round out the trip.
          </motion.p>

          <motion.p
            className="text-xs uppercase max-w-2xl mx-auto mb-10 md:mb-12"
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.14em', lineHeight: 1.7 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            APPROXIMATE RETAIL VALUE (ARV): $473 · 1 WINNER · TRAVEL NOT INCLUDED · VALID FOR COSMICO 2026 (MAY 14–16)
          </motion.p>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 max-w-5xl mx-auto text-left mb-14 md:mb-16"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="md:col-span-5 p-6 md:p-8 flex flex-col justify-between" style={{ backgroundColor: COLORS.charcoal }}>
              <div>
                <p className="text-xs uppercase mb-4" style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.14em' }}>
                  What you actually win
                </p>
                <h3 className="text-[1.7rem] md:text-[2.35rem] leading-[1.02] mb-5" style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}>
                  A weekend<br />worth dressing for.
                </h3>
                <p className="text-sm md:text-[15px] max-w-md" style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.84, lineHeight: 1.8 }}>
                  Not just admission — the full shape of the trip, from where you sleep to how you arrive in each day.
                </p>
              </div>
              <p className="text-xs mt-8" style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.12em' }}>
                VIP · 2 NIGHTS · SETUP · CURATED EXPERIENCES
              </p>
            </div>

            <div className="md:col-span-7 grid grid-cols-1 gap-4 md:gap-5">
              {grandPrizeHighlights.map((item, index) => (
                <div
                  key={item.title}
                  className="grid grid-cols-[auto_1fr] gap-4 md:gap-5 p-5 md:p-6 items-start"
                  style={{ backgroundColor: COLORS.dustySky }}
                >
                  <div className="pt-0.5">
                    <span
                      className="block text-[1.35rem] md:text-[1.6rem] leading-none"
                      style={{ ...typography.headline, color: COLORS.clay, opacity: 0.95 }}
                    >
                      0{index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-2" style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.14em' }}>
                      {item.eyebrow}
                    </p>
                    <h3 className="text-[1.15rem] md:text-[1.4rem] leading-[1.05] mb-2" style={{ ...typography.subhead, color: COLORS.charcoal, textTransform: 'uppercase' }}>
                      {item.title}
                    </h3>
                    <p className="text-sm md:text-[15px] max-w-xl" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, lineHeight: 1.75 }}>
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 max-w-6xl mx-auto text-left mb-14 md:mb-16"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            {prizeStoryCards.map((card, index) => (
              <div
                key={card.title}
                className={index === 0 ? "md:col-span-12" : "md:col-span-6"}
                style={{ backgroundColor: COLORS.dustySky }}
              >
                <div className={`grid ${index === 0 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                  <div className={`relative overflow-hidden ${index === 0 ? "aspect-[4/3] md:aspect-auto md:min-h-[25rem]" : "aspect-[4/3]"}`}>
                    <img
                      src={card.image}
                      alt={card.alt}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${COLORS.charcoal}10 100%)` }} />
                  </div>
                  <div className="p-6 md:p-8 flex flex-col justify-center">
                    <p className="text-xs uppercase mb-3" style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.14em' }}>
                      {card.eyebrow}
                    </p>
                    <h3 className="text-[1.45rem] md:text-[1.9rem] leading-[1.05] mb-4" style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}>
                      {card.title}
                    </h3>
                    <p className="text-sm md:text-[15px]" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.82, lineHeight: 1.8 }}>
                      {card.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div
            className="max-w-2xl mx-auto text-left mb-14 md:mb-16"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <p className="text-xs uppercase mb-4" style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.14em' }}>
              About Cosmico
            </p>
            <p className="text-sm md:text-[15px]" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.8 }}>
              Cosmico is an intimate three-day gathering on the Example River in Example County — built around music, food, wine, nature, and real connection. It’s a boutique weekend designed to feel personal, beautiful, and deeply worth showing up for.
            </p>
          </motion.div>

          <motion.div className="space-y-5 max-w-3xl mx-auto text-left" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            {partnerPrizeDetails.map((partner) => (
              <div key={partner.name} className="p-6 md:p-7" style={{ backgroundColor: COLORS.dustySky }}>
                <p className="text-xs uppercase mb-3" style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.14em' }}>
                  Partner experience
                </p>
                <h3 className="text-[1.25rem] md:text-[1.55rem] mb-3 md:mb-4" style={{ ...typography.subhead, color: COLORS.charcoal }}>
                  {partner.name}
                </h3>
                <p className="text-sm md:text-[15px] mb-4" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.8 }}>
                  {partner.bio}
                </p>
                <p className="text-sm md:text-[15px] mb-3 md:mb-4" style={{ ...typography.body, color: COLORS.charcoal, lineHeight: 1.8 }}>
                  <strong>What’s included:</strong> {partner.offering}
                </p>
                <p className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.72, lineHeight: 1.75 }}>
                  {partner.finePrint}
                </p>
              </div>
            ))}
          </motion.div>

          <motion.p
            className="text-sm max-w-3xl mx-auto mt-10 md:mt-12"
            style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.7, lineHeight: 1.75 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Valid for the 2026 event. Non-transferable. No cash value. Travel not included. Partner experiences are subject to availability, scheduling coordination, and required waivers.
          </motion.p>
        </div>
      </section>

      {/* ===== IMAGE DIVIDER ===== */}
      <section className="relative h-[30vh] md:h-[40vh] overflow-hidden" style={{ backgroundColor: COLORS.clay }}>
        <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.25, mixBlendMode: 'overlay' }} />
        <img src={crewFriendsGolden} alt="Friends at Cosmico" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'grayscale(100%) contrast(1.1) brightness(1.15)', mixBlendMode: 'multiply' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: COLORS.clay, mixBlendMode: 'multiply', opacity: 0.35 }} />
        <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.2 }} />
      </section>

      {/* ===== ABOUT LAUNCH PAD ===== */}
      <section className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.white }}>
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 md:px-12">
          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="flex items-center gap-4 mb-4">
              <p style={{ ...typography.caption, color: COLORS.forest, letterSpacing: '0.15em', fontSize: '11px' }}>
                WHERE YOUR DONATION GOES
              </p>
              <span className="block h-px w-10" style={{ backgroundColor: COLORS.forest, opacity: 0.5 }} />
            </div>
            <h2 className="text-[1.5rem] sm:text-[1.8rem] md:text-[2.2rem] leading-[1.05] tracking-tight mb-6"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}>
              Support {PRODUCER_DISPLAY_NAME}
            </h2>

            <div className="space-y-4 mb-8">
              <p className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
                <strong>{PRODUCER_DISPLAY_NAME}</strong> is the first believer in grassroots community builders — backing 
                culture-driven leaders creating analog infrastructure for reconnection. Founded in 2009 in post-Katrina 
                New Orleans, the foundation has spent over 15 years building presence-based community experiences 
                across the country.
              </p>
              <p className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
                Cosmico is a direct expression of this mission — creating analog experiences that reconnect 
                us to ourselves, our communities, and nature. Every donation goes toward building the kind of 
                real-world gatherings that are disappearing.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-8" style={{ backgroundColor: `${COLORS.boulder}30` }}>
              {[
                { label: "Work Began", value: "2009" },
                { label: "Capital Stewarded", value: "$1.6M+" },
                { label: "Primary Hubs", value: "4 Cities" },
                { label: "Tax Status", value: "501(c)(3)" },
              ].map((stat) => (
                <div key={stat.label} className="px-3 py-5 sm:px-4 md:p-6 text-left" style={{ backgroundColor: COLORS.dustySky }}>
                  <p
                    className="mb-2 whitespace-nowrap"
                    style={{
                      ...typography.headline,
                      color: COLORS.forest,
                      lineHeight: 1,
                      fontSize: 'clamp(1.25rem, 4.2vw, 1.875rem)',
                    }}
                  >
                    {stat.value}
                  </p>
                  <p className="text-xs" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>{stat.label}</p>
                </div>
              ))}
            </div>

          </motion.div>
        </div>
      </section>

      {/* ===== SWEEPSTAKES TERMS (LEGAL / COMPLIANCE) ===== */}
      <section className="relative py-14 md:py-20" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.25} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 md:px-12">
          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="flex items-center gap-4 mb-5">
              <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px' }}>
                THE FINE PRINT
              </p>
              <span className="block h-px w-10" style={{ backgroundColor: COLORS.denim, opacity: 0.5 }} />
            </div>
            <h2 className="text-[1.4rem] sm:text-[1.7rem] md:text-[2rem] leading-[1.05] tracking-tight mb-6"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}>
              Sweepstakes Terms
            </h2>

            <ul className="space-y-3 mb-6">
              {[
                "NO PURCHASE OR DONATION NECESSARY TO ENTER OR WIN.",
                "A purchase or donation will not increase your chances of winning. Free entrants and donating entrants each receive exactly one (1) entry and have identical odds.",
                "FREE METHOD OF ENTRY (AMOE): Submit the free entry form on this page — enter your email, then submit your name. No payment required. This is the official free entry method.",
                "Open to legal residents of the fifty (50) United States and the District of Columbia, age 18 and older. Void where prohibited.",
                "Sweepstakes ends May 8, 2026 at 11:59 PM PT.",
                "One (1) winner will be selected at random and notified via email within 3 days of the close date.",
                "Approximate Retail Value (ARV): $473, comprised of two (2) VIP weekend tix ($99 each = $198) and one (1) night glamping tent stay at Example Meadow ($275). The prize includes a second night of lodging provided at no additional retail value via Example Meadow's buy-one-night-get-one-night promotional offer; the second night carries no independent retail value and is not included in the ARV calculation. Sunhouse Sauna ritual and Demo Adventure Vehicle weekend getaway are courtesy partner experiences with no cash value and are not included in the ARV.",
                "Travel, meals, and incidentals not included. Winner is responsible for any applicable taxes.",
                `Sponsored by ${PRODUCER_DISPLAY_NAME}. Void where prohibited.`,
              ].map((line) => (
                <li
                  key={line}
                  className="text-sm flex gap-3"
                  style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.65 }}
                >
                  <span style={{ color: COLORS.clay }}>·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="p-5 mb-6" style={{ backgroundColor: COLORS.white }}>
              <p className="text-xs" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, lineHeight: 1.7 }}>
                This promotion is in no way sponsored, endorsed, administered by, or associated with Facebook, Instagram, or Meta Platforms, Inc.
              </p>
            </div>

            <Link
              to="/giveaway-rules"
              className="inline-block text-sm underline hover:opacity-80 transition-opacity"
              style={{ ...typography.body, color: COLORS.denim }}
            >
              Read the Official Sweepstakes Rules →
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ===== GET TICKETS (DON'T WAIT TO WIN) ===== */}
      <section className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.mustard }}>
        <FilmGrainOverlay opacity={0.35} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 md:px-12 text-center">
          <motion.div className="flex items-center justify-center gap-4 mb-5" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="block h-px w-10" style={{ backgroundColor: COLORS.charcoal, opacity: 0.5 }} />
            <p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.15em', fontSize: '11px' }}>
              DON'T WAIT TO WIN
            </p>
            <span className="block h-px w-10" style={{ backgroundColor: COLORS.charcoal, opacity: 0.5 }} />
          </motion.div>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.4rem] md:text-[3rem] leading-[1.02] tracking-tight mb-5"
            style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Lock In Your Spot
          </motion.h2>
          <motion.p
            className="text-base md:text-lg mb-8 max-w-xl mx-auto"
            style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Only 700 spots. The weekend is filling in. If you already know you're coming, grab tickets now — your entry into the giveaway still stands either way.
          </motion.p>
          <motion.p
            className="text-base md:text-lg mb-8 max-w-md mx-auto text-balance"
            style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.7, lineHeight: 1.7, fontStyle: 'italic' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Already have tickets? They're transferable — gift them to a friend and upgrade to VIP if you win.
          </motion.p>
          <motion.a
            href="/tickets"
            className="inline-block px-10 py-4 text-sm uppercase hover:opacity-85 transition-opacity"
            style={{ ...typography.button, backgroundColor: COLORS.charcoal, color: COLORS.mustard, fontWeight: 500, letterSpacing: '0.08em' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Get Tickets →
          </motion.a>
          <motion.p
            className="text-xs mt-5"
            style={{ ...typography.caption, color: COLORS.charcoal, opacity: 0.7, letterSpacing: '0.1em' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            MAY 14–16 · EXAMPLE MEADOW · EXAMPLE VALLEY, CA
          </motion.p>
        </div>
      </section>


      <section className="relative py-16 md:py-20" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 text-center px-6 max-w-2xl mx-auto">
          <motion.div className="flex items-center justify-center gap-4 mb-5" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="block h-px w-10" style={{ backgroundColor: COLORS.mustard, opacity: 0.6 }} />
            <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '11px' }}>
              ONE LAST THING
            </p>
            <span className="block h-px w-10" style={{ backgroundColor: COLORS.mustard, opacity: 0.6 }} />
          </motion.div>
          <motion.h2
            className="text-[1.6rem] sm:text-[2.1rem] md:text-[2.6rem] leading-[1.05] tracking-tight mb-5"
            style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Your Move.
          </motion.h2>
          <motion.p
            className="text-sm md:text-base mb-8 max-w-md mx-auto"
            style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.85, lineHeight: 1.7 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            The weekend is set. The seat is open. All it takes is your email.
          </motion.p>
          <motion.button
            onClick={scrollToForm}
            className="inline-block px-8 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
            style={{ ...typography.button, backgroundColor: COLORS.mustard, color: COLORS.charcoal, fontWeight: 500, letterSpacing: '0.05em' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Enter Now
          </motion.button>
        </div>
      </section>

      {/* ===== STICKY MOBILE CTA ===== */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-center justify-between overflow-hidden"
        style={{ backgroundColor: COLORS.charcoal, borderTop: `2px solid ${COLORS.mustard}` }}
      >
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 p-3 flex-1">
          <p className="text-xs" style={{ ...typography.subhead, color: COLORS.white }}>Win A VIP Weekend</p>
          <p className="text-xs" style={{ ...typography.body, color: COLORS.boulder, fontSize: '10px' }}>Free entry — win the full weekend</p>
        </div>
        <button
          onClick={scrollToForm}
          className="relative z-10 px-5 py-2.5 text-xs uppercase m-3"
          style={{ ...typography.button, backgroundColor: COLORS.mustard, color: COLORS.charcoal, fontWeight: 500, letterSpacing: '0.05em' }}
        >
          Enter Now
        </button>
      </div>

      {/* Bottom padding for sticky bar on mobile */}
      <div className="h-16 md:hidden" />

      <MayFooter />
    </div>
  );
};

export default MayWin;
