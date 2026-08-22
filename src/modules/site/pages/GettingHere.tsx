import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, heavyGrain } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";

import heroImage from "@/assets/may/crowd-golden.webp";
import ShuttleMap from "@/components/may/ShuttleMap";

const PARKING_LOTS = [
  {
    priority: "1",
    name: "Eggstand Inc",
    note: "Fills first",
    address: "184 Alexander Valley Rd, Example Valley, CA 95448",
    mapsUrl: "https://maps.app.goo.gl/t9hZfhydPJxmrjVT9",
    accent: "clay" as const,
  },
  {
    priority: "2",
    name: "Acta Wine",
    note: "Overflow lot — opens once Lot 1 is full",
    address: "7505 CA-128, Example Valley, CA 95448",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Acta+Wines+7505+CA-128+Example Valley+CA+95448",
    accent: "mustard" as const,
  },
];

const otherModes = [
  {
    label: "Rideshare",
    title: "Uber & Lyft",
    body: "Drop-off and pick-up right at the venue. The easiest way in and out.",
  },
  {
    label: "Bike",
    title: "Pedal in",
    body: "Free bike parking on-site. Example Valley to Example Meadow is a short, scenic ride.",
  },
];


const GettingHere = () => {
  usePageMeta({
    title: "Getting Here — Cosmico 2026",
    description: "How to get to Example Meadow — five minutes north of Example Valley. Rideshare, bike, drive. We've made all of it easy.",
  });
  useCanonicalUrl('/getting-here');

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO ===== */}
      <section className="relative min-h-[65vh] md:min-h-[75vh] flex items-end overflow-hidden">
        <img
          src={heroImage}
          alt="The road to Example Meadow"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 55%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.18, mixBlendMode: 'overlay' }} />

        <motion.div
          className="relative z-10 w-full px-6 md:px-12 lg:px-16 pb-16 md:pb-24 max-w-3xl"
          initial="hidden"
          animate="visible"
        >
          <motion.p
            variants={fadeInUp}
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.18em', fontSize: '10px', marginBottom: '24px' }}
          >
            GETTING HERE
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2rem, 4.5vw, 3.75rem)', lineHeight: 1.05, marginBottom: '24px' }}
          >
            Five minutes<br />north of<br />Example Valley.
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1.05rem', lineHeight: 1.6, opacity: 0.9, maxWidth: '34rem' }}
          >
            Example Meadow sits just up the road from town — close enough to be easy, far enough to feel like somewhere else entirely.
          </motion.p>
        </motion.div>
      </section>

      {/* ===== MAIN CONTENT (unified background) ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto">
          {/* 01 · THE LOOP — short intro */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p
              style={{
                ...typography.caption,
                color: COLORS.clay,
                letterSpacing: '0.18em',
                fontSize: '10px',
                marginBottom: '16px',
              }}
            >
              01 · THE LOOP
            </p>
            <h2
              style={{
                ...typography.headline,
                color: COLORS.charcoal,
                fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
                lineHeight: 1.1,
                marginBottom: '16px',
                textTransform: 'none',
              }}
            >
              Drop. Park. Shuttle. Repeat.
            </h2>
            <p
              style={{
                ...typography.body,
                color: COLORS.charcoal,
                fontSize: '1.05rem',
                lineHeight: 1.65,
                opacity: 0.85,
              }}
            >
              Pull up to Example Meadow, drop your people at the gate, then drive five minutes to one of two offsite lots and shuttle back. Prefer to park first and shuttle in together? Also fine. Free parking, free shuttles, continuous loop both directions — and it reverses at the end of the night to bring you back to your car.
            </p>
          </motion.div>

          {/* Divider */}
          <div
            className="my-16 md:my-20"
            style={{ height: '1px', backgroundColor: COLORS.charcoal, opacity: 0.15 }}
          />

          {/* THE MAP + LOTS */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <p
              style={{
                ...typography.caption,
                color: COLORS.clay,
                letterSpacing: '0.18em',
                fontSize: '10px',
                marginBottom: '16px',
              }}
            >
              02 · PARKING & SHUTTLE
            </p>
            <h2
              style={{
                ...typography.headline,
                color: COLORS.charcoal,
                fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
                lineHeight: 1.1,
                marginBottom: '24px',
                textTransform: 'none',
              }}
            >
              Two lots, one venue, a five-minute ride.
            </h2>

            <div
              className="mb-4"
              style={{
                backgroundColor: COLORS.white,
                padding: '20px',
                border: `2px solid ${COLORS.charcoal}`,
                boxShadow: `8px 8px 0 ${COLORS.clay}30`,
              }}
            >
              <ShuttleMap />
            </div>

            {/* Quick legend strip */}
            <div
              className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2"
              style={{
                ...typography.caption,
                color: COLORS.charcoal,
                fontSize: '10px',
                letterSpacing: '0.14em',
                opacity: 0.8,
              }}
            >
              <span className="inline-flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.charcoal, display: 'inline-block' }} />
                EXAMPLE MEADOW — VENUE
              </span>
              <span className="inline-flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.clay, display: 'inline-block' }} />
                LOT 1 — EGGSTAND (~5 MIN)
              </span>
              <span className="inline-flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.mustard, display: 'inline-block' }} />
                LOT 2 — ACTA WINE (~5 MIN)
              </span>
            </div>

            {/* Collapsible Google Map */}
            <details
              className="mb-8 group"
              style={{
                backgroundColor: COLORS.white,
                border: `1px solid ${COLORS.charcoal}20`,
              }}
            >
              <summary
                className="cursor-pointer list-none flex items-center justify-between px-5 py-4 hover:opacity-80 transition-opacity"
                style={{
                  ...typography.caption,
                  color: COLORS.charcoal,
                  fontSize: '11px',
                  letterSpacing: '0.16em',
                }}
              >
                <span>VIEW ON GOOGLE MAPS</span>
                <span
                  className="group-open:rotate-180 transition-transform"
                  style={{ fontSize: '10px', opacity: 0.6 }}
                >
                  ▼
                </span>
              </summary>
              <div style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
                <iframe
                  title="Example Meadow & shuttle parking lots"
                  src="https://www.google.com/maps?q=Example Meadow+Example Valley+Example Valley+CA&z=13&output=embed"
                  width="100%"
                  height="380"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Example Meadow+Example Valley+Example Valley+CA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center hover:opacity-80 transition-opacity"
                  style={{
                    ...typography.caption,
                    backgroundColor: COLORS.charcoal,
                    color: COLORS.dustySky,
                    fontSize: '11px',
                    letterSpacing: '0.16em',
                    padding: '14px',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                  }}
                >
                  Get directions to Example Meadow →
                </a>
              </div>
            </details>

            <p
              style={{
                ...typography.body,
                color: COLORS.charcoal,
                fontSize: '1rem',
                lineHeight: 1.65,
                opacity: 0.85,
                marginBottom: '32px',
              }}
            >
              We'll fill <strong>Lot 1 (Eggstand)</strong> first. Once it reaches capacity, parking opens at <strong>Lot 2 (Acta Wine)</strong>. Both lots are roughly five minutes from Example Meadow, with shuttles running a continuous loop in both directions — and reversing at the end of the night to bring you back to your car.
            </p>

            {/* Lot cards */}
            <div className="grid md:grid-cols-2 gap-4 md:gap-5">
              {PARKING_LOTS.map((lot) => (
                <a
                  key={lot.priority}
                  href={lot.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group hover:opacity-90 transition-opacity"
                  style={{
                    backgroundColor: COLORS.white,
                    padding: '24px',
                    border: `1px solid ${COLORS.charcoal}20`,
                    textDecoration: 'none',
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: lot.accent === 'clay' ? COLORS.clay : COLORS.mustard,
                        color: lot.accent === 'clay' ? COLORS.dustySky : COLORS.charcoal,
                        fontFamily: 'Georgia, serif',
                        fontWeight: 'bold',
                        fontSize: '14px',
                      }}
                    >
                      {lot.priority}
                    </span>
                    <p
                      style={{
                        ...typography.caption,
                        color: COLORS.clay,
                        fontSize: '10px',
                        letterSpacing: '0.14em',
                        margin: 0,
                      }}
                    >
                      {lot.note}
                    </p>
                  </div>
                  <h3
                    style={{
                      ...typography.headline,
                      color: COLORS.charcoal,
                      fontSize: '1.35rem',
                      lineHeight: 1.2,
                      marginBottom: '6px',
                      textTransform: 'none',
                    }}
                  >
                    {lot.name}
                  </h3>
                  <p
                    style={{
                      ...typography.body,
                      color: COLORS.charcoal,
                      fontSize: '0.95rem',
                      lineHeight: 1.5,
                      opacity: 0.75,
                      marginBottom: '14px',
                    }}
                  >
                    {lot.address}
                  </p>
                  <span
                    style={{
                      ...typography.caption,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: COLORS.charcoal,
                      color: COLORS.dustySky,
                      fontSize: '11px',
                      letterSpacing: '0.16em',
                      padding: '10px 16px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Get directions →
                  </span>
                </a>
              ))}
            </div>

            {/* Shuttle hours strip */}
            <div
              className="mt-8 p-5"
              style={{
                backgroundColor: `${COLORS.charcoal}08`,
                borderLeft: `3px solid ${COLORS.clay}`,
              }}
            >
              <p
                style={{
                  ...typography.caption,
                  color: COLORS.clay,
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  marginBottom: '6px',
                }}
              >
                SHUTTLE HOURS
              </p>
              <p
                style={{
                  ...typography.body,
                  color: COLORS.charcoal,
                  fontSize: '1rem',
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                Continuous loop from <strong>gates open through ~1 hour after the last set</strong> each day (roughly 3:00 PM – 1:00 AM). Drop-off, parking, and return — all on the same loop.
              </p>
            </div>
          </motion.div>

          {/* Divider */}
          <div
            className="my-16 md:my-20"
            style={{ height: '1px', backgroundColor: COLORS.charcoal, opacity: 0.15 }}
          />

          {/* 03 · OTHER WAYS IN — compact grid */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <p
              style={{
                ...typography.caption,
                color: COLORS.clay,
                letterSpacing: '0.18em',
                fontSize: '10px',
                marginBottom: '16px',
              }}
            >
              03 · OTHER WAYS IN
            </p>
            <h2
              style={{
                ...typography.headline,
                color: COLORS.charcoal,
                fontSize: 'clamp(1.5rem, 2.8vw, 2rem)',
                lineHeight: 1.15,
                marginBottom: '24px',
                textTransform: 'none',
              }}
            >
              Skipping the car?
            </h2>
            <div className="grid md:grid-cols-2 gap-5">
              {otherModes.map((mode) => (
                <div
                  key={mode.label}
                  style={{
                    backgroundColor: COLORS.white,
                    padding: '22px',
                    border: `1px solid ${COLORS.charcoal}20`,
                  }}
                >
                  <p
                    style={{
                      ...typography.caption,
                      color: COLORS.clay,
                      letterSpacing: '0.14em',
                      fontSize: '10px',
                      marginBottom: '8px',
                      opacity: 0.85,
                    }}
                  >
                    {mode.label.toUpperCase()}
                  </p>
                  <h3
                    style={{
                      ...typography.headline,
                      color: COLORS.charcoal,
                      fontSize: '1.25rem',
                      lineHeight: 1.2,
                      marginBottom: '8px',
                      textTransform: 'none',
                    }}
                  >
                    {mode.title}
                  </h3>
                  <p
                    style={{
                      ...typography.body,
                      color: COLORS.charcoal,
                      fontSize: '0.95rem',
                      lineHeight: 1.55,
                      opacity: 0.8,
                      margin: 0,
                    }}
                  >
                    {mode.body}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Divider */}
          <div
            className="my-16 md:my-20"
            style={{ height: '1px', backgroundColor: COLORS.charcoal, opacity: 0.15 }}
          />

          {/* PARKING POLICY — inline */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <p
              style={{
                ...typography.caption,
                color: COLORS.clay,
                letterSpacing: '0.18em',
                fontSize: '10px',
                marginBottom: '16px',
              }}
            >
              04 · A NOTE ON PARKING
            </p>
            <h2
              style={{
                ...typography.headline,
                color: COLORS.charcoal,
                fontSize: 'clamp(1.6rem, 3vw, 2.25rem)',
                lineHeight: 1.15,
                marginBottom: '16px',
                textTransform: 'none',
              }}
            >
              On-site parking is for stay-on-site guests only.
            </h2>
            <p
              style={{
                ...typography.body,
                color: COLORS.charcoal,
                fontSize: '1.05rem',
                lineHeight: 1.65,
                opacity: 0.85,
              }}
            >
              If you're staying on the property, you park on the property. Single-day and all other ticket holders use the offsite lots and shuttle in — same easy loop, same short ride.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative px-6 py-24 md:py-28" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <motion.p
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.18em', fontSize: '10px', marginBottom: '24px' }}
          >
            THAT'S IT.
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="mb-10"
            style={{
              ...typography.headline,
              color: COLORS.dustySky,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              lineHeight: 1.05,
            }}
          >
            Get yourself here.<br />We'll handle the rest.
          </motion.h2>
          <motion.div
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <Link
              to="/tickets"
              className="inline-block px-12 py-5 hover:opacity-90 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: '13px',
                letterSpacing: '0.05em',
              }}
            >
              Grab Your Spot
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default GettingHere;
