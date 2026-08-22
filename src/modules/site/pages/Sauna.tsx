import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { saunaVendors, type SaunaVendor } from "@/data/saunaVendors";

import fjordHero from "@/assets/may/saunavendors/fjord-hero.jpg";

const VendorCard = ({ vendor, idx }: { vendor: SaunaVendor; idx: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay: idx * 0.1 }}
  >
    <Link to={`/sauna/${vendor.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden mb-4" style={{ backgroundColor: COLORS.charcoal }}>
        {vendor.founderPhoto && (
          <img
            src={vendor.founderPhoto}
            alt={vendor.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            style={{ objectPosition: vendor.discipline === 'sound-bath' ? 'center 30%' : 'center center' }}
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.12, mixBlendMode: 'overlay' }} />
        {vendor.logo ? (
          <div className="absolute bottom-4 left-4 right-4 flex items-end">
            <img
              src={vendor.logo}
              alt={`${vendor.name} logo`}
              className="max-h-14 md:max-h-16 w-auto object-contain"
              style={{ opacity: 0.95 }}
            />
          </div>
        ) : (
          <div className="absolute bottom-4 left-4 right-4">
            <p style={{ ...typography.headline, color: COLORS.white, fontSize: '1.5rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {vendor.name}
            </p>
          </div>
        )}
      </div>
      <p style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '6px' }}>
        {vendor.founderNames.toUpperCase()}
      </p>
      <h3
        className="mb-2 group-hover:opacity-70 transition-opacity"
        style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '1.5rem', lineHeight: 1.1, textTransform: 'uppercase' }}
      >
        {vendor.name}
      </h3>
      <p
        className="line-clamp-3"
        style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.9rem', lineHeight: 1.55, opacity: 0.85 }}
      >
        {vendor.blurb}
      </p>
      <p
        className="mt-3 inline-block"
        style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.12em', borderBottom: `1px solid ${COLORS.clay}`, paddingBottom: '2px' }}
      >
        READ MORE →
      </p>
    </Link>
  </motion.div>
);

const Sauna = () => {
  usePageMeta({
    title: "Wellness — Cosmico 2026",
    description: "Wood-fired saunas, cold plunges, and sound meditation on the Example River. Meet the wellness partners at Cosmico 2026.",
  });
  useCanonicalUrl('/sauna');

  const saunaPartners = saunaVendors.filter(v => (v.discipline ?? 'sauna') === 'sauna');
  const soundBathPartners = saunaVendors.filter(v => v.discipline === 'sound-bath');

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO ===== */}
      <section className="relative min-h-[85vh] md:min-h-screen flex items-end overflow-hidden">
        <img
          src={fjordHero}
          alt="Silhouette in a wood-fired sauna at sunset"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 50%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
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
            ALL WEEKEND · MAY 14–16
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.0, marginBottom: '20px' }}
          >
            Wellness
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.subhead, color: COLORS.boulder, fontSize: '1.15rem', marginBottom: '16px', lineHeight: 1.4 }}
          >
            Sauna Village. Sound Bath. Slow rituals between the music.
          </motion.p>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.65, opacity: 0.85, marginBottom: '32px', maxWidth: '32rem' }}
          >
            Wood-fired saunas and cold plunges on-site all weekend. Sound meditation tucked between sets — gongs, crystal bowls, the room slowing down. A long ritual that resets the whole nervous system.
          </motion.p>
          <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3">
            <a
              href="#vendors"
              className="inline-block px-10 py-4 transition-all duration-300 hover:opacity-90 text-center"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: '13px',
                letterSpacing: '0.05em',
              }}
            >
              Meet our wellness partners
            </a>
            <Link
              to="/tickets"
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
              Get Tickets
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== SAUNA SECTION INTRO ===== */}
      <section id="vendors" className="relative pt-20 md:pt-28 pb-10 md:pb-14 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            ON-SITE ALL WEEKEND · SAUNA
          </motion.p>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] lg:text-[3.2rem] leading-[1.05] tracking-tight uppercase mb-6"
            style={{ ...typography.headline, color: COLORS.charcoal }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Our Sauna Partners
          </motion.h2>
          <motion.p
            className="max-w-2xl"
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1rem', lineHeight: 1.65 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Hand-picked operators bringing their craft and their rituals to the river. No spa-day theatrics — just wood-fired heat, cold water, and the people who do this best.
          </motion.p>
        </div>
      </section>

      {/* ===== SAUNA VENDOR GRID ===== */}
      <section className="px-6 pb-20 md:pb-24" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {saunaPartners.map((vendor, idx) => (
            <VendorCard key={vendor.slug} vendor={vendor} idx={idx} />
          ))}
        </div>
      </section>

      {/* ===== SOUND BATH SECTION INTRO ===== */}
      {soundBathPartners.length > 0 && (
        <>
          <section className="relative pt-16 md:pt-20 pb-10 md:pb-14 px-6" style={{ backgroundColor: COLORS.dustySky }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 max-w-4xl mx-auto">
              <motion.p
                style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
                variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                BETWEEN SETS · SOUND BATH
              </motion.p>
              <motion.h2
                className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] lg:text-[3.2rem] leading-[1.05] tracking-tight uppercase mb-6"
                style={{ ...typography.headline, color: COLORS.charcoal }}
                variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                Sound Meditation
              </motion.h2>
              <motion.p
                className="max-w-2xl"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1rem', lineHeight: 1.65 }}
                variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                Gongs, crystal bowls, and overtone instruments — long communal sessions tucked between music sets. Lay back, close your eyes, let the room slow down around you.
              </motion.p>
            </div>
          </section>

          <section className="px-6 pb-20 md:pb-28" style={{ backgroundColor: COLORS.dustySky }}>
            <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {soundBathPartners.map((vendor, idx) => (
                <VendorCard key={vendor.slug} vendor={vendor} idx={idx} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ===== TICKET CTA ===== */}
      <section className="relative min-h-[50vh] flex items-center justify-center px-6 py-20" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 text-center max-w-2xl">
          <motion.h2
            className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight uppercase mb-6"
            style={{ ...typography.headline, color: COLORS.dustySky }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Sweat with us<br />in May
          </motion.h2>
          <motion.p
            className="mb-10"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1rem', lineHeight: 1.65, opacity: 0.85 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            700 people. Three days. Steam at sunset, cold water, and a community waiting on the other side.
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
              to="/experience"
              className="inline-block px-10 py-4 hover:opacity-80 transition-opacity"
              style={{ ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, fontSize: '13px', letterSpacing: '0.05em', border: `1px solid ${COLORS.dustySky}60` }}
            >
              The Experience
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Sauna;
