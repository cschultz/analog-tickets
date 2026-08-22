import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, staggerContainer, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { wineries } from "@/data/wineries";

// Shared photos for the page chrome
import winecampGathering from "@/assets/may/winecamp-gathering.webp";

// Per-winery logo height overrides to normalize perceived size
// Heavy/tall logos get smaller heights, thin/wide logos get larger heights
const logoHeightMap: Record<string, string> = {
  'meadowlark': 'h-7 md:h-8',
  'stonefruit': 'h-12 md:h-14',
  'ripple': 'h-14 md:h-16',
  'tidewater': 'h-7 md:h-8',
  'dryfield': 'h-8 md:h-9',
  'northfence': 'h-11 md:h-12',
  'trailhead': 'h-12 md:h-14',
  'twin-oaks': 'h-12 md:h-14',
  'clay-hollow': 'h-11 md:h-12',
  'longshadow': 'h-9 md:h-10',
  'driftline': 'h-14 md:h-16',
  'sunmark': 'h-20 md:h-24',
};

const WineCampLineup = () => {
  usePageMeta({
    title: "Wine Camp Lineup — Cosmico 2026",
    description: "Meet the winemakers joining Wine Camp at Cosmico. Independent Example County winemakers pouring their own bottles — and sticking around all weekend.",
  });

  const sortedWineries = [...wineries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== SPLIT HERO ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 min-h-[70vh] md:min-h-[85vh]">
        {/* Left — Golden Hour Image */}
        <div className="relative min-h-[45vh] md:min-h-full overflow-hidden" style={{ backgroundColor: COLORS.charcoal }}>
          <img
            src={winecampGathering}
            alt="Wine Camp gathering at golden hour"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center 40%' }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.15, mixBlendMode: 'overlay' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
        </div>

        {/* Right — Headline */}
        <div className="relative flex flex-col justify-center p-8 md:p-12 lg:p-16" style={{ backgroundColor: COLORS.deepWater }}>
          <FilmGrainOverlay opacity={0.5} />
          <div className="relative z-10 max-w-md">
            <motion.p
              style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            >
              COSMICO · MAY 2026
            </motion.p>
            <motion.h1
              style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.0, marginBottom: '20px' }}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.7 }}
            >
              Wine Camp
            </motion.h1>
            <motion.p
              style={{ ...typography.subhead, color: COLORS.boulder, fontSize: '1.15rem', marginBottom: '20px', lineHeight: 1.4 }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            >
              Taste with the people who made it.
            </motion.p>
            <motion.p
              style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.65, opacity: 0.85 }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
            >
              Independent Example County winemakers pouring their own bottles—<br />
              and sticking around all weekend.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ===== WINERY GRID ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-6xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', textAlign: 'center', marginBottom: '16px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            PARTICIPATING WINERIES
          </motion.p>
          <motion.h2
            style={{ ...typography.headline, color: COLORS.charcoal, fontSize: 'clamp(1.8rem, 4vw, 3rem)', textAlign: 'center', marginBottom: '16px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Meet the Makers
          </motion.h2>
          <motion.p
            style={{ ...typography.body, color: COLORS.boulder, fontSize: '1rem', textAlign: 'center', marginBottom: '48px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            These are the winemakers you'll meet—and probably run into again later.
          </motion.p>

          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
            variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            {sortedWineries.map((winery) => (
              <motion.div key={winery.slug} variants={fadeInUp}>
                <Link
                  to={`/winecamp/${winery.slug}`}
                  className="group block"
                >
                  {/* Photo */}
                  <div className="relative aspect-[4/5] overflow-hidden mb-4" style={{ backgroundColor: COLORS.charcoal }}>
                    {winery.winemakerPhoto && (
                      <img
                        src={winery.winemakerPhoto}
                        alt={`${winery.winemakerNames} of ${winery.name}`}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        style={{ filter: 'grayscale(30%) contrast(1.05)' }}
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.2, mixBlendMode: 'overlay' }} />
                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.15 }} />
                    {/* Bottom vignette for logo readability */}
                    <div
                      className="absolute inset-x-0 bottom-0 pointer-events-none"
                      style={{
                        height: '50%',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0) 100%)',
                      }}
                    />
                    {/* Logo overlay — anchored bottom-left within vignette */}
                    {winery.logo && (
                      <div className={`absolute left-3 z-10 ${winery.slug === 'duju' ? '-bottom-1' : 'bottom-3'}`}>
                        <img
                          src={winery.logo}
                          alt={`${winery.name} logo`}
                          className={`w-auto max-w-[68%] object-contain ${logoHeightMap[winery.slug] || 'h-6 md:h-7'}`}
                          style={{ filter: 'brightness(0) invert(1)', opacity: 0.8 }}
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '1.1rem', marginBottom: '4px' }}>
                    {winery.name}
                  </h3>
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.12em' }}>
                    {winery.winemakerNames}
                  </p>
                </Link>
              </motion.div>
            ))}

            {/* Placeholder cards for upcoming wineries */}
            {Array.from({ length: Math.max(0, 12 - wineries.length) }).map((_, i) => (
              <motion.div key={`placeholder-${i}`} variants={fadeInUp}>
                <div className="relative aspect-[4/5] overflow-hidden mb-4 flex items-center justify-center" style={{ backgroundColor: COLORS.charcoal + '15' }}>
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>COMING SOON</p>
                </div>
                <div className="h-4 w-2/3 rounded" style={{ backgroundColor: COLORS.boulder + '20' }} />
                <div className="h-3 w-1/2 rounded mt-2" style={{ backgroundColor: COLORS.boulder + '15' }} />
              </motion.div>
            ))}
          </motion.div>

          {/* Below-grid line */}
          <motion.p
            className="text-center mt-16 max-w-lg mx-auto"
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.6, fontStyle: 'italic' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            You'll taste with them at Wine Camp…<br />
            then see them hanging out all weekend—maybe even on the dance floor.
          </motion.p>
        </div>
      </section>

      {/* ===== DETAILS + CTA SECTION ===== */}
      <section className="relative py-16 md:py-20 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            WINE CAMP DETAILS
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, marginBottom: '16px', fontSize: '1.02rem', lineHeight: 1.7, maxWidth: '42rem', marginLeft: 'auto', marginRight: 'auto' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Wine Camp takes place Saturday from 1–4 PM—<br />
            an afternoon of tasting with the winemakers themselves.
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, marginBottom: '24px', fontSize: '1.02rem', lineHeight: 1.7, maxWidth: '42rem', marginLeft: 'auto', marginRight: 'auto' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            It's part of Cosmico—a three-day gathering of music, wine, and community on the Example River.
          </motion.p>
          <motion.p
            style={{ ...typography.subhead, color: COLORS.deepWater, marginBottom: '14px', fontSize: '1.15rem', lineHeight: 1.5 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Get your tickets for Cosmico and Wine Camp now.
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.95rem', lineHeight: 1.6, maxWidth: '38rem', marginLeft: 'auto', marginRight: 'auto' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Space is limited—and this is one of the few times all of these winemakers are in one place.
          </motion.p>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.sage, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            LIMITED TO 700
          </motion.p>
          <motion.h2
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(1.8rem, 4vw, 3rem)', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            You Won't Just Taste Their Wines
          </motion.h2>
          <motion.p
            style={{ ...typography.body, color: COLORS.dustySky, marginBottom: '16px', fontSize: '1.05rem', lineHeight: 1.6 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Wine Camp is part of Cosmico—three days of music, wine, and community on the Example River.
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.dustySky, marginBottom: '40px', fontSize: '0.95rem', lineHeight: 1.6, fontStyle: 'italic', opacity: 0.8 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            No tasting rooms. No separation. Just a weekend you're actually in.
          </motion.p>
          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Link
              to="/tickets"
              className="inline-block px-10 py-4 transition-all duration-300 hover:opacity-90"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: '15px',
              }}
            >
              Get Your Tickets
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default WineCampLineup;
