import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { foodVendors } from "@/data/foodVendors";

import dinnerHero from "@/assets/may/dinner-long-table.jpg";
import fieldDayLogo from "@/assets/may/field-day-logo.jpg";
import nickNaomi from "@/assets/may/dinner-nick-naomi.png";

const Eat = () => {
  usePageMeta({
    title: "Eat — Cosmico 2026",
    description: "Friday night dinner with Field Day Ca, plus the food partners cooking on-site all weekend at Cosmico 2026.",
  });
  useCanonicalUrl('/eat');

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO: FIELD DAY DINNER ===== */}
      <section className="relative min-h-[85vh] md:min-h-screen flex items-end overflow-hidden">
        <img
          src={dinnerHero}
          alt="Long communal table under trees at golden hour"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 60%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/20" />
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.18, mixBlendMode: 'overlay' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />

        <motion.div
          className="relative z-10 w-full px-6 md:px-12 lg:px-16 pb-16 md:pb-24 max-w-3xl"
          initial="hidden"
          animate="visible"
        >
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '24px' }}
          >
            FRIDAY NIGHT · MAY 15
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.0, marginBottom: '20px' }}
          >
            Analog x<br />Field Day Ca
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.subhead, color: COLORS.boulder, fontSize: '1.15rem', marginBottom: '16px', lineHeight: 1.4 }}
          >
            A Japanese picnic under open skies
          </motion.p>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.65, opacity: 0.85, marginBottom: '32px', maxWidth: '32rem' }}
          >
            Nick and Naomi of Field Day Ca open the weekend with a long-table dinner — seasonal, considered, and shared with the people you'll spend the next three days with.
          </motion.p>
          <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3">
            <span
              className="inline-block px-10 py-4 text-center"
              style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.white,
                fontSize: '13px',
                letterSpacing: '0.15em',
                border: `1px solid ${COLORS.white}`,
              }}
            >
              Dinner Sold Out
            </span>
            <a
              href="#vendors"
              className="inline-block px-10 py-4 transition-all duration-300 hover:opacity-80 text-center"
              style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.white,
                fontSize: '13px',
                letterSpacing: '0.05em',
                border: '1px solid rgba(255,255,255,0.35)',
              }}
            >
              Meet our food partners
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== INTRO ===== */}
      <section id="vendors" className="relative pt-24 md:pt-32 pb-12 md:pb-16 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            EAT
          </motion.p>
          <motion.h2
            className="text-[2rem] sm:text-[2.6rem] md:text-[3.2rem] lg:text-[3.8rem] leading-[1.02] tracking-tight uppercase mb-8"
            style={{ ...typography.headline, color: COLORS.charcoal }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Example County,<br />Served Right
          </motion.h2>
          <motion.div
            className="max-w-xl space-y-5"
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.6 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <p>
              Every plate comes from a place we already love. Local restaurants, small independents, the spots we go back to all year long — now cooking on-site, all weekend.
            </p>
            <p>
              No filler. No festival food. Just Example County, the way we actually eat.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== RESTAURANT GRID ===== */}
      <section className="px-6 pb-24 md:pb-32" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14 md:gap-y-20">
          {foodVendors.map((vendor, idx) => (
            <motion.div
              key={vendor.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.08 }}
            >
              <Link to={`/eat/${vendor.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden mb-5" style={{ backgroundColor: COLORS.charcoal }}>
                  {vendor.founderPhoto && (
                    <img
                      src={vendor.founderPhoto}
                      alt={vendor.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.1, mixBlendMode: 'overlay' }} />
                  {vendor.slug === 'long-table' && (
                    <div className="absolute top-3 left-3 px-3 py-1.5" style={{ backgroundColor: COLORS.white, color: COLORS.charcoal, ...typography.button, fontSize: '10px', letterSpacing: '0.15em' }}>
                      SOLD OUT
                    </div>
                  )}
                </div>
                <h3
                  className="mb-2 group-hover:opacity-70 transition-opacity"
                  style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '1.65rem', lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '-0.005em' }}
                >
                  {vendor.name}
                </h3>
                <p
                  style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.85rem', lineHeight: 1.5, opacity: 0.7 }}
                >
                  {vendor.shortDescriptor ?? ''}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== TICKET CTA ===== */}
      <section className="relative min-h-[50vh] flex items-center justify-center px-6 py-20" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 text-center max-w-2xl">
          <motion.h2
            className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight uppercase mb-6"
            style={{ ...typography.headline, color: COLORS.dustySky }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Eat with us<br />in May
          </motion.h2>
          <motion.p
            className="mb-10"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1rem', lineHeight: 1.65, opacity: 0.85 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            700 people. Three days. Real food, made by people you'll meet.
          </motion.p>
          <motion.div className="flex flex-col sm:flex-row gap-4 justify-center" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Link
              to="/tickets"
              className="inline-block px-10 py-4 hover:opacity-80 transition-opacity"
              style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, fontSize: '13px', letterSpacing: '0.05em' }}
            >
              Get Tickets
            </Link>
            <Link
              to="/fielddayca"
              className="inline-block px-10 py-4 hover:opacity-80 transition-opacity"
              style={{ ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, fontSize: '13px', letterSpacing: '0.05em', border: `1px solid ${COLORS.dustySky}60` }}
            >
              Friday Dinner
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Eat;
