import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Home, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { trackCustomEvent } from "@/components/AnalyticsTracking";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    // Log 404 for debugging
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    
    // Track 404 in analytics for monitoring
    trackCustomEvent("page_not_found", {
      attempted_path: location.pathname,
      referrer: document.referrer || "direct",
    });
  }, [location.pathname]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader />
      
      {/* Simple, apologetic 404 section */}
      <section 
        className="min-h-[80vh] flex items-center justify-center px-6 py-24"
        style={{ backgroundColor: COLORS.clay }}
      >
        <FilmGrainOverlay opacity={0.4} />
        
        <div className="relative z-10 max-w-xl text-center">
          {/* 404 Number */}
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{ 
              ...typography.headline, 
              color: COLORS.charcoal,
              fontSize: 'clamp(80px, 15vw, 140px)',
              lineHeight: 1,
              opacity: 0.15,
              marginBottom: '-20px',
            }}
          >
            404
          </motion.p>
          
          {/* Apologetic heading */}
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{ 
              ...typography.headline, 
              color: COLORS.charcoal,
              fontSize: 'clamp(28px, 5vw, 42px)',
              lineHeight: 1.2,
              marginBottom: '20px',
            }}
          >
            Oops! This page<br />doesn't exist yet.
          </motion.h1>
          
          {/* Grassroots apology */}
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.1 }}
            style={{ 
              ...typography.body, 
              color: COLORS.charcoal,
              fontSize: '16px',
              lineHeight: 1.7,
              marginBottom: '12px',
              opacity: 0.9,
            }}
          >
            We're a small grassroots team building this site with love — 
            and honestly, it's still a work in progress.
          </motion.p>
          
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.15 }}
            style={{ 
              ...typography.body, 
              color: COLORS.charcoal,
              fontSize: '16px',
              lineHeight: 1.7,
              marginBottom: '32px',
              opacity: 0.9,
            }}
          >
            Thanks for bearing with us while we figure things out. 
            Your patience means the world.
          </motion.p>
          
          {/* Heart icon */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.2 }}
            className="flex justify-center mb-8"
          >
            <Heart 
              className="w-6 h-6" 
              style={{ color: COLORS.charcoal, opacity: 0.5 }} 
              fill={COLORS.charcoal}
              fillOpacity={0.2}
            />
          </motion.div>
          
          {/* Action Buttons */}
          <motion.div 
            className="flex flex-wrap gap-4 justify-center"
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.25 }}
          >
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="px-6 py-3 text-sm uppercase tracking-wide hover:opacity-80 transition-opacity"
              style={{ 
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.charcoal,
                borderRadius: '0',
                border: `1px solid ${COLORS.charcoal}60`,
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            
            <Button
              asChild
              className="px-6 py-3 text-sm uppercase tracking-wide hover:opacity-80 transition-opacity"
              style={{ 
                ...typography.button,
                backgroundColor: COLORS.charcoal,
                color: COLORS.dustySky,
                borderRadius: '0',
              }}
            >
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
          </motion.div>
          
          {/* Path info for debugging (subtle) */}
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ delay: 0.3 }}
            className="mt-12"
            style={{ 
              ...typography.caption, 
              color: COLORS.charcoal,
              opacity: 0.4,
              fontSize: '10px',
            }}
          >
            Looking for: {location.pathname}
          </motion.p>
        </div>
      </section>
      
      <MayFooter />
    </div>
  );
};

export default NotFound;
