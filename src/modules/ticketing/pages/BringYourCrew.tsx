import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, staggerContainer, slideInLeft, slideInRight } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Users, DollarSign, CheckCircle, Send, UserPlus } from "lucide-react";
import CrewBidForm from "@/components/may/crew/CrewBidForm";
import CrewCounter from "@/components/may/crew/CrewCounter";

import heroImg from "@/assets/may/crew-stage-crowd.webp";
import gatheringImg from "@/assets/may/crew-gathering-meadow.webp";
import dancingImg from "@/assets/may/crew-dancing-night.webp";
import denimImg from "@/assets/may/crew-denim-friends.webp";
import friendsImg from "@/assets/may/crew-friends-golden.webp";

const PRICING_GUIDANCE = [
  { label: "2-Day GA", retail: 215, low: 170, high: 200 },
  { label: "Saturday GA", retail: 159, low: 120, high: 150 },
  { label: "Friday GA", retail: 99, low: 80, high: 95 },
];

const STEPS = [
  { icon: Users, title: "Gather Your Crew", desc: "Round up 4–10 friends who are in." },
  { icon: DollarSign, title: "Name Your Price", desc: "Submit one bid per ticket. No resubmissions." },
  { icon: CheckCircle, title: "We Review Bids", desc: "Crew size and price both matter." },
  { icon: Send, title: "24 Hours to Buy", desc: "Accepted crews get a checkout link — valid for 24 hours only." },
  { icon: UserPlus, title: "Assign Tickets", desc: "Captain assigns each ticket by name and email." },
];

const CtaButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className="px-8 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
    style={{
      ...typography.button,
      backgroundColor: COLORS.clay,
      color: COLORS.white,
      borderRadius: 0,
      fontWeight: 500,
      letterSpacing: '0.05em',
    }}
  >
    {label}
  </button>
);


const BringYourCrew = () => {
  const formRef = useRef<HTMLDivElement>(null);
  useCanonicalUrl('/bringyourcrew');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Bring Your Crew",
      item_category: "Festival",
      price: 215,
    });
  }, []);
  usePageMeta({
    title: "Bring Your Crew — Cosmico",
    description: "Gather 4–10 friends, name your price, and lock in group tickets. Limited spots — when they're gone, they're gone.",
    ogImage: "https://example.org/og-crew.jpg",
    ogUrl: "https://example.org/bringyourcrew",
  });

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="Friends gathering at Cosmico" className="w-full h-full object-cover object-[center_30%]" style={{ filter: 'grayscale(100%) contrast(1.1) brightness(0.9)' }} />
          <div className="absolute inset-0" style={{ backgroundColor: COLORS.deepWater, mixBlendMode: 'multiply', opacity: 0.7 }} />
          <FilmGrainOverlay opacity={0.5} />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-6 py-32 text-center">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.p variants={fadeInUp} className="mb-5" style={{ ...typography.caption, color: COLORS.mustard, fontSize: '13px' }}>
              YOU FOUND IT 🥚
            </motion.p>
            <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl lg:text-8xl mb-8" style={{ ...typography.headline, color: COLORS.white }}>
              Bring Your Crew
            </motion.h1>

            <motion.div variants={fadeInUp} className="max-w-xl mx-auto mb-10" style={{ ...typography.body, color: COLORS.white }}>
              <p className="text-lg md:text-xl mb-5" style={{ opacity: 0.95, lineHeight: 1.6 }}>
                Not everyone sees this page — but you did.
              </p>
              <p className="mb-4" style={{ opacity: 0.85, lineHeight: 1.6 }}>
                Gather 4–10 friends, name your price per ticket, and if we accept your bid, your whole crew is in.
              </p>
              <p className="mb-4 text-sm" style={{ opacity: 0.8, lineHeight: 1.6 }}>
                ⚡ Accepted crews have <strong>24 hours</strong> to complete their purchase. Be ready to buy.
              </p>
              <p className="text-sm mb-6" style={{ opacity: 0.7, lineHeight: 1.5 }}>
                You get one shot — bids cannot be resubmitted.
              </p>
              <p className="text-lg italic" style={{ color: COLORS.clay, lineHeight: 1.5 }}>
                Who are the friends you've been telling about Analog?
              </p>
            </motion.div>

            <motion.div variants={fadeInUp} className="mb-10">
              <CrewCounter />
            </motion.div>

            <motion.div variants={fadeInUp} className="flex flex-col items-center gap-3">
              <CtaButton onClick={scrollToForm} label="Submit a Crew Bid" />
              <p className="text-xs" style={{ ...typography.body, color: COLORS.boulder }}>
                Crews of 4–10 · One bid per crew · 24hr checkout window
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>


      {/* ═══════════════ WHY BRING YOUR CREW — SPLIT PANEL ═══════════════ */}
      <section className="relative">
        <div className="grid grid-cols-1 md:grid-cols-5 min-h-[500px]">
          {/* Text panel — 2/5 */}
          <motion.div
            className="relative md:col-span-2 flex items-center"
            style={{ backgroundColor: COLORS.denim }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 px-8 md:px-12 py-16 md:py-20">
              <motion.p variants={slideInLeft} className="mb-3" style={{ ...typography.caption, color: COLORS.mustard }}>
                THE MISSION
              </motion.p>
              <motion.h2 variants={slideInLeft} className="text-3xl md:text-4xl mb-8" style={{ ...typography.headline, color: COLORS.white }}>
                Why Bring Your Crew?
              </motion.h2>
              <motion.div variants={slideInLeft} className="space-y-5" style={{ ...typography.body, color: COLORS.white, lineHeight: 1.7 }}>
                <p style={{ opacity: 0.9 }}>
                  Cosmico exists because of the people who return every year.
                </p>
                <p style={{ opacity: 0.9 }}>
                  If each person brings one new friend into the circle, the reunion becomes sustainable and the community grows.
                </p>
                <p style={{ opacity: 0.85 }}>
                  Bring the people you've been telling about.
                </p>
                <p className="text-lg pt-2" style={{ color: COLORS.mustard, ...typography.subhead }}>
                  This is your moment.
                </p>
              </motion.div>
            </div>
          </motion.div>

          {/* Image panel — 3/5 */}
          <motion.div
            className="relative md:col-span-3 min-h-[350px] md:min-h-0"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={slideInRight}
          >
            <img
              src={gatheringImg}
              alt="Friends gathering at Cosmico"
              className="absolute inset-0 w-full h-full object-cover object-[center_25%]"
            />
            <FilmGrainOverlay opacity={0.5} />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS — FULL WIDTH ═══════════════ */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer}>
            <motion.p variants={fadeInUp} className="text-center mb-3" style={{ ...typography.caption, color: COLORS.mustard }}>
              HOW IT WORKS
            </motion.p>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl text-center mb-16" style={{ ...typography.headline, color: COLORS.white }}>
              How Crew Bids Work
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
              {STEPS.map((step, i) => (
                <motion.div key={i} variants={fadeInUp} className="text-center">
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: COLORS.deepWater }}>
                    <step.icon size={28} color={COLORS.mustard} />
                  </div>
                  <div className="w-8 h-8 rounded-full mx-auto mb-3 flex items-center justify-center text-sm font-bold" style={{ backgroundColor: COLORS.clay, color: COLORS.white, ...typography.button }}>
                    {i + 1}
                  </div>
                  <h3 className="text-base mb-2" style={{ ...typography.subhead, color: COLORS.white }}>{step.title}</h3>
                  <p className="text-sm" style={{ ...typography.body, color: COLORS.boulder }}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ TICKET ASSIGNMENT — SPLIT PANEL (reversed) ═══════════════ */}
      <section className="relative">
        <div className="grid grid-cols-1 md:grid-cols-5 min-h-[500px]">
          {/* Image panel — 3/5 */}
          <motion.div
            className="relative md:col-span-3 min-h-[350px] md:min-h-0 order-2 md:order-1"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={slideInLeft}
          >
            <img
              src={dancingImg}
              alt="Friends enjoying Cosmico"
              className="absolute inset-0 w-full h-full object-cover object-[center_20%]"
            />
            <FilmGrainOverlay opacity={0.5} />
          </motion.div>

          {/* Text panel — 2/5 */}
          <motion.div
            className="relative md:col-span-2 flex items-center order-1 md:order-2"
            style={{ backgroundColor: COLORS.forest }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 px-8 md:px-12 py-16 md:py-20">
              <motion.p variants={slideInRight} className="mb-3" style={{ ...typography.caption, color: COLORS.sage }}>
                AFTER ACCEPTANCE
              </motion.p>
              <motion.h2 variants={slideInRight} className="text-3xl md:text-4xl mb-6" style={{ ...typography.headline, color: COLORS.white }}>
                Ticket Assignment
              </motion.h2>
              <motion.div variants={slideInRight} style={{ ...typography.body, color: COLORS.white, lineHeight: 1.7 }}>
                <ul className="space-y-4">
                  <li style={{ opacity: 0.9 }}>The Crew Captain completes the purchase for the full group.</li>
                  <li style={{ opacity: 0.9 }}>After purchase, assign each ticket by entering the attendee's name and email.</li>
                  <li style={{ opacity: 0.9 }}>Each person receives their own ticket and can arrive independently.</li>
                  <li style={{ opacity: 0.85 }}>Tickets are transferable and can be reassigned if plans change.</li>
                </ul>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ PRICING GUIDANCE — FULL WIDTH ═══════════════ */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.denim }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer}>
            <motion.p variants={fadeInUp} className="text-center mb-3" style={{ ...typography.caption, color: COLORS.mustard }}>
              PRICING GUIDANCE
            </motion.p>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl text-center mb-12" style={{ ...typography.headline, color: COLORS.white }}>
              Typical Accepted Bids
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {PRICING_GUIDANCE.map((tier, i) => (
                <motion.div key={i} variants={fadeInUp} className="p-6 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
                  <p className="text-sm mb-1" style={{ ...typography.caption, color: COLORS.boulder }}>{tier.label}</p>
                  <p className="text-base mb-3" style={{ ...typography.body, color: COLORS.white, opacity: 0.6 }}>Retail ${tier.retail}</p>
                  <p className="text-2xl" style={{ ...typography.headline, color: COLORS.mustard }}>
                    ${tier.low}–${tier.high}
                  </p>
                  <p className="text-xs mt-2" style={{ ...typography.body, color: COLORS.boulder }}>Typical accepted range</p>
                </motion.div>
              ))}
            </div>

            <motion.p variants={fadeInUp} className="text-center text-sm mb-10" style={{ ...typography.body, color: COLORS.sage }}>
              Larger crews have a higher chance of acceptance.
            </motion.p>

            <motion.div variants={fadeInUp} className="text-center">
              <CtaButton onClick={scrollToForm} label="Submit Your Crew Bid" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ LIMITED AVAILABILITY — SPLIT PANEL ═══════════════ */}
      <section className="relative">
        <div className="grid grid-cols-1 md:grid-cols-5 min-h-[400px]">
          {/* Text panel — 2/5 */}
          <motion.div
            className="relative md:col-span-2 flex items-center"
            style={{ backgroundColor: COLORS.charcoal }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <FilmGrainOverlay opacity={0.4} />
            <div className="relative z-10 px-8 md:px-12 py-16 md:py-20 text-center md:text-left">
              <motion.p variants={slideInLeft} className="mb-4" style={{ ...typography.caption, color: COLORS.clay }}>
                LIMITED AVAILABILITY
              </motion.p>
              <motion.h2 variants={slideInLeft} className="text-3xl md:text-4xl mb-6" style={{ ...typography.headline, color: COLORS.white }}>
                When They're Gone, They're Gone
              </motion.h2>
              <motion.div variants={slideInLeft} className="space-y-4 mb-6" style={{ ...typography.body, color: COLORS.white, lineHeight: 1.7 }}>
                <p style={{ opacity: 0.9 }}>
                   We accept a limited number of crew bids on a rolling basis. Once spots are filled, they're gone.
                 </p>
                 <p style={{ opacity: 0.85 }}>
                   Accepted crews receive a checkout link valid for <strong>24 hours</strong>. Have your crew ready to commit.
                 </p>
                 <p style={{ opacity: 0.8 }}>
                   Bids cannot be resubmitted — make it count.
                 </p>
              </motion.div>
              <motion.p variants={slideInLeft} className="text-sm font-medium" style={{ ...typography.body, color: COLORS.mustard }}>
                Submit your bid now — don't wait.
              </motion.p>
            </div>
          </motion.div>

          {/* Image panel — 3/5 */}
          <motion.div
            className="relative md:col-span-3 min-h-[300px] md:min-h-0"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={slideInRight}
          >
            <img
              src={denimImg}
              alt="Friends walking at Cosmico"
              className="absolute inset-0 w-full h-full object-cover object-[center_20%]"
            />
            <FilmGrainOverlay opacity={0.5} />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ REAL TALK ═══════════════ */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer} className="text-center">
            <motion.p variants={fadeInUp} className="mb-3" style={{ ...typography.caption, color: COLORS.sage }}>
              REAL TALK
            </motion.p>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl mb-10" style={{ ...typography.headline, color: COLORS.white }}>
              We Want Ya There —<br />So Shoot Your Shot
            </motion.h2>

            <motion.div variants={fadeInUp} className="space-y-5 mb-10" style={{ ...typography.body, color: COLORS.white, lineHeight: 1.8 }}>
              <p className="text-lg" style={{ opacity: 0.95 }}>
                We know tickets are expensive. It's also expensive to throw a festival — and we're working every year toward making this thing sustainable.
              </p>
              <p style={{ opacity: 0.9 }}>
                You help us when you bring friends. More people in the circle means Analog keeps going. So help us, and we'll help you. Submit a crew bid below and tell us why you want to be there.
              </p>
              <p style={{ opacity: 0.9 }}>
                Another way in — <a href="/get-involved" style={{ color: COLORS.mustard, textDecoration: 'underline', textUnderlineOffset: '3px' }}>check out volunteer opportunities</a>. Help out and you're in.
              </p>
              <p className="text-lg pt-2 italic" style={{ color: COLORS.mustard }}>
                We want you there. For real.
              </p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <CtaButton onClick={scrollToForm} label="Submit Your Crew Bid" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FORM ═══════════════ */}
      <section ref={formRef} className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6">
          <CrewBidForm />
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default BringYourCrew;
