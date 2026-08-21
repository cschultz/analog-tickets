import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";

// Campaign closes Wednesday March 11, 2026 at 5 PM PT
const CAMPAIGN_END = new Date("2026-03-11T17:00:00-07:00");

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { hours, minutes, seconds, expired: diff === 0 };
}

const Digit = ({ value, label }: { value: number; label: string }) => (
  <div className="text-center">
    <span
      className="text-xl md:text-2xl font-mono tabular-nums"
      style={{ ...typography.headline, color: COLORS.mustard }}
    >
      {String(value).padStart(2, "0")}
    </span>
    <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: COLORS.boulder }}>
      {label}
    </p>
  </div>
);

const CrewPromoBanner = () => {
  const { hours, minutes, seconds, expired } = useCountdown(CAMPAIGN_END);

  if (expired) return null;

  return (
    <section className="relative py-8 md:py-10" style={{ backgroundColor: COLORS.charcoal }}>
      <FilmGrainOverlay opacity={0.5} />
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <motion.div
          className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
          }}
        >
          {/* Left: message */}
          <motion.div variants={fadeInUp} className="flex-1 text-center md:text-left">
            <p
              className="text-xs uppercase tracking-[0.15em] mb-2"
              style={{ ...typography.caption, color: COLORS.clay }}
            >
              48-HOUR WINDOW
            </p>
            <p className="text-base md:text-lg mb-1" style={{ ...typography.subhead, color: COLORS.white }}>
              Bring Your Crew — Bids Close Soon
            </p>
            <p className="text-sm" style={{ ...typography.body, color: COLORS.boulder, lineHeight: 1.4 }}>
              Gather 3–10 friends, name your price.
            </p>
          </motion.div>

          {/* Center: countdown */}
          <motion.div variants={fadeInUp} className="flex items-center gap-1.5">
            <Clock size={14} color={COLORS.clay} className="mr-1.5 shrink-0" />
            <Digit value={hours} label="hrs" />
            <span className="text-lg" style={{ color: COLORS.boulder }}>:</span>
            <Digit value={minutes} label="min" />
            <span className="text-lg" style={{ color: COLORS.boulder }}>:</span>
            <Digit value={seconds} label="sec" />
          </motion.div>

          {/* Right: CTA — rectangular Analog style */}
          <motion.div variants={fadeInUp}>
            <Link
              to="/bringyourcrew"
              className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity whitespace-nowrap"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                borderRadius: 0,
                fontWeight: 500,
                letterSpacing: "0.05em",
              }}
            >
              Submit a Crew Bid
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default CrewPromoBanner;
