import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { COLORS, typography } from "@/styles/may-theme";
import { motion, useScroll, useTransform } from "framer-motion";

interface StickyTicketCTAProps {
  /** Text shown on the button */
  buttonText?: string;
  /** Supporting context line */
  contextText?: string;
}

/**
 * Persistent sticky bar that appears on non-ticket pages (landing, stay)
 * to drive users toward the ticket checkout. Mobile-only by default.
 */
export default function StickyTicketCTA({ 
  buttonText = "Get Tickets", 
  contextText = "Starting at $99 · Tier 1 pricing" 
}: StickyTicketCTAProps) {
  const { scrollYProgress } = useScroll();
  // Only show after scrolling past 15% of the page
  const opacity = useTransform(scrollYProgress, [0, 0.12, 0.15], [0, 0, 1]);
  const translateY = useTransform(scrollYProgress, [0, 0.12, 0.15], [60, 60, 0]);

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t"
      style={{ 
        opacity,
        y: translateY,
        backgroundColor: `${COLORS.white}f5`,
        borderColor: `${COLORS.charcoal}12`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '10px 16px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p style={{ 
            ...typography.body, 
            color: COLORS.boulder, 
            fontSize: '12px',
            lineHeight: 1.3,
          }}>
            {contextText}
          </p>
        </div>
        <Link
          to="/tickets"
          className="flex items-center gap-1.5 px-5 py-2.5 uppercase shrink-0 hover:opacity-80 transition-opacity"
          style={{
            ...typography.button,
            backgroundColor: COLORS.clay,
            color: COLORS.white,
            border: 'none',
            fontSize: '12px',
            letterSpacing: '0.05em',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {buttonText}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.div>
  );
}
