import { Link } from "react-router-dom";
import { X, Gift } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS, typography } from "@/styles/may-theme";

interface GiveawayExitPopupProps {
  open: boolean;
  onClose: () => void;
  mode?: "modal" | "sheet";
}

export const GiveawayExitPopup = ({ open, onClose, mode = "modal" }: GiveawayExitPopupProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-50 flex ${mode === "sheet" ? "items-end justify-center" : "items-center justify-center p-4"}`}
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={mode === "sheet" ? { opacity: 0, y: 48 } : { scale: 0.9, opacity: 0, y: 20 }}
            animate={mode === "sheet" ? { opacity: 1, y: 0 } : { scale: 1, opacity: 1, y: 0 }}
            exit={mode === "sheet" ? { opacity: 0, y: 48 } : { scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`relative w-full ${mode === "sheet" ? "max-w-none rounded-t-[28px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" : "max-w-md rounded-2xl p-8"}`}
            style={{ backgroundColor: COLORS.white }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 p-1 rounded-full hover:opacity-70 z-10"
              style={{ color: COLORS.boulder }}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <Gift className="w-8 h-8 mx-auto mb-3" style={{ color: COLORS.clay }} />
              <p
                style={{
                  ...typography.caption,
                  color: COLORS.clay,
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  marginBottom: "10px",
                }}
              >
                BEFORE YOU GO
              </p>
              <h3
                style={{
                  ...typography.subhead,
                  color: COLORS.charcoal,
                  fontSize: "24px",
                  letterSpacing: "0.01em",
                  lineHeight: 1.2,
                }}
              >
                Win 2 VIP Weekend Passes.
              </h3>
              <p
                style={{
                  ...typography.body,
                  color: COLORS.boulder,
                  fontSize: "14px",
                  marginTop: "12px",
                  lineHeight: 1.7,
                }}
              >
                Free to enter. Two VIP passes to Cosmico, plus a 2-night
                stay at Example Meadow and partner extras. Takes 30 seconds.
              </p>
            </div>

            <Link
              to="/win"
              onClick={onClose}
              className="block w-full py-3.5 text-center uppercase hover:opacity-90 transition-opacity rounded-lg"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: "13px",
                letterSpacing: "0.06em",
              }}
            >
              Enter The Giveaway
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 uppercase hover:opacity-70 transition-opacity rounded-lg mt-2"
              style={{
                ...typography.button,
                backgroundColor: "transparent",
                color: COLORS.boulder,
                border: `1px solid ${COLORS.charcoal}20`,
                fontSize: "12px",
                letterSpacing: "0.06em",
              }}
            >
              No Thanks
            </button>

            <p
              className="text-center mt-3"
              style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px" }}
            >
              No purchase necessary. One entry per person.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
