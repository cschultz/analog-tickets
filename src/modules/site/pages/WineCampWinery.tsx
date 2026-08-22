import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { getWineryBySlug } from "@/data/wineries";
import { Instagram, Mail } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Shared Analog photos for the narrative sections
import winecampGathering from "@/assets/may/winecamp-gathering.webp";
import dockHangout from "@/assets/may/dock-hangout-river.webp";
import singerPinkPerforming from "@/assets/may/singer-pink-performing.webp";
import kidsArt from "@/assets/may/child-art-canvas.webp";
import crewFriendsGolden from "@/assets/may/crew-friends-golden.webp";

// Duotone image panel — with configurable overlay intensity
const DuotonePanel = ({
  image, alt, color, objectPosition = "center center", className = "",
  colorOpacity = 0.3, grainOpacity = 0.2, halftoneOpacity = 0.2, brightness = 0.95
}: {
  image: string; alt: string; color: string; objectPosition?: string; className?: string;
  colorOpacity?: number; grainOpacity?: number; halftoneOpacity?: number; brightness?: number;
}) => (
  <div className={`relative min-h-[40vh] md:min-h-[50vh] overflow-hidden ${className}`} style={{ backgroundColor: color }}>
    <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: grainOpacity, mixBlendMode: 'overlay' }} />
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ filter: `grayscale(100%) contrast(1.05) brightness(${brightness})`, mixBlendMode: 'multiply', objectPosition }} loading="lazy" />
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, mixBlendMode: 'multiply', opacity: colorOpacity }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: halftoneOpacity }} />
  </div>
);

// Text panel — mirrors TypographyPanel from Real.tsx for consistent sizing
const TextPanel = ({
  label, labelColor, bgColor, children
}: {
  label: string; labelColor: string; bgColor: string; children: React.ReactNode;
}) => (
  <div className="relative flex flex-col justify-center p-8 md:p-12 lg:p-16" style={{ backgroundColor: bgColor }}>
    <FilmGrainOverlay opacity={0.5} />
    <div className="relative z-10">
      <motion.p
        style={{ ...typography.caption, color: labelColor, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
        variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
      >
        {label}
      </motion.p>
      {children}
    </div>
  </div>
);

const heroLogoSizeMap: Record<string, string> = {
  'meadowlark': 'max-h-10 md:max-h-12',
  'stonefruit': 'max-h-20 md:max-h-24',
  'ripple': 'max-h-24 md:max-h-28',
  'tidewater': 'max-h-8 md:max-h-10',
  'dryfield': 'max-h-14 md:max-h-16',
  'northfence': 'max-h-16 md:max-h-20',
  'trailhead': 'max-h-20 md:max-h-24',
  'twin-oaks': 'max-h-14 md:max-h-16',
  'clay-hollow': 'max-h-16 md:max-h-20',
  'longshadow': 'max-h-16 md:max-h-18',
  'driftline': 'max-h-10 md:max-h-12',
  'sunmark': 'max-h-20 md:max-h-24',
};

const WineCampWinery = () => {
  const { slug } = useParams<{ slug: string }>();
  const winery = slug ? getWineryBySlug(slug) : undefined;
  const [detailsEmail, setDetailsEmail] = useState("");
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);
  const { toast } = useToast();

  usePageMeta({
    title: winery ? `${winery.name} × Wine Camp — Cosmico` : "Wine Camp — Cosmico",
    description: winery
      ? `${winery.name} is joining Wine Camp at Cosmico 2026. Live music, wine, nature, and community in Example County.`
      : "Wine Camp at Cosmico 2026.",
  });

  if (!winery) {
    return <Navigate to="/winecamp" replace />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO: Winery Feature ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 min-h-[80vh] md:min-h-screen">
        {/* Text Panel */}
        <div className="relative flex flex-col justify-between p-8 md:p-12 lg:p-16 order-2 md:order-1" style={{ backgroundColor: COLORS.deepWater }}>
          <FilmGrainOverlay opacity={0.5} />
          <div className="relative z-10" />
          <div className="relative z-10 flex-1 flex flex-col justify-center py-8">
            <motion.p
              style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            >
              YOU'RE INVITED
            </motion.p>

            {/* Winery Logo */}
            {winery.logo && (
              <motion.div
                className="mb-6"
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.7 }}
              >
                <img
                  src={winery.logo}
                  alt={`${winery.name} logo`}
                  className={`w-auto object-contain ${heroLogoSizeMap[winery.slug] || 'max-h-16 md:max-h-20'}`}
                  style={{ filter: 'brightness(0) invert(1)', opacity: 0.85 }}
                />
              </motion.div>
            )}

            <motion.h1
              className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.5rem] lg:text-[3rem] leading-[1.05] tracking-tight mb-2"
              style={{ ...typography.headline, color: COLORS.white }}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.7 }}
            >
              Join {winery.name} at Cosmico
            </motion.h1>

            <motion.p
              style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.12em', marginBottom: '20px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            >
              A THREE-DAY MUSIC + WINE GATHERING ON THE EXAMPLE RIVER IN EXAMPLE VALLEY · MAY 14–16 · EXAMPLE MEADOW
            </motion.p>

            <motion.div className="max-w-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }}>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/tickets"
                  className="inline-block px-8 py-3 text-xs uppercase hover:opacity-80 transition-opacity text-center"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.mustard,
                    color: COLORS.charcoal,
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    fontWeight: 500,
                  }}
                >
                  Get Tickets
                </Link>
                <a
                  href="#what-is-this"
                  className="inline-block px-8 py-3 text-xs uppercase hover:opacity-80 transition-opacity text-center"
                  style={{
                    ...typography.button,
                    backgroundColor: 'transparent',
                    color: COLORS.white,
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    fontWeight: 500,
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                >
                  See What It's About
                </a>
              </div>
            </motion.div>
          </div>
          <div className="relative z-10" />
        </div>

        {/* Winemaker Photo */}
        <div className="relative min-h-[50vh] md:min-h-screen overflow-hidden order-1 md:order-2" style={{ backgroundColor: COLORS.charcoal }}>
          {winery.winemakerPhoto && (
            <img
              src={winery.winemakerPhoto}
              alt={`${winery.winemakerNames} of ${winery.name}`}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: 'center center' }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.15, mixBlendMode: 'overlay' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
        </div>
      </section>

      {/* ===== SPEND THE WEEKEND WITH ===== */}
      <section className="grid grid-cols-1 md:grid-cols-5" style={{ backgroundColor: COLORS.dustySky }}>
        {/* Bottle photo — 2 cols, no duotone */}
        {winery.bottlePhoto && (
          <div className="relative col-span-1 md:col-span-2 min-h-[50vh] md:min-h-[55vh] overflow-hidden order-2 md:order-1" style={{ backgroundColor: COLORS.dustySky }}>
            <img
              src={winery.bottlePhoto}
              alt={`${winery.name} wine bottle`}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: 'center 40%' }}
              loading="lazy"
            />
            {winery.slug === 'duju' && (
              <div
                className="absolute top-4 left-4 z-10 px-3 py-2"
                style={{
                  ...typography.caption,
                  backgroundColor: COLORS.deepWater,
                  color: COLORS.white,
                  letterSpacing: '0.12em',
                  fontSize: '10px',
                }}
              >
                NA SPARKLING
              </div>
            )}
          </div>
        )}

        {/* Copy — 3 cols */}
        <div className="relative col-span-1 md:col-span-3 flex flex-col justify-center p-8 md:p-12 lg:p-16 order-1 md:order-2">
          <FilmGrainOverlay opacity={0.5} />
          <div className="relative z-10 max-w-md">
            <motion.p
              style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
              variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            >
              SPEND THE WEEKEND WITH {winery.name.toUpperCase()}
            </motion.p>
            <motion.p
              style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.65, marginBottom: '16px' }}
              variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            >
              {(() => {
                const pouringNames = winery.tasteWithNames || winery.winemakerNames;
                const isPlural = pouringNames.includes('&');
                const pronoun = isPlural ? 'them' : (winery.pronoun || 'them');
                return `${pouringNames} will be pouring the wines — and don't be surprised if you find ${pronoun} on the dance floor later.`;
              })()}
            </motion.p>
            <motion.p
              style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.65 }}
              variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            >
              {winery.blurb}
            </motion.p>
            {winery.instagram && (
              <motion.a
                href={`https://instagram.com/${winery.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-5 transition-opacity hover:opacity-70"
                style={{ ...typography.caption, color: COLORS.denim, fontSize: '10px', letterSpacing: '0.1em' }}
                variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                <Instagram size={12} />
                @{winery.instagram}
              </motion.a>
            )}
          </div>
        </div>
      </section>

      {/* ===== WHAT IS COSMICO ===== */}
      <section id="what-is-this" className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            WHAT IS COSMICO
          </motion.p>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] lg:text-[3.2rem] leading-[1.05] tracking-tight uppercase mb-6 max-w-3xl"
            style={{ ...typography.headline, color: COLORS.charcoal }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Three days in Example Valley.
          </motion.h2>
          <motion.div
            className="max-w-xl mb-12 md:mb-16 space-y-4"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.65 }}>
              Live music, independent, boutique California wine, and a community of people you'll know by the end of the weekend.
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.65 }}>
              Not a traditional festival. Not a typical wine weekend.
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.65 }}>
              Something smaller. More intentional. Built for people who actually want to be there.
            </p>
          </motion.div>

          {/* WHAT / WHEN / WHERE / WINE CAMP columns */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-12 md:mb-16 max-w-3xl"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <div>
              <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '12px' }}>WHAT</p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>
                Live music by the river. Wine poured by the people who made it. Late-night dancing. Morning swims.
              </p>
            </div>
            <div>
              <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '12px' }}>WHEN</p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>
                May 14–16, 2027. Friday and Saturday for everyone. Sunday reserved for VIP.
              </p>
            </div>
            <div>
              <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '12px' }}>WHERE</p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>
                Example Meadow, Example Valley. Right on the Example River, surrounded by vineyards.
              </p>
            </div>
            <div>
              <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '12px' }}>WINE CAMP</p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>
                Saturday, May 16. 1–4 PM. The winemakers are right there, pouring their own bottles. No velvet ropes — just conversation.
              </p>
            </div>
          </motion.div>

          {/* Italic tagline */}
          <motion.p
            className="max-w-2xl mb-10"
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.65, fontStyle: 'italic' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Music by the Example River… wine poured by the people who made it. You won't just be there. You'll be in it.
          </motion.p>

          <motion.p
            style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.12em', fontSize: '10px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            COSMICO · FICTIONAL DEMO EVENT
          </motion.p>
        </div>
      </section>

      {/* ===== CINEMATIC DIVIDER ===== */}
      <div className="relative h-[45vh] md:h-[55vh] overflow-hidden">
        <img src={winecampGathering} alt="Wine tasting gathering at Cosmico" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 50%' }} loading="lazy" />
      </div>


      {/* ===== WINE CAMP + KIDS CAMP ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        <DuotonePanel image={kidsArt} alt="Kids Camp art activity" color={COLORS.forest} objectPosition="center 40%" colorOpacity={0.25} brightness={1.0} />
        <TextPanel label="FOR FAMILIES" labelColor={COLORS.sage} bgColor={COLORS.forest}>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.5rem] leading-[1.05] tracking-tight uppercase mb-8"
            style={{ ...typography.headline, color: COLORS.white }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Wine Camp +<br />Kids Camp
          </motion.h2>
           <motion.div className="max-w-sm" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.55 }}>
              Wine Camp and Kids Camp run at the same time. You taste with the winemakers. The kids get art, nature walks, and hands-on fun in a supervised setting.
            </p>
          </motion.div>
        </TextPanel>
      </section>

      {/* ===== MUSIC ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        <TextPanel label="THE MUSIC" labelColor={COLORS.mustard} bgColor={COLORS.denim}>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.5rem] leading-[1.05] tracking-tight uppercase mb-8"
            style={{ ...typography.headline, color: COLORS.white }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            The Music
          </motion.h2>
          <motion.div className="max-w-sm space-y-4" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.55 }}>
              Artists you haven't heard yet, but will be glad you did. Intimate daytime sets by the river. Full-band performances under the redwoods at night.
            </p>
            <Link
              to="/lineup"
              className="inline-block transition-opacity hover:opacity-70"
              style={{ ...typography.caption, color: COLORS.mustard, fontSize: '10px', letterSpacing: '0.12em', borderBottom: `1px solid ${COLORS.mustard}`, paddingBottom: '3px' }}
            >
              VIEW THE LINEUP →
            </Link>
          </motion.div>
        </TextPanel>
        <DuotonePanel image={singerPinkPerforming} alt="Live music at Cosmico" color={COLORS.magenta} objectPosition="center 30%" colorOpacity={0.2} brightness={1.0} />
      </section>

      {/* ===== NATURE & PLACE ===== */}
      <DuotonePanel image={dockHangout} alt="Example River at Cosmico" color={COLORS.sage} className="h-[35vh] md:h-[45vh]" colorOpacity={0.1} grainOpacity={0.1} halftoneOpacity={0.08} brightness={1.05} objectPosition="center 60%" />

      <section className="relative py-16 md:py-24 px-6" style={{ backgroundColor: COLORS.white }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.forest, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            THE SETTING
          </motion.p>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.5rem] leading-[1.05] tracking-tight uppercase mb-8"
            style={{ ...typography.headline, color: COLORS.charcoal }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Example River.<br />Example Valley.<br />Example County.
          </motion.h2>
          <motion.div className="max-w-sm mx-auto" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.55 }}>
              River swims between sets. Sauna at sunset. Dancing under the stars. It's wine country — but it won't feel like anything you've done here before.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section className="relative py-16 md:py-20 px-6" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            FROM THE CROWD
          </motion.p>
          <motion.blockquote
            className="text-xl md:text-2xl leading-snug mb-4"
            style={{ ...typography.headline, color: COLORS.dustySky }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            "I didn't know anyone when I showed up.<br />By Sunday I didn't want to leave."
          </motion.blockquote>
          <motion.p
            style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.85rem' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            — First-time attendee, 2025
          </motion.p>
        </div>
      </section>

      {/* ===== EMAIL CAPTURE ===== */}
      <section className="relative py-16 md:py-24 px-6" style={{ backgroundColor: COLORS.white }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-md mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            NOT SURE YET?
          </motion.p>
          <motion.h2
            className="text-[1.5rem] sm:text-[1.8rem] md:text-[2rem] leading-[1.1] tracking-tight uppercase mb-4"
            style={{ ...typography.headline, color: COLORS.charcoal }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Get a feel for it first.
          </motion.h2>
          <motion.p
            className="mb-8"
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.55, opacity: 0.8 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            We'll send you the full music lineup, which wineries are pouring, and a taste of what the weekend actually looks like.
          </motion.p>
          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            {detailsSubmitted ? (
              <p style={{ ...typography.body, color: COLORS.forest, fontSize: '0.95rem' }}>
                You're in. Check your inbox soon.
              </p>
            ) : (
              <form
                className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!detailsEmail || detailsSubmitting) return;
                  setDetailsSubmitting(true);
                  try {
                    // Store in contact_submissions
                    await supabase.from('contact_submissions').insert({
                      email: detailsEmail,
                      name: `Wine Camp Interest – ${winery.name}`,
                      message: `Details request from ${winery.slug} winery landing page`,
                    });
                    // Send Wine Camp info email + sync to Flodesk
                    await supabase.functions.invoke('send-winecamp-info', {
                      body: { email: detailsEmail, winerySlug: winery.slug },
                    });
                    setDetailsSubmitted(true);
                  } catch {
                    toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
                  } finally {
                    setDetailsSubmitting(false);
                  }
                }}
              >
                <input
                  type="email"
                  required
                  value={detailsEmail}
                  onChange={(e) => setDetailsEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 px-4 py-3 text-sm border outline-none"
                  style={{ borderColor: COLORS.boulder, color: COLORS.charcoal, backgroundColor: 'transparent', fontFamily: 'inherit' }}
                />
                <button
                  type="submit"
                  disabled={detailsSubmitting}
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity disabled:opacity-50"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.charcoal,
                    color: COLORS.white,
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    fontWeight: 500,
                  }}
                >
                  {detailsSubmitting ? '...' : 'Send me the details'}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative py-16 md:py-24 px-6" style={{ backgroundColor: COLORS.clay }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.white, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '8px', opacity: 0.6 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            MAY 14–16, 2027 · EXAMPLE VALLEY, CA
          </motion.p>
          <motion.p
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            LIMITED TO 700 · SELLING FAST
          </motion.p>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.5rem] leading-[1.05] tracking-tight uppercase mb-4"
            style={{ ...typography.headline, color: COLORS.white }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            See you at Wine Camp.
          </motion.h2>
          <motion.div className="max-w-sm mx-auto" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p style={{ ...typography.body, color: COLORS.white, marginBottom: '24px', fontSize: '0.95rem', opacity: 0.8, lineHeight: 1.55 }}>
              {winery.tasteWithNames || winery.winemakerNames} will be there pouring. We'd love you to be there too.
            </p>
            {/* Feature list */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-8"
              style={{ ...typography.caption, color: COLORS.white, letterSpacing: '0.1em', fontSize: '9px', opacity: 0.6 }}
            >
              <span>LIVE MUSIC</span>
              <span>WINE CAMP</span>
              <span>KIDS CAMP</span>
              <span>RIVER ACCESS</span>
              <span>ON-SITE LODGING</span>
            </div>
          </motion.div>
          <motion.div className="flex flex-col sm:flex-row gap-3 justify-center" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Link
              to="/tickets"
              className="inline-block px-8 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: COLORS.charcoal,
                color: COLORS.white,
                fontSize: '11px',
                letterSpacing: '0.05em',
                fontWeight: 500,
              }}
            >
              Get Tickets
            </Link>
            <Link
              to="/winecamp"
              className="inline-block px-8 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.white,
                fontSize: '11px',
                letterSpacing: '0.05em',
                fontWeight: 500,
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              See the Wine Camp Lineup
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default WineCampWinery;
