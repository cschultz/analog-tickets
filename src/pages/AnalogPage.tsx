import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import EmailCapture from "@/components/may/EmailCapture";
import { COLORS, typography, fadeInUp, staggerContainer, heavyGrain, halftonePattern, halftonePatternDense } from "@/styles/may-theme";
import { useUTMCapture } from "@/hooks/useUTMTracking";
import { OptimizedLandingImage } from "@/components/may/OptimizedLandingImage";

// Lazy load footer
const MayFooter = lazy(() => import("@/components/may/MayFooter"));

// Images - priority for hero
import dockHangoutImage from "@/assets/may/dock-hangout-river.webp";
import winecampImage from "@/assets/may/winecamp-gathering.webp";
import foundersRitualImage from "@/assets/may/founders-ritual.webp";

// ===== TYPES ===== (v2.0.0 - Manifesto Edition)
type ThemeKeyword = "philosophy" | "events" | "creativity" | "music" | "default";

interface DynamicContent {
  theme: ThemeKeyword;
  headline: string;
}

// ===== UTILITIES =====
const sanitizeParam = (value: string | null, maxLength = 100): string => {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s\-.,!?']/g, "")
    .trim()
    .slice(0, maxLength);
};

const detectTheme = (params: URLSearchParams): DynamicContent => {
  const keyword = sanitizeParam(params.get("keyword"), 80).toLowerCase();
  const campaign = sanitizeParam(params.get("utm_campaign"), 80).toLowerCase();
  const content = sanitizeParam(params.get("utm_content"), 80).toLowerCase();
  const combined = `${keyword} ${campaign} ${content}`;

  if (/philosophy|meaning|intentional|mindful|presence|slow|analog/.test(combined)) {
    return { theme: "philosophy", headline: "Analog" };
  }

  if (/event|gather|festival|reunion|community|retreat/.test(combined)) {
    return { theme: "events", headline: "a Small, Curated Gathering" };
  }

  if (/creativ|culture|art|ritual|intention|practice/.test(combined)) {
    return { theme: "creativity", headline: "a More Intentional Way of Being" };
  }

  if (/music|nature|outdoor|sound|concert|experience/.test(combined)) {
    return { theme: "music", headline: "Music, Nature, and Human Connection" };
  }

  return { theme: "default", headline: "Analog" };
};

// ===== MAIN COMPONENT =====
const AnalogPage = () => {
  const [searchParams] = useSearchParams();
  useUTMCapture();

  const dynamicContent = useMemo(() => detectTheme(searchParams), [searchParams]);

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop />

      {/* ===== 1. HERO: Split Panel ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          {/* LEFT: Duotone Image */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
            style={{ backgroundColor: COLORS.forest }}
          >
            <div 
              className="absolute inset-0 pointer-events-none z-10"
              style={{ ...heavyGrain, opacity: 0.25, mixBlendMode: 'overlay' }}
            />
            
            <OptimizedLandingImage 
              src={dockHangoutImage} 
              alt="Quiet moment by the river" 
              className="absolute inset-0 w-full h-full object-cover"
              eager
              priority
              style={{ filter: 'grayscale(100%) contrast(1.1) brightness(1.05)', mixBlendMode: 'multiply' }}
            />
            
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundColor: COLORS.denim, mixBlendMode: 'multiply', opacity: 0.5 }}
            />
            
            <div 
              className="absolute inset-0 pointer-events-none z-20"
              style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.2 }}
            />
          </div>
          
          {/* RIGHT: Typography + CTA */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.dustySky }}
          >
            <FilmGrainOverlay opacity={0.4} />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1
                id="d-h1"
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-8"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                What It Means<br />to Be{" "}
                <span style={{ color: COLORS.denim }}>{dynamicContent.headline}</span>
              </motion.h1>

              <motion.div 
                className="max-w-md space-y-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.7, opacity: 0.9 }}>
                  In a world optimized for speed, scale, and noise —
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.7, opacity: 0.9 }}>
                  Analog is an invitation back.
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px', lineHeight: 1.7 }}>
                  To presence. To memory. To human-scale experience.
                </p>
              </motion.div>
              
              <motion.div 
                className="mt-10 max-w-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <EmailCapture
                  variant="stacked"
                  buttonText="Join"
                  showPhone={false}
                  showFirstName={true}
                />
                <p className="mt-4" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px', opacity: 0.7, letterSpacing: '0.08em' }}>
                  OCCASIONAL DISPATCHES FROM THE ANALOG MOVEMENT
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 2. THE TENSION ===== */}
      <section className="relative py-24 md:py-32 px-6 md:px-12 lg:px-20" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <motion.div
          className="relative z-10 max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="space-y-8">
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '18px', lineHeight: 1.9, opacity: 0.95 }}>
              We attend more events than ever.
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '18px', lineHeight: 1.9, opacity: 0.95 }}>
              Yet remember fewer of them.
            </p>
            <div className="h-px w-16 my-8" style={{ backgroundColor: COLORS.boulder, opacity: 0.3 }} />
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '18px', lineHeight: 1.9, opacity: 0.95 }}>
              We consume endless music.
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '18px', lineHeight: 1.9, opacity: 0.95 }}>
              Yet feel less moved.
            </p>
            <div className="h-px w-16 my-8" style={{ backgroundColor: COLORS.boulder, opacity: 0.3 }} />
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '18px', lineHeight: 1.9, opacity: 0.95 }}>
              We connect constantly.
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '18px', lineHeight: 1.9, opacity: 0.95 }}>
              Yet rarely feel together.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== 3. THE DECLARATION ===== */}
      <section className="relative py-24 md:py-32 px-6 md:px-12 lg:px-20" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <motion.div
          className="relative z-10 max-w-3xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-16"
            style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase', lineHeight: 1.1 }}
            variants={fadeInUp}
          >
            Analog isn't<br />anti-technology.
          </motion.h2>

          <motion.div variants={fadeInUp} className="space-y-6 max-w-xl">
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '18px', lineHeight: 1.8 }}>
              It's pro-presence.
            </p>
            <div className="h-px w-24 my-10" style={{ backgroundColor: COLORS.denim, opacity: 0.4 }} />
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>
              Human-scale instead of massive.
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>
              Curated instead of chaotic.
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>
              Participatory instead of performative.
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>
              Remembered instead of scrolled past.
            </p>
            <div className="h-px w-24 my-10" style={{ backgroundColor: COLORS.denim, opacity: 0.4 }} />
            <p style={{ ...typography.body, color: COLORS.denim, fontSize: '18px', lineHeight: 1.8 }}>
              It isn't nostalgia. It's intention.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== 4. VISUAL PAUSE: Full-Width Image ===== */}
      <div className="relative" style={{ backgroundColor: COLORS.dustySky }}>
        <OptimizedLandingImage
          src={foundersRitualImage}
          alt="Community ritual"
          className="w-full h-[50vh] md:h-[60vh] object-cover"
          style={{ 
            filter: 'grayscale(40%) contrast(1.05) brightness(0.95)',
            objectPosition: 'center 35%',
          }}
        />
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: COLORS.denim, mixBlendMode: 'multiply', opacity: 0.15 }}
        />
      </div>

      {/* ===== 5. THE BOOK (50/50 Layout) ===== */}
      <section className="relative" style={{ backgroundColor: COLORS.white }}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          
          {/* Text Panel */}
          <div className="relative p-8 md:p-12 lg:p-20 flex flex-col justify-center">
            <FilmGrainOverlay opacity={0.4} />
            <motion.div
              className="relative z-10 max-w-md"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
            >
              <motion.p 
                className="mb-6"
                style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.15em', fontSize: '10px' }}
                variants={fadeInUp}
              >
                THE ORIGIN
              </motion.p>
              
              <motion.h2
                className="text-2xl sm:text-3xl md:text-4xl mb-10"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase', lineHeight: 1.1 }}
                variants={fadeInUp}
              >
                This Idea Didn't<br />Start as an Event.
              </motion.h2>

              <motion.div variants={fadeInUp} className="space-y-6">
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.9 }}>
                  The philosophy behind Analog was developed through years of writing, observation, and lived experience.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.85 }}>
                  What do we lose when everything becomes faster, bigger, and more disposable?
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.85 }}>
                  What becomes possible when we slow back down?
                </p>
              </motion.div>
            </motion.div>
          </div>

          {/* Book Placeholder */}
          <div
            className="relative min-h-[400px] md:min-h-full flex items-center justify-center"
            style={{ backgroundColor: `${COLORS.boulder}20` }}
          >
            <FilmGrainOverlay opacity={0.4} />
            <div
              className="relative z-10 w-44 h-60 md:w-52 md:h-72 flex items-center justify-center"
              style={{
                backgroundColor: COLORS.charcoal,
                boxShadow: '8px 12px 32px rgba(0,0,0,0.25)',
              }}
            >
              <p style={{ ...typography.caption, color: COLORS.dustySky, letterSpacing: '0.1em', fontSize: '10px' }}>
                BOOK COVER
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 6. WHY GATHERINGS ===== */}
      <section className="relative py-24 md:py-32 px-6 md:px-12 lg:px-20" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <motion.div
          className="relative z-10 max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-16"
            style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase', lineHeight: 1.1 }}
            variants={fadeInUp}
          >
            Why Small,<br />Curated Gatherings<br />Still Matter.
          </motion.h2>

          <motion.div variants={fadeInUp} className="space-y-6">
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.85, opacity: 0.95 }}>
              When experiences stay small, something changes.
            </p>
            <div className="h-px w-16 my-8" style={{ backgroundColor: COLORS.dustySky, opacity: 0.2 }} />
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.85, opacity: 0.9 }}>
              People listen longer.
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.85, opacity: 0.9 }}>
              Conversations deepen.
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.85, opacity: 0.9 }}>
              Music becomes connective tissue instead of background noise.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== 7. VISUAL PAUSE: Winecamp Image ===== */}
      <div className="relative py-8 md:py-12" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12">
          <OptimizedLandingImage
            src={winecampImage}
            alt="A shared gathering space"
            className="w-full h-auto object-cover"
            style={{ maxHeight: "400px", objectPosition: "center center" }}
          />
        </div>
      </div>

      {/* ===== 8. WHAT THIS LOOKS LIKE ===== */}
      <section className="relative py-24 md:py-32 px-6 md:px-12 lg:px-20" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <motion.div
          className="relative z-10 max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.h2
            className="text-2xl sm:text-3xl md:text-4xl mb-12"
            style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase', lineHeight: 1.1 }}
            variants={fadeInUp}
          >
            What This<br />Looks Like.
          </motion.h2>

          <motion.div variants={fadeInUp} className="space-y-8">
            <div>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.9 }}>
                Intimate music experiences where artists and audiences share the same ground.
              </p>
            </div>
            <div>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.9 }}>
                Time outdoors where the landscape isn't a backdrop — it's a collaborator.
              </p>
            </div>
            <div>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.9 }}>
                Simple rituals that help people remember what they felt — not just what they attended.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== 9. PRIMARY CTA ===== */}
      <section className="relative py-24 md:py-32 px-6 md:px-12 lg:px-20" style={{ backgroundColor: COLORS.denim }}>
        <FilmGrainOverlay opacity={0.5} />
        <motion.div
          className="relative z-10 max-w-xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.h2
            className="text-2xl sm:text-3xl md:text-4xl mb-10"
            style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase', lineHeight: 1.1 }}
            variants={fadeInUp}
          >
            If This Resonates,<br />You Already Belong Here.
          </motion.h2>

          <motion.div variants={fadeInUp} className="space-y-4 mb-10">
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.75, opacity: 0.95 }}>
              Reflections on presence, music, community, and creative life.
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '16px', lineHeight: 1.75, opacity: 0.8 }}>
              No noise. No algorithms. Just shared language.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp} className="max-w-md mx-auto">
            <EmailCapture
              variant="stacked"
              buttonText="Join the Movement"
              showPhone={false}
              showFirstName={true}
              darkMode
            />
            <p className="mt-5" style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '11px', opacity: 0.6, letterSpacing: '0.08em' }}>
              OCCASIONAL DISPATCHES · YOU CAN LEAVE ANYTIME
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== 10. FOOTER CREDIBILITY ===== */}
      <div className="py-6 px-6 text-center" style={{ backgroundColor: COLORS.charcoal }}>
        <p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.5 }}>
          IDEAS FROM THE BOOK <em>ANALOG</em>, BROUGHT TO LIFE THROUGH GATHERING
        </p>
      </div>

      <Suspense fallback={<div className="h-40" style={{ backgroundColor: COLORS.charcoal }} />}>
        <MayFooter />
      </Suspense>
    </div>
  );
};

export default AnalogPage;
