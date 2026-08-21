import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography } from "@/styles/may-theme";

const CrewCounter = () => {
  const [count, setCount] = useState(0);
  const [goal, setGoal] = useState(120);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await (supabase as any)
        .from("crew_campaign_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["friends_count", "friends_goal"]);

      if (data) {
        data.forEach((row: any) => {
          if (row.setting_key === "friends_count") setCount(parseInt(row.setting_value) || 0);
          if (row.setting_key === "friends_goal") setGoal(parseInt(row.setting_value) || 120);
        });
      }
      setLoaded(true);
    };
    fetchSettings();
  }, []);

  const progress = Math.min((count / goal) * 100, 100);

  return (
    <div className="max-w-md mx-auto">
      <p className="text-center mb-4" style={{ ...typography.caption, color: COLORS.mustard, fontSize: '12px', letterSpacing: '0.15em' }}>
        CREW BIDS ACCEPTED
      </p>
      <div className="flex items-baseline justify-center gap-3 mb-4">
        <motion.span
          className="text-7xl md:text-8xl"
          style={{ ...typography.headline, color: COLORS.white }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={loaded ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {count}
        </motion.span>
        <span className="text-3xl" style={{ ...typography.subhead, color: COLORS.boulder }}>/ {goal}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: COLORS.clay }}
          initial={{ width: 0 }}
          animate={loaded ? { width: `${progress}%` } : {}}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </div>
    </div>
  );
};

export default CrewCounter;
