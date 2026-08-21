import { motion } from "framer-motion";
import { COLORS, typography, fadeInUp, staggerContainer } from "@/styles/may-theme";
import { CheckCircle } from "lucide-react";

const CrewBidConfirmation = () => {
  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="text-center py-12">
      <motion.div variants={fadeInUp} className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.forest }}>
          <CheckCircle size={40} color={COLORS.white} />
        </div>
      </motion.div>

      <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl mb-8" style={{ ...typography.headline, color: COLORS.charcoal }}>
        Crew Bid Received
      </motion.h2>

      <motion.div variants={fadeInUp} className="max-w-md mx-auto space-y-5" style={{ ...typography.body, color: COLORS.charcoal, lineHeight: 1.7 }}>
        <p className="text-lg italic" style={{ color: COLORS.clay }}>Nice work, captain.</p>
        <p>
          We review crew bids on a rolling basis.
        </p>
        <p>
          If your bid is accepted, you'll receive a checkout link to complete your purchase.
        </p>
        <p className="font-medium" style={{ color: COLORS.clay }}>
          ⚡ You'll have exactly 24 hours to complete payment — have your crew ready to go.
        </p>
        <p className="text-sm" style={{ color: COLORS.boulder }}>
          Bids cannot be resubmitted, so make sure your price and crew size are final.
        </p>
      </motion.div>
    </motion.div>
  );
};

export default CrewBidConfirmation;
