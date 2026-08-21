import { Link } from "react-router-dom";
import { COLORS, typography } from "@/styles/may-theme";

/**
 * Compact strip linking to /schedule — drop below the hero on
 * Lineup, Experience, or any page where set-time questions arise.
 */
const ScheduleStrip = () => {
  return (
    <Link
      to="/schedule"
      className="group block relative overflow-hidden hover:opacity-95 transition-opacity"
      style={{ backgroundColor: COLORS.charcoal }}
    >
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-4 md:py-5 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-4 md:gap-6 flex-wrap">
          <span
            style={{
              ...typography.caption,
              color: COLORS.mustard,
              letterSpacing: '0.18em',
              fontSize: '10px',
            }}
          >
            FULL SCHEDULE
          </span>
          <span
            style={{
              ...typography.body,
              color: COLORS.dustySky,
              fontSize: '14px',
              opacity: 0.95,
            }}
          >
            Set times, doors, dinner, sauna — the whole weekend.
          </span>
        </div>
        <span
          className="group-hover:opacity-70 transition-opacity"
          style={{
            ...typography.caption,
            color: COLORS.mustard,
            fontSize: '10px',
            letterSpacing: '0.14em',
            borderBottom: `1px solid ${COLORS.mustard}`,
            paddingBottom: '3px',
            whiteSpace: 'nowrap',
          }}
        >
          SEE THE SCHEDULE →
        </span>
      </div>
    </Link>
  );
};

export default ScheduleStrip;
