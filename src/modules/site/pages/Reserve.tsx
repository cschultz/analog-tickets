import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll } from "framer-motion";
import { ArrowRight } from "lucide-react";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, staggerContainer, heavyGrain, halftonePatternDense } from "@/styles/may-theme";

import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { useUTMCapture } from "@/hooks/useUTMTracking";
import { useExitIntent } from "@/hooks/useExitIntent";
import { ExitIntentPopup } from "@/components/may/ExitIntentPopup";

import { useHighIntentDetection } from "@/hooks/useHighIntentDetection";
import { useIdleHesitation } from "@/hooks/useIdleHesitation";
import { useScrollDepthTrigger } from "@/hooks/useScrollDepthTrigger";
import { SocialProofTicker } from "@/components/may/SocialProofTicker";

// Images — real event photos only
import crewGatheringMeadow from "@/assets/may/crew-gathering-meadow.webp";
import crewFriendsGolden from "@/assets/may/crew-friends-golden.webp";
import coupleStage from "@/assets/may/couple-stage-sunbeam.webp";
import wineSmile from "@/assets/wine.webp";
import walkingGolden from "@/assets/walking.webp";
import palsHero from "@/assets/may/3_pals_blank_45.webp";
import crowdGolden from "@/assets/may/crowd-golden.webp";
import dockHangout from "@/assets/may/dock-hangout-river.webp";
import crewDancingNight from "@/assets/may/crew-dancing-night.webp";
import handsRaisedBokeh from "@/assets/may/hands-raised-bokeh.webp";
import analogLogo from "@/assets/analog-wordmark-black.webp";



// ===== HELPER: hex to 0-1 RGB =====
const hexToRgb01 = (hex: string) => {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
};

// ===== TRUE DUOTONE PANEL (SVG filter — shadows/highlights mapped) =====
let duotoneIdCounter = 0;
const TrueDuotonePanel = ({
  image, alt, shadowColor, highlightColor, className = "", objectPosition = "center center",
  contrast = 1.15, brightness = 1.0,
}: {
  image: string; alt: string; shadowColor: string; highlightColor: string;
  className?: string; objectPosition?: string; contrast?: number; brightness?: number;
}) => {
  const id = `duotone-${++duotoneIdCounter}`;
  const s = hexToRgb01(shadowColor);
  const h = hexToRgb01(highlightColor);

  return (
    <motion.div
      className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`}
      style={{ backgroundColor: shadowColor }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      {/* SVG filter for true duotone color mapping */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues={`${s.r} ${h.r}`} />
              <feFuncG type="table" tableValues={`${s.g} ${h.g}`} />
              <feFuncB type="table" tableValues={`${s.b} ${h.b}`} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      <img
        src={image}
        alt={alt}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: `url(#${id}) contrast(${contrast}) brightness(${brightness})`,
          objectPosition,
        }}
      />

      {/* Subtle grain for texture */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.15, mixBlendMode: 'overlay' }} />
      <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.12 }} />
    </motion.div>
  );
};

// ===== LEGACY DUOTONE (simple overlay — kept for fallback) =====
const DuotonePanel = ({
  image, alt, color, secondaryColor = COLORS.denim, className = "", objectPosition = "center center",
  intensity = 1,
}: {
  image: string; alt: string; color: string; secondaryColor?: string; className?: string; objectPosition?: string;
  intensity?: number;
}) => (
  <motion.div
    className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`}
    style={{ backgroundColor: color }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8 }}
  >
    <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.2 * intensity, mixBlendMode: 'overlay' }} />
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ filter: `grayscale(${100 * intensity}%) contrast(1.05) brightness(${1.25 + (1 - intensity) * 0.1})`, mixBlendMode: intensity > 0.3 ? 'multiply' : 'normal', objectPosition }} />
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, mixBlendMode: 'multiply', opacity: 0.35 * intensity }} />
    <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(180deg, ${secondaryColor}20 0%, transparent 50%, ${color}15 100%)`, mixBlendMode: 'overlay', opacity: intensity }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.2 * intensity }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ ...heavyGrain, opacity: 0.2 * intensity }} />
  </motion.div>
);

// ===== FULL COLOR IMAGE PANEL =====
const FullColorPanel = ({
  image, alt, className = "", objectPosition = "center center", brightnessBoost = 0
}: {
  image: string; alt: string; className?: string; objectPosition?: string; brightnessBoost?: number;
}) => (
  <motion.div
    className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8 }}
  >
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ filter: brightnessBoost ? `brightness(${1 + brightnessBoost}) contrast(1.05)` : 'contrast(1.05)', objectPosition }} />
    {/* Very subtle grain for brand consistency */}
    <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.12, mixBlendMode: 'overlay' }} />
  </motion.div>
);

// ===== TYPOGRAPHY PANEL (from site pattern) =====
const TypographyPanel = ({
  children, bgColor, className = ""
}: {
  children: React.ReactNode; bgColor: string; className?: string;
}) => (
  <motion.div
    className={`relative min-h-[50vh] md:min-h-screen flex flex-col justify-center p-8 md:p-12 lg:p-16 ${className}`}
    style={{ backgroundColor: bgColor }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8, delay: 0.1 }}
  >
    <FilmGrainOverlay opacity={0.5} />
    <div className="relative z-10 flex-1 flex flex-col justify-center py-8 md:py-12">
      {children}
    </div>
  </motion.div>
);

const Reserve = () => {
  useCanonicalUrl("/reserve");
  useUTMCapture();
  const { scrollY } = useScroll();
  const [showSticky, setShowSticky] = useState(false);

  // Unified promo popup state — all triggers funnel here
  const [showExitIntent, setShowExitIntent] = useState(false);
  
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Show again after 90s if they only opened-then-dismissed without claiming.
  // This rescues users whose form was accidentally closed mid-typing.
  const shouldShowPromo = useCallback(() => {
    if (showExitIntent) return false;
    if (sessionStorage.getItem("cosmico_hi_promo_claimed")) return false;
    const lastShown = Number(sessionStorage.getItem("cosmico_hi_promo_last_shown") || 0);
    if (lastShown && Date.now() - lastShown < 90_000) return false;
    return true;
  }, [showExitIntent]);

  const showPromoPopup = useCallback(() => {
    if (shouldShowPromo()) {
      sessionStorage.setItem("cosmico_hi_promo_last_shown", String(Date.now()));
      setShowExitIntent(true);
    }
  }, [shouldShowPromo]);

  // Desktop: exit-intent (mouse leaves top)
  useHighIntentDetection(showPromoPopup, { enabled: true });
  useExitIntent(showPromoPopup, { enabled: true, sessionKey: "exit_intent_reserve" });

  // Idle hesitation: 45s mobile, 90s desktop
  useIdleHesitation(showPromoPopup, { enabled: true, idleMs: isMobile ? 45_000 : 90_000 });

  // Scroll depth trigger
  useScrollDepthTrigger(showPromoPopup, { enabled: true, depthPercent: 65 });

  // Mobile: visibility change (tab/app switch)
  useEffect(() => {
    if (!isMobile) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!sessionStorage.getItem("cosmico_hi_promo_shown")) {
          sessionStorage.setItem("cosmico_mobile_intent", "1");
        }
      } else if (document.visibilityState === "visible") {
        if (sessionStorage.getItem("cosmico_mobile_intent")) {
          sessionStorage.removeItem("cosmico_mobile_intent");
          showPromoPopup();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isMobile, showPromoPopup]);

  // Mobile: timed popup after 30s
  useEffect(() => {
    if (!isMobile) return;
    if (sessionStorage.getItem("cosmico_hi_promo_shown")) return;
    const timer = setTimeout(() => showPromoPopup(), 30_000);
    return () => clearTimeout(timer);
  }, [isMobile, showPromoPopup]);

  return (
    <>
      <div className="min-h-screen relative" style={{ backgroundColor: COLORS.dustySky }}>

        {/* Minimal Header */}
        <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(238,241,255,0.92)" }}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link to="/">
              <img src={analogLogo} alt="Cosmico" className="h-6 md:h-7" />
            </Link>
            <Link
              to="/tickets"
              className="px-5 py-2.5 text-sm transition-all hover:opacity-90"
              style={{
                ...typography.button,
                backgroundColor: COLORS.charcoal,
                color: COLORS.white,
              }}
            >
              Reserve Your Spot
            </Link>
          </div>
        </header>

        {/* Social Proof Ticker */}
        <SocialProofTicker />

        {/* ===== SECTION 1: HERO — Split Panel ===== */}
        <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
          <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
            {/* Left: Typography */}
            <TypographyPanel bgColor={COLORS.charcoal}>
              <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
                <motion.p
                  variants={fadeInUp}
                  className="mb-6"
                  style={{ ...typography.caption, color: COLORS.clay }}
                >
                  MAY 14–16 · EXAMPLE COUNTY
                </motion.p>

                <motion.h1
                  variants={fadeInUp}
                  className="text-[2.5rem] sm:text-[3rem] md:text-[3.5rem] lg:text-[4.5rem] leading-[1.05] mb-6"
                  style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
                >
                  YOU ALREADY
                  <br />
                  KNOW YOU
                  <br />
                  WANT IN.
                </motion.h1>

                {/* Event identity line */}
                <motion.div variants={fadeInUp} className="mb-6">
                  <p
                    className="text-sm mb-1"
                    style={{ ...typography.caption, color: COLORS.clay }}
                  >
                    COSMICO
                  </p>
                  <p
                    className="text-sm mb-1"
                    style={{ ...typography.body, color: 'rgba(255,255,255,0.7)' }}
                  >
                    May 14–16 · Example County
                  </p>
                  <p
                    className="text-xs"
                    style={{ ...typography.body, color: COLORS.boulder }}
                  >
                    You might remember it as Cosmico.
                  </p>
                </motion.div>

                {/* Pricing line — prices visually dominant */}
                <motion.div
                  variants={fadeInUp}
                  className="mb-3"
                >
                  <p
                    className="text-base md:text-lg"
                    style={{ ...typography.body, color: COLORS.white }}
                  >
                    <span style={{ color: COLORS.white }}>Weekend passes from $120 today.</span>
                    <span style={{ color: COLORS.boulder }}> Saturday from $85. With payment plan.</span>
                  </p>
                  <p
                    className="text-sm mt-1"
                    style={{ ...typography.body, color: 'rgba(255,255,255,0.7)' }}
                  >
                    Three days of music, nature, and real connection.
                  </p>
                </motion.div>

                <motion.div variants={fadeInUp} className="mb-8" />

                <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/tickets"
                    className="px-8 py-4 text-base transition-all hover:opacity-90 inline-flex items-center justify-center gap-2"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.white,
                    }}
                  >
                    Reserve Your Spot
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="#experience"
                    className="px-8 py-4 text-base transition-all hover:opacity-80 inline-flex items-center justify-center"
                    style={{
                      ...typography.button,
                      backgroundColor: "transparent",
                      color: COLORS.boulder,
                      border: `1px solid rgba(174,189,197,0.3)`,
                    }}
                  >
                    See what it feels like ↓
                  </a>
                </motion.div>

                {/* CTA microcopy */}
                <motion.p
                  variants={fadeInUp}
                  className="mt-4 text-xs"
                  style={{ ...typography.body, color: COLORS.boulder }}
                >
                  Payment plans available. Reserve now with a low deposit.
                </motion.p>
              </motion.div>
            </TypographyPanel>

            {/* Right: Hero image — softened, warm, natural */}
            <motion.div
              className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <img
                src={palsHero}
                alt="Friends enjoying the festival together"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: 'contrast(0.93) brightness(1.02) saturate(1.08)',
                  objectPosition: 'center center',
                }}
              />
              {/* Warm tint overlay */}
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(233, 131, 94, 0.06)' }} />
              <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.1, mixBlendMode: 'overlay' }} />
            </motion.div>
          </div>
        </section>

        {/* ===== SECTION 2: PAYMENT PLAN — Split Panel ===== */}
        <section className="relative min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
          <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
            {/* Left: FULL COLOR — warm and approachable */}
            <FullColorPanel
              image={wineSmile}
              alt="Woman smiling with wine glass at the gathering"
              className="order-2 md:order-1"
              objectPosition="center 30%"
              brightnessBoost={0.03}
            />

            {/* Right: Payment Plan Content */}
            <TypographyPanel bgColor={COLORS.dustySky} className="order-1 md:order-2">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                <motion.p
                  variants={fadeInUp}
                  className="mb-4"
                  style={{ ...typography.caption, color: COLORS.clay }}
                >
                  SPLIT YOUR TICKET
                </motion.p>

                <motion.h2
                  variants={fadeInUp}
                  className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] mb-6"
                  style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                >
                  START NOW.
                  <br />
                  FIGURE OUT
                  <br />
                  THE REST
                  <br />
                  LATER.
                </motion.h2>

                <motion.p
                  variants={fadeInUp}
                  className="text-base mb-8 max-w-sm"
                  style={{ ...typography.body, color: COLORS.boulder }}
                >
                  Reserve your spot now and split your order into simple payments. No stress. No scrambling later.
                </motion.p>

                {/* Payment schedule — scannable, price-dominant */}
                <motion.div variants={fadeInUp} className="mb-8 max-w-sm">
                  <div className="w-12 mb-5" style={{ borderTop: `1px solid rgba(47,47,47,0.2)` }} />

                  <div className="mb-6">
                    <p className="mb-3" style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "18px" }}>
                      GA Weekend
                    </p>
                    <div className="flex gap-6 items-end">
                      <div>
                        <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "28px", fontWeight: 700 }}>$120</p>
                        <p style={{ ...typography.body, color: COLORS.clay, fontSize: "12px", fontWeight: 600 }}>today</p>
                      </div>
                      <div>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "15px" }}>$119</p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}>May 1</p>
                      </div>
                    </div>
                    <p className="mt-2" style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}>2 payments with payment plan</p>
                  </div>

                  {/* GA Saturday — secondary */}
                  <div className="mb-5">
                    <p className="mb-3" style={{ ...typography.subhead, color: COLORS.boulder, fontSize: "16px" }}>
                      GA Saturday
                    </p>
                    <div className="flex gap-6 items-end">
                      <div>
                        <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "24px", fontWeight: 700 }}>$85</p>
                        <p style={{ ...typography.body, color: COLORS.clay, fontSize: "12px", fontWeight: 600 }}>today</p>
                      </div>
                      <div>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "14px" }}>$84</p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}>May 1</p>
                      </div>
                    </div>
                    <p className="mt-2" style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}>2 payments with payment plan</p>
                  </div>

                  <div className="w-12 mt-5 mb-5" style={{ borderTop: `1px solid rgba(47,47,47,0.2)` }} />

                  <p className="text-[13px] mb-3" style={{ ...typography.body, color: COLORS.charcoal, fontWeight: 600 }}>
                    Lock in your spot before the next price increase.
                  </p>
                  <p className="text-[12px] leading-relaxed" style={{ ...typography.body, color: COLORS.boulder }}>
                    A low deposit locks in your spot.
                    <br />
                    Payment plans available.
                  </p>
                </motion.div>

                {/* VIP subtle mention */}
                <motion.p
                  variants={fadeInUp}
                  className="text-[12px] mb-8 max-w-sm"
                  style={{ ...typography.body, color: COLORS.boulder }}
                >
                  VIP and upgraded experiences available
                </motion.p>

                <motion.div variants={fadeInUp}>
                  <Link
                    to="/tickets"
                    className="inline-flex items-center gap-2 px-7 py-3.5 text-sm transition-all hover:opacity-90"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.charcoal,
                      color: COLORS.white,
                    }}
                  >
                    Start Your Reservation
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </motion.div>
            </TypographyPanel>
          </div>
        </section>

        {/* ===== SECTION 3: TESTIMONIAL — GILLIGAN MOSS — Full Color ===== */}
        <section className="relative min-h-[70vh] md:min-h-screen overflow-hidden">
          {/* FULL COLOR background — real memory, high energy */}
          <img
            src={crewGatheringMeadow}
            alt="Crowd dancing to Gilligan Moss in the meadow"
            className="absolute inset-0 w-full h-full object-cover object-[center_50%]"
            loading="lazy"
            style={{ filter: 'brightness(1.08) contrast(1.05) saturate(1.05)' }}
          />
          {/* Lighter scrim for more visible faces */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.25) 100%)' }} />
          {/* Very light grain for brand consistency */}
          <div className="absolute inset-0 pointer-events-none z-[2]" style={{ ...heavyGrain, opacity: 0.1, mixBlendMode: 'overlay' }} />

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
            className="relative z-10 max-w-2xl mx-auto px-5 flex flex-col justify-end items-center text-center min-h-[70vh] md:min-h-screen pt-[45vh] md:pt-[50vh] pb-10 md:pb-16"
          >
            {/* Editorial horizontal rule */}
            <motion.div variants={fadeInUp} className="w-16 mb-8" style={{ borderTop: '1px solid rgba(255,255,255,0.3)' }} />

            <motion.blockquote
              variants={fadeInUp}
              className="text-2xl md:text-3xl lg:text-[2.8rem] mb-6 leading-[1.1]"
              style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
            >
              "PURE SHARED JOY.
              <br />
              DANCING TO
              <br />
              GILLIGAN MOSS
              <br />
              IN THE LATE
              <br />
              AFTERNOON LIGHT."
            </motion.blockquote>

            <motion.div variants={fadeInUp} className="w-16 my-6" style={{ borderTop: '1px solid rgba(255,255,255,0.3)' }} />

            <motion.p
              variants={fadeInUp}
              className="text-sm mb-2"
              style={{ ...typography.caption, color: COLORS.clay }}
            >
              GILLIGAN MOSS RETURNS THIS YEAR
            </motion.p>

            <motion.p
              variants={fadeInUp}
              className="text-sm mb-2"
              style={{ ...typography.body, color: 'rgba(255,255,255,0.7)' }}
            >
              This is what it feels like when you're fully here — comfortable, present, and surrounded by people who came for the same thing.
            </motion.p>
          </motion.div>
        </section>

        {/* ===== URGENCY STRIP — mid-scroll interrupt ===== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative py-5 md:py-6"
          style={{ backgroundColor: COLORS.clay }}
        >
          <div className="max-w-4xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-center">
            <p
              className="text-base md:text-lg"
              style={{ ...typography.subhead, color: COLORS.white, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Limited to 700 — spots are filling up
            </p>
            <Link
              to="/tickets"
              className="px-6 py-2.5 text-sm transition-all hover:opacity-90 flex-shrink-0 inline-flex items-center gap-2"
              style={{
                ...typography.button,
                backgroundColor: COLORS.white,
                color: COLORS.clay,
                fontWeight: 600,
              }}
            >
              Reserve Your Spot
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.section>

        {/* ===== SECTION 4: SOCIAL PROOF — Split Panel ===== */}
        <section className="relative min-h-screen" style={{ backgroundColor: COLORS.denim }}>
          <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
            {/* Left: Typography — denim panel */}
            <TypographyPanel bgColor={COLORS.denim}>
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                <motion.p
                  variants={fadeInUp}
                  className="mb-6"
                  style={{ ...typography.caption, color: COLORS.clay }}
                >
                  FROM THE CROWD
                </motion.p>

                <motion.h2
                  variants={fadeInUp}
                  className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] mb-10"
                  style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
                >
                  PEOPLE DON'T
                  <br />
                  JUST COME.
                  <br />
                  THEY FEEL IT.
                </motion.h2>

                <motion.div variants={fadeInUp} className="w-16 mb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }} />

                <motion.blockquote
                  variants={fadeInUp}
                  className="text-xl md:text-2xl mb-4 leading-snug"
                  style={{ ...typography.headline, color: COLORS.dustySky }}
                >
                  "Wow… I needed that.
                  <br />
                  That was my favorite
                  <br />
                  weekend of the year."
                </motion.blockquote>

                <motion.div variants={fadeInUp} className="w-16 mt-4 mb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }} />

                <motion.p
                  variants={fadeInUp}
                  className="text-sm mb-4"
                  style={{ ...typography.body, color: COLORS.boulder }}
                >
                  — Monday morning after Cosmico
                </motion.p>

                <motion.p
                  variants={fadeInUp}
                  className="text-base mb-8"
                  style={{ ...typography.body, color: 'rgba(255,255,255,0.7)' }}
                >
                  If that sounds like your kind of weekend, you'll feel it here.
                </motion.p>

                <motion.div variants={fadeInUp}>
                  <Link
                    to="/tickets"
                    className="inline-flex items-center gap-2 px-7 py-3.5 text-sm transition-all hover:opacity-90"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.white,
                      color: COLORS.denim,
                    }}
                  >
                    Reserve Your Spot
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </motion.div>
            </TypographyPanel>

            {/* Right: True Duotone — denim shadows, dusty sky highlights */}
            <TrueDuotonePanel
              image={crowdGolden}
              alt="Candid faces in golden light"
              shadowColor={COLORS.denim}
              highlightColor={COLORS.dustySky}
              brightness={0.95}
            />
          </div>
        </section>

        {/* ===== POST-TESTIMONIAL CTA — capture momentum ===== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="py-10 md:py-14 text-center"
          style={{ backgroundColor: COLORS.dustySky }}
        >
          <div className="max-w-md mx-auto px-5">
            <p
              className="text-sm mb-5"
              style={{ ...typography.body, color: COLORS.boulder }}
            >
              Weekend from $120 · Saturday from $85 · with payment plan
            </p>
            <Link
              to="/tickets"
              className="inline-flex items-center gap-2 px-8 py-4 text-base transition-all hover:opacity-90"
              style={{
                ...typography.button,
                backgroundColor: COLORS.charcoal,
                color: COLORS.white,
              }}
            >
              Reserve Your Spot
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.section>

        {/* ===== MID-PAGE IDENTITY LINE ===== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="py-16 md:py-20 text-center"
          style={{ backgroundColor: COLORS.charcoal }}
        >
          <p
            className="text-xl md:text-2xl lg:text-3xl"
            style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
          >
            This is where we come together.
          </p>
        </motion.section>

        {/* ===== SECTION 5: EXPERIENCE — Split Panel ===== */}
        <section id="experience" className="relative min-h-screen" style={{ backgroundColor: COLORS.forest }}>
          <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
            {/* Left: Duotone — forest/sage (matching homepage screenshot) */}
            <DuotonePanel
              image={dockHangout}
              alt="People by the river"
              color={COLORS.sage}
              secondaryColor={COLORS.forest}
              className="order-2 md:order-1"
              intensity={0.85}
            />

            {/* Right: Typography — forest green panel */}
            <TypographyPanel bgColor={COLORS.forest} className="order-1 md:order-2">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                <motion.p
                  variants={fadeInUp}
                  className="mb-6"
                  style={{ ...typography.caption, color: COLORS.dustySky }}
                >
                  THE EXPERIENCE
                </motion.p>

                <motion.h2
                  variants={fadeInUp}
                  className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] mb-10"
                  style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
                >
                  THIS IS WHAT
                  <br />
                  IT FEELS LIKE
                  <br />
                  WHEN YOU'RE
                  <br />
                  HERE.
                </motion.h2>

                <motion.p
                  variants={fadeInUp}
                  className="text-base mb-10 max-w-sm"
                  style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.85 }}
                >
                  The experience is intentionally simple: good music, open space, and the kind of atmosphere that lets you actually settle in.
                </motion.p>

                <motion.ul variants={staggerContainer} className="space-y-5 max-w-sm">
                  {[
                    "Limited to 700 people",
                    "Independent spirits. Creative minds.",
                    "Example County. Example River. Vineyards all around.",
                    "No posturing. Just presence.",
                  ].map((item, i) => (
                    <motion.li
                      key={i}
                      variants={fadeInUp}
                      className="flex items-start gap-3"
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                        style={{ backgroundColor: COLORS.dustySky }}
                      />
                      <span
                        className="text-base"
                        style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.85 }}
                      >
                        {item}
                      </span>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </TypographyPanel>
          </div>
        </section>

        {/* ===== SECTION 6: FINAL CLOSE — Full Panel ===== */}
        <section className="relative min-h-[70vh] md:min-h-screen overflow-hidden">
          {/* Full color walking photo — golden light, warmth */}
          <img
            src={walkingGolden}
            alt="Two friends walking together in golden sunlight"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            style={{ filter: 'brightness(1.05) contrast(1.05)', objectPosition: 'center 35%' }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.5) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none z-[2]" style={{ ...heavyGrain, opacity: 0.12, mixBlendMode: 'overlay' }} />

          <FilmGrainOverlay opacity={0.5} />

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
            className="relative z-10 max-w-xl mx-auto px-5 flex flex-col justify-center items-center text-center min-h-[70vh] md:min-h-screen"
          >
            <motion.p
              variants={fadeInUp}
              className="mb-6"
              style={{ ...typography.caption, color: COLORS.white }}
            >
              MAY 14–16 · EXAMPLE COUNTY
            </motion.p>

            <motion.h2
              variants={fadeInUp}
              className="text-[2.5rem] md:text-[3.5rem] lg:text-[4.5rem] leading-[1.05] mb-6"
              style={{ ...typography.headline, color: COLORS.white, textTransform: 'uppercase' }}
            >
              THIS IS
              <br />
              YOUR SPOT.
              <br />
              CLAIM IT.
            </motion.h2>

            <motion.div variants={fadeInUp} className="w-16 mb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.4)' }} />

            <motion.div variants={fadeInUp} className="mb-6">
              <p
                className="text-base mb-1"
                style={{ ...typography.body, color: "rgba(255,255,255,0.8)" }}
              >
                700 people. One weekend. No second chances.
              </p>
              <p
                className="text-lg mb-4"
                style={{ ...typography.subhead, color: COLORS.white, fontWeight: 600 }}
              >
                Lock in your spot now and pay over time.
              </p>
              <p
                className="text-sm"
                style={{ ...typography.body, color: "rgba(255,255,255,0.6)" }}
              >
                Weekend from $120 today. Saturday from $85. With payment plan.
              </p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <Link
                to="/tickets"
                className="inline-flex items-center gap-2 px-10 py-4 text-base transition-all hover:opacity-90"
                style={{
                  ...typography.button,
                  backgroundColor: COLORS.white,
                  color: COLORS.charcoal,
                }}
              >
                Reserve Your Spot
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* Minimal Footer */}
        <footer className="py-8 px-5 text-center" style={{ backgroundColor: COLORS.charcoal }}>
          <p className="text-xs" style={{ ...typography.caption, color: "rgba(255,255,255,0.4)" }}>
            © {new Date().getFullYear()} COSMICO · EXAMPLE COUNTY, CA
          </p>
        </footer>

        {/* ===== STICKY CTA (mobile) ===== */}
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={showSticky ? { y: 0, opacity: 1 } : { y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
          style={{
            backgroundColor: "rgba(47,47,47,0.97)",
            backdropFilter: "blur(12px)",
            borderTop: `1px solid rgba(255,255,255,0.08)`,
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs" style={{ ...typography.caption, color: COLORS.clay }}>
                LIMITED TO 700
              </p>
              <p className="text-xs mt-0.5" style={{ ...typography.body, color: "rgba(255,255,255,0.6)" }}>
                Weekend from $120 · Saturday from $85
              </p>
            </div>
            <Link
              to="/tickets"
              className="px-5 py-2.5 text-sm flex-shrink-0 transition-all hover:opacity-90"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
              }}
            >
              Reserve
            </Link>
          </div>
        </motion.div>
      </div>
      <ExitIntentPopup
        open={showExitIntent}
        onClose={() => {
          setShowExitIntent(false);
        }}
      />
    </>
  );
};

export default Reserve;
