import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailSuccessAnimationProps {
  show: boolean;
  recipientCount: number;
  onComplete?: () => void;
  className?: string;
}

export const EmailSuccessAnimation = ({
  show,
  recipientCount,
  onComplete,
  className,
}: EmailSuccessAnimationProps) => {
  const [phase, setPhase] = useState<"sending" | "success" | "complete">("sending");
  
  useEffect(() => {
    if (show) {
      setPhase("sending");
      const timer1 = setTimeout(() => setPhase("success"), 800);
      const timer2 = setTimeout(() => {
        setPhase("complete");
        onComplete?.();
      }, 2500);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [show, onComplete]);
  
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--admin-surface))]/80 backdrop-blur-sm",
            className
          )}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-2xl shadow-xl p-8 text-center max-w-sm mx-4"
          >
            <AnimatePresence mode="wait">
              {phase === "sending" && (
                <motion.div
                  key="sending"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center"
                >
                  <motion.div
                    animate={{ 
                      x: [0, 50, 100],
                      opacity: [1, 1, 0],
                    }}
                    transition={{ 
                      duration: 0.8,
                      ease: "easeInOut",
                    }}
                    className="mb-4"
                  >
                    <Send className="h-12 w-12 text-[hsl(var(--admin-accent))]" />
                  </motion.div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Sending...</p>
                </motion.div>
              )}
              
              {phase === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.4 }}
                    className="relative mb-4"
                  >
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl" />
                    <CheckCircle2 className="h-16 w-16 text-emerald-500 relative z-10" />
                    
                    {/* Confetti-like sparkles */}
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ 
                          opacity: [0, 1, 0],
                          scale: [0, 1, 0.5],
                          x: Math.cos((i * 60) * Math.PI / 180) * 40,
                          y: Math.sin((i * 60) * Math.PI / 180) * 40,
                        }}
                        transition={{ 
                          duration: 0.6,
                          delay: 0.2 + i * 0.05,
                        }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      >
                        <Sparkles className="h-4 w-4 text-amber-500" />
                      </motion.div>
                    ))}
                  </motion.div>
                  
                  <motion.h3
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl font-semibold mb-2 text-[hsl(var(--admin-text))]"
                  >
                    Email Sent!
                  </motion.h3>
                  
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-[hsl(var(--admin-text-muted))]"
                  >
                    Successfully sent to {recipientCount} recipient{recipientCount !== 1 ? "s" : ""}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
