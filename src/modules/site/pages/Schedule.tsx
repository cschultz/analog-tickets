import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";



interface Block {
  time: string;
  title: string;
  detail?: string;
}

interface Day {
  label: string;
  date: string;
  intro: string;
  blocks: Block[];
}

const days: Day[] = [
  {
    label: "Friday",
    date: "May 15",
    intro: "A long, slow ramp into the weekend. Doors at 4. First notes at 6. Communal dinner at 7. By the time the sun's down, you'll already feel like you've been here for days.",
    blocks: [
      { time: "3:00 PM", title: "On-site check-in opens", detail: "For guests staying at Example Meadow." },
      { time: "3:00 – 6:00 PM", title: "Sauna & wellness" },
      { time: "4:00 PM", title: "Festival doors open" },
      { time: "4:00 – 10:00 PM", title: "Shuttle service running", detail: "Continuous loops to and from the offsite lots." },
      { time: "4:00 – 9:30 PM", title: "Bars open", detail: "GA + VIP" },
      { time: "5:00 PM", title: "Food service opens" },
      { time: "5:45 PM", title: "Opening ceremony", detail: "Land acknowledgment + calling the directions." },
      { time: "5:00 – 6:00 PM", title: "Reed Foehl", detail: "Main stage." },
      { time: "6:00 – 7:00 PM", title: "Particle Kid", detail: "Main stage — Micah Nelson's psychedelic-folk project." },
      { time: "7:00 PM", title: "Field Day Dinner", detail: "Communal picnic-table dinner — opening-night ramen by Naomi McLeod (Field Day + Creative)." },
      { time: "7:10 – 7:55 PM", title: "Timoteo Giganté — DJ set", detail: "Dinner soundtrack." },
      { time: "7:55 – 8:55 PM", title: "Mood Swing", detail: "Main stage." },
      { time: "9:00 – 10:30 PM", title: "Gilligan Moss", detail: "Main stage — closing the night." },
    ],
  },
  {
    label: "Saturday",
    date: "May 16",
    intro: "The full arc of a day in wine country. Coffee on the deck, sauna in the morning, Wine Camp in the afternoon, headliners at golden hour, and Jeremy Sole holding it down past midnight.",
    blocks: [
      { time: "8:00 – 10:00 AM", title: "Coffee + grab-and-go breakfast", detail: "Bodega Deck — acoustic pop-up performances." },
      { time: "8:00 AM – 3:00 PM", title: "Sauna & wellness" },
      { time: "1:00 PM", title: "Doors open" },
      { time: "1:00 – 8:00 PM", title: "Food service" },
      { time: "1:00 – 8:00 PM", title: "White Sage Marketplace" },
      { time: "1:00 – 4:00 PM", title: "Wine Camp", detail: "Independent Example Valley winemakers, pouring what they love right now." },
      { time: "1:00 – 5:00 PM", title: "Kids Camp", detail: "Guided art and nature play." },
      { time: "1:00 – 4:00 PM", title: "Aperol Day Party" },
      { time: "3:00 – 10:30 PM", title: "GA Bar open" },
      { time: "4:00 – 5:00 PM", title: "Broken Compass Bluegrass", detail: "Main stage." },
      { time: "5:00 – 10:30 PM", title: "VIP Bar open" },
      { time: "5:20 – 6:25 PM", title: "Maggie Koerner", detail: "Main stage." },
      { time: "6:45 – 8:15 PM", title: "Alex Amen", detail: "Main stage." },
      { time: "8:40 – 10:30 PM", title: "The Heavy Heavy", detail: "Headliner, main stage." },
      { time: "10:30 PM", title: "Jeremy Sole — Afters", detail: "Late-night dancing." },
    ],
  },
  {
    label: "Sunday",
    date: "May 17",
    intro: "VIP-only Sunday. A smaller, more personal closer — sauna in the morning, an acoustic Heavy Heavy set in the afternoon, and Starboro sending the weekend off into golden hour.",
    blocks: [
      { time: "8:00 – 11:00 AM", title: "Sauna open" },
      { time: "11:00 AM", title: "Guest checkout", detail: "For on-site stays." },
      { time: "1:00 PM", title: "Doors open", detail: "VIP party at secret location." },
      { time: "1:00 – 4:00 PM", title: "Pizza service" },
      { time: "1:30 – 3:00 PM", title: "Champagne + cheese tasting" },
      { time: "1:35 – 2:50 PM", title: "Estero", detail: "Main stage." },
      { time: "3:20 – 4:20 PM", title: "The Heavy Heavy — Acoustic", detail: "Main stage." },
      { time: "4:50 – 6:30 PM", title: "Starboro", detail: "Festival closing set." },
      { time: "6:30 PM", title: "Festival close" },
    ],
  },
];

// At-a-glance grid (lightly condensed)
const grid = {
  Friday: [
    ["3:00 PM", "Example Meadow check-in opens"],
    ["4:00 PM", "Doors open"],
    ["5:00 PM", "Food opens"],
    ["5:45 PM", "Opening ceremony"],
    ["5:00 PM", "Reed Foehl"],
    ["6:00 PM", "Particle Kid"],
    ["7:00 PM", "Field Day Dinner"],
    ["7:10 PM", "Timoteo Giganté DJ"],
    ["7:55 PM", "Mood Swing"],
    ["9:00 PM", "Gilligan Moss"],
  ],
  Saturday: [
    ["8:00 AM", "Coffee + breakfast + sauna open"],
    ["1:00 PM", "Doors / Wine Camp / Kids Camp / Aperol Day Party"],
    ["4:00 PM", "Broken Compass Bluegrass"],
    ["5:20 PM", "Maggie Koerner"],
    ["6:45 PM", "Alex Amen"],
    ["8:40 PM", "The Heavy Heavy"],
    ["10:30 PM", "Jeremy Sole — Afters"],
  ],
  Sunday: [
    ["1:00 PM", "Doors / VIP secret location"],
    ["1:35 PM", "Estero"],
    ["3:20 PM", "The Heavy Heavy (acoustic)"],
    ["4:50 PM", "Starboro"],
    ["6:30 PM", "Festival close"],
  ],
};

const Schedule = () => {
  usePageMeta({
    title: "Schedule — Cosmico 2026",
    description: "The full guest schedule for Cosmico 2026. Friday, Saturday, Sunday — music, food, wine, sauna, and everything in between.",
  });
  useCanonicalUrl('/schedule');

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO: AT-A-GLANCE GRID ===== */}
      <section className="relative pt-32 md:pt-40 pb-20 md:pb-24 px-6" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-5xl mx-auto">
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.18em', fontSize: '10px', marginBottom: '20px' }}
          >
            SCHEDULE · MAY 14–16
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{
              ...typography.headline,
              color: COLORS.dustySky,
              fontSize: 'clamp(2rem, 4.5vw, 3.5rem)',
              lineHeight: 1.05,
              marginBottom: '14px',
            }}
          >
            Three days. Here's when.
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1rem', lineHeight: 1.6, opacity: 0.75, marginBottom: '48px', maxWidth: '34rem' }}
          >
            The whole weekend at a glance — scroll for the full day-by-day below.
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            {(Object.keys(grid) as Array<keyof typeof grid>).map((dayName) => (
              <motion.div
                key={dayName}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <p
                  style={{
                    ...typography.caption,
                    color: COLORS.mustard,
                    letterSpacing: '0.16em',
                    fontSize: '10px',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: `1px solid ${COLORS.mustard}40`,
                  }}
                >
                  {dayName.toUpperCase()}{dayName === 'Sunday' ? ' · VIP ONLY' : ''}
                </p>
                <div className="space-y-3">
                  {grid[dayName].map(([time, label], i) => (
                    <div key={i} className="grid grid-cols-[90px_1fr] gap-3">
                      <span style={{ ...typography.body, color: COLORS.mustard, fontSize: '0.85rem', opacity: 0.9 }}>
                        {time}
                      </span>
                      <span style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.9rem', opacity: 0.95 }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{
              ...typography.body,
              color: COLORS.dustySky,
              fontSize: '0.8rem',
              opacity: 0.55,
              marginTop: '40px',
              textAlign: 'center',
            }}
          >
            Times subject to change. Final schedule shared with ticket holders the week of the event.
          </motion.p>
        </div>
      </section>

      {/* ===== NARRATIVE DAY-BY-DAY ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto space-y-20 md:space-y-28">
          {days.map((day, di) => (
            <motion.div
              key={day.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
            >
              <p
                style={{
                  ...typography.caption,
                  color: COLORS.clay,
                  letterSpacing: '0.18em',
                  fontSize: '10px',
                  marginBottom: '12px',
                }}
              >
                {String(di + 1).padStart(2, '0')} · {day.label.toUpperCase()} · {day.date.toUpperCase()}
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
                {day.label}
              </h2>
              <p
                style={{
                  ...typography.body,
                  color: COLORS.charcoal,
                  fontSize: '1.05rem',
                  lineHeight: 1.65,
                  opacity: 0.85,
                  marginBottom: '40px',
                  maxWidth: '38rem',
                }}
              >
                {day.intro}
              </p>

              <div className="space-y-6">
                {day.blocks.map((block, bi) => (
                  <div
                    key={bi}
                    className="grid grid-cols-[110px_1fr] md:grid-cols-[160px_1fr] gap-4 md:gap-6 pb-6"
                    style={{ borderBottom: `1px solid ${COLORS.charcoal}15` }}
                  >
                    <div
                      style={{
                        ...typography.caption,
                        color: COLORS.clay,
                        fontSize: '11px',
                        letterSpacing: '0.08em',
                        paddingTop: '4px',
                      }}
                    >
                      {block.time}
                    </div>
                    <div>
                      <h3
                        style={{
                          ...typography.subhead,
                          color: COLORS.charcoal,
                          fontSize: '1.05rem',
                          lineHeight: 1.3,
                          marginBottom: block.detail ? '6px' : 0,
                        }}
                      >
                        {block.title}
                      </h3>
                      {block.detail && (
                        <p
                          style={{
                            ...typography.body,
                            color: COLORS.charcoal,
                            fontSize: '0.95rem',
                            lineHeight: 1.55,
                            opacity: 0.75,
                          }}
                        >
                          {block.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>


      {/* ===== CTA ===== */}
      <section className="relative px-6 py-24 md:py-28" style={{ backgroundColor: COLORS.clay }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <motion.h2
            variants={fadeInUp}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="mb-10"
            style={{
              ...typography.headline,
              color: COLORS.white,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              lineHeight: 1.05,
            }}
          >
            That's the weekend.<br />Now grab your spot.
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
                backgroundColor: COLORS.charcoal,
                color: COLORS.white,
                fontSize: '13px',
                letterSpacing: '0.05em',
              }}
            >
              Get Tickets
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Schedule;
