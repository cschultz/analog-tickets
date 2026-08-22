import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, heavyGrain } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";

import heroImage from "@/assets/may/crowd-golden.webp";
import festivalMap from "@/assets/analog-reunion-map.png";

interface QA {
  q: string;
  a: string;
  cta?: string;
  href?: string;
  external?: boolean;
}

const clusters: { label: string; questions: QA[] }[] = [
  {
    label: "Before You Leave",
    questions: [
      {
        q: "Where are my tickets?",
        a: "Your QR codes go out by email 7 days before gates open. Check spam if you don't see them. You can also pull them up anytime from My Tickets — and add them to Apple Wallet for the fastest gate scan.",
        cta: "Open my tickets",
        href: "/my-tickets",
      },
      {
        q: "What should I pack?",
        a: "Layers (warm days, cool nights), a refillable water bottle, sunscreen, a hat, comfortable shoes for walking the grounds, and a swimsuit + towel if you're hitting the sauna or river. Staying on site? Your glamping tent or cabin is fully set up — just pack for your stay.",
      },
      {
        q: "What's the weather looking like?",
        a: "Example County in May: warm afternoons (70s–80s), crisp evenings (50s). Plan for both. No rain in the forecast, but check the day before you head out.",
        cta: "Check the forecast",
        href: "https://www.google.com/search?q=weather+Example Valley+CA+May+15-17",
        external: true,
      },
      {
        q: "Do I need to bring an ID?",
        a: "Must be 21 and over to drink alcohol. Please bring a valid ID.",
      },
      {
        q: "Can I bring a chair?",
        a: "Yes — both high-back and low-back chairs are welcome. They must be set up in the designated chair area so sightlines stay clear in the main standing and dance zones near the stage.",
      },
    ],
  },
  {
    label: "Getting In",
    questions: [
      {
        q: "When do gates open?",
        a: "Friday: stay on site opens at 3:00 PM. Saturday and Sunday: gates open at 1:00 PM. Plan to arrive earlier than you think — the first hour gets busy. Check the schedule for doors and set times.",
        cta: "See the schedule",
        href: "/schedule",
      },
      {
        q: "When should I actually arrive?",
        a: "Early and on time. There is a lot of great programming during the day — please don't miss the Friday opening ceremony or the Saturday daytime activities. Arriving early also gets you the best parking and the easiest check-in.",
        cta: "See the schedule",
        href: "/schedule",
      },
      {
        q: "Where do I park?",
        a: "Two offsite lots with continuous shuttles to the gate. Lot 1 (Eggstand) fills first, then Lot 2 (Acta Wine) opens. Both are ~5 minutes from Example Meadow. Free parking, free shuttles, both directions — shuttles run until one hour after the main stage closes. All lots are first-come, first-served — parking is at a premium and no spaces are reserved, so the best move is to arrive early.",
        cta: "Parking + shuttle map",
        href: "/getting-here",
      },
      {
        q: "Can I get dropped off?",
        a: "Yes — Uber, Lyft, or a friend can drop you at the front gate. Have them follow signs to the rideshare loop, not the parking lots.",
        cta: "See drop-off details",
        href: "/getting-here",
      },
      {
        q: "How does check-in work?",
        a: "Walk up to the box office with your QR code (Apple Wallet or email). One scan per ticket — we'll wristband you on the spot. If you bought multiple tickets, your whole group can check in together or separately.",
      },
      {
        q: "Where is medical / first aid?",
        a: "On-site medical is at the Medic tent, located right inside the gates as you come through check-in. If you or someone near you needs help, find any staff member or head straight to the Medic tent.",
      },
    ],
  },
  {
    label: "While You're There",
    questions: [
      {
        q: "What's the schedule?",
        a: "Three days, one slow arc — doors, music, food, sauna, and the spaces in between. Sets run from afternoon into late night.",
        cta: "See the full schedule",
        href: "/schedule",
      },
      {
        q: "Where do I eat?",
        a: "Curated food vendors are open all weekend. Friday's Long Table Dinner is ticketed — if you're in, your seat is held. Coffee starts early, late-night bites run after the last set.",
        cta: "See the food lineup",
        href: "/eat",
      },
      {
        q: "How do I pay at the bars and merch?",
        a: "We run a mostly cashless festival. Bars and festival merch are credit card only — please make sure you bring a card. Apple Pay works too.",
      },
      {
        q: "How does the sauna and river work?",
        a: "Sauna Village runs all weekend. Walk up, grab a slot, hot–cold–repeat. If you're hitting the river party, the sauna, or a river dip, bring a bathing suit. Bring your own towel for the river — shower towels are provided on site, but you'll want a separate one for down by the water. River entry and swimming are strictly at your own risk — there are no lifeguards on site, and children must be supervised at all times by the river.",
        cta: "See the sauna village",
        href: "/sauna",
      },
      {
        q: "Where's my lodging?",
        a: "Your glamping tent or cabin is set up and ready when you arrive. Check in with Example Meadow on site — they'll show you to your spot. One car per glamping reservation can park outside. Your reservation is in My Tickets if you need to look it up.",
        cta: "View my lodging",
        href: "/my-tickets",
      },
      {
        q: "What's it like staying on site at Example Meadow?",
        a: "Example Meadow sits on a beautiful stretch of the Example River in Example Valley. Tents are extra-large safari-style canvas with real beds, heated mattress pads, electricity, and heaters. Cabins add AC, heat, skylights, and better sound insulation. There's a shared shower house — tents and cabins do not have their own shower, and shower towels are provided. You'll also have private river access, communal fire pits, shared BBQs, a camp store, and WiFi. Bathrobes are welcome. Please review everything on the Example Meadow site before you arrive.",
        cta: "Visit Example Meadow",
        href: "https://example.org/venue",
        external: true,
      },
      {
        q: "Are the tents lockable? What about valuables?",
        a: "The tents do not have locks. Please leave valuables at home — bring only what you'd be comfortable not leaving in your tent during the day.",
      },
      {
        q: "Can I bring kids?",
        a: "Yes — kids 0–12 are free with an adult, and Kids Camp runs Saturday during the day. Youth (13–17) need their own ticket.",
      },
    ],
  },
  {
    label: "If You Need Help",
    questions: [
      {
        q: "I lost my ticket / can't find my QR.",
        a: "Open My Tickets with the email you bought with — your QRs are always there. If something's still off, email us and we'll fix it before the gate.",
        cta: "Open my tickets",
        href: "/my-tickets",
      },
      {
        q: "I need to transfer a ticket to someone else.",
        a: "You can reassign any unused ticket from My Tickets — they'll get their own QR by email. Do this before you arrive so check-in is smooth.",
        cta: "Manage tickets",
        href: "/my-tickets",
      },
      {
        q: "I have a question that's not here.",
        a: "Email hello@example.org — we read everything and respond fast in the week leading up to the festival.",
        cta: "Email us",
        href: "mailto:hello@example.org",
        external: true,
      },
    ],
  },
];

const AlmostHere = () => {
  usePageMeta({
    title: "One Week Out — Cosmico 2026",
    description: "Everything you need before you head to Cosmico. Tickets, what to pack, gate times, parking, shuttles, and what to expect on the ground.",
  });
  useCanonicalUrl('/almost-here');

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO ===== */}
      <section className="relative min-h-[70vh] md:min-h-[80vh] flex items-end overflow-hidden">
        <img
          src={heroImage}
          alt="Golden hour at Cosmico"
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
            ONE WEEK OUT · MAY 14–16
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2.5rem, 6vw, 5.25rem)', lineHeight: 1.0, marginBottom: '24px' }}
          >
            You're<br />almost<br />there.
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1.05rem', lineHeight: 1.6, opacity: 0.9, maxWidth: '34rem' }}
          >
            Everything you need for the week before — your tickets, what to pack, when gates open, where to park, and what to expect when you walk in.
          </motion.p>
        </motion.div>
      </section>

      {/* ===== Q&A CLUSTERS ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto space-y-20 md:space-y-28">
          {clusters.map((cluster, ci) => (
            <motion.div
              key={cluster.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: 0.05 }}
            >
              <p
                style={{
                  ...typography.caption,
                  color: COLORS.clay,
                  letterSpacing: '0.18em',
                  fontSize: '10px',
                  marginBottom: '24px',
                }}
              >
                {String(ci + 1).padStart(2, '0')} · {cluster.label.toUpperCase()}
              </p>

              <div className="space-y-10 md:space-y-12">
                {cluster.questions.map((qa) => (
                  <div key={qa.q}>
                    <h3
                      style={{
                        ...typography.headline,
                        color: COLORS.charcoal,
                        fontSize: 'clamp(1.4rem, 2.6vw, 1.85rem)',
                        lineHeight: 1.15,
                        marginBottom: '12px',
                        textTransform: 'none',
                      }}
                    >
                      {qa.q}
                    </h3>
                    <p
                      style={{
                        ...typography.body,
                        color: COLORS.charcoal,
                        fontSize: '1.02rem',
                        lineHeight: 1.6,
                        opacity: 0.85,
                        marginBottom: qa.cta ? '14px' : '0',
                      }}
                    >
                      {qa.a}
                    </p>
                    {qa.cta && qa.href && (qa.external ? (
                      <a
                        href={qa.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block hover:opacity-70 transition-opacity"
                        style={{
                          ...typography.caption,
                          color: COLORS.clay,
                          fontSize: '10px',
                          letterSpacing: '0.14em',
                          borderBottom: `1px solid ${COLORS.clay}`,
                          paddingBottom: '3px',
                        }}
                      >
                        {qa.cta.toUpperCase()} →
                      </a>
                    ) : (
                      <Link
                        to={qa.href}
                        className="inline-block hover:opacity-70 transition-opacity"
                        style={{
                          ...typography.caption,
                          color: COLORS.clay,
                          fontSize: '10px',
                          letterSpacing: '0.14em',
                          borderBottom: `1px solid ${COLORS.clay}`,
                          paddingBottom: '3px',
                        }}
                      >
                        {qa.cta.toUpperCase()} →
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative px-6 py-16 md:py-20" style={{ backgroundColor: COLORS.dustySky }} id="venue-map">
        <FilmGrainOverlay opacity={0.28} />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="mb-8 md:mb-10 max-w-2xl">
            <p style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.18em', fontSize: '10px', marginBottom: '16px' }}>
              FESTIVAL MAP
            </p>
            <h2 style={{ ...typography.headline, color: COLORS.charcoal, fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.05 }}>
              Know the grounds before you arrive.
            </h2>
            <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.82, fontSize: '1rem', lineHeight: 1.65, marginTop: '14px' }}>
              Stages, Wine Camp, Sauna Village, food vendors, lodging, the box office, and shuttle drop — all in one place. Save the map to your phone before you head out.
            </p>
          </div>

          <a
            href={festivalMap}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-[8px] hover:opacity-95 transition-opacity"
            style={{ border: `1px solid ${COLORS.charcoal}14`, boxShadow: `0 16px 40px -28px ${COLORS.charcoal}45` }}
          >
            <img
              src={festivalMap}
              alt="Cosmico festival map at Example Meadow with stages, camping areas, Wine Camp, Sauna Village, and river access"
              loading="lazy"
              className="w-full h-auto"
            />
          </a>

          <div className="mt-4">
            <a href={festivalMap} target="_blank" rel="noreferrer" className="inline-block hover:opacity-70 transition-opacity" style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.14em', borderBottom: `1px solid ${COLORS.clay}`, paddingBottom: '3px' }}>
              OPEN FULL MAP →
            </a>
          </div>
        </div>
      </section>

      {/* ===== CLOSING / CTA ===== */}
      <section className="relative px-6 py-24 md:py-32" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <motion.p
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.18em', fontSize: '10px', marginBottom: '28px' }}
          >
            SEE YOU SOON.
          </motion.p>
          <motion.h2
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="mb-8"
            style={{
              ...typography.headline,
              color: COLORS.dustySky,
              fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
              lineHeight: 1.05,
            }}
          >
            Pack the bag.<br />Pull up the tickets.
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="mb-12"
            style={{
              ...typography.body,
              color: COLORS.dustySky,
              fontSize: '1.05rem',
              lineHeight: 1.6,
              opacity: 0.85,
            }}
          >
            We've taken care of the rest.<br />
            All you have to do is show up.
          </motion.p>
          <motion.div
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to="/my-tickets"
              className="inline-block px-12 py-5 hover:opacity-90 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: '13px',
                letterSpacing: '0.05em',
              }}
            >
              Open My Tickets
            </Link>
            <Link
              to="/schedule"
              className="inline-block px-10 py-5 hover:opacity-90 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.dustySky,
                border: `1px solid ${COLORS.dustySky}66`,
                fontSize: '13px',
                letterSpacing: '0.05em',
              }}
            >
              See the Schedule
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default AlmostHere;
