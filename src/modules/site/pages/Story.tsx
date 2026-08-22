import { useRef, useEffect } from "react";
import { motion, useInView, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";

// Images
import foundersRitual from "@/assets/may/founders-ritual.webp";
import holdingHandsWristband from "@/assets/may/holding-hands-wristband.webp";
import foundersPortrait from "@/assets/may/founders-portrait.webp";
import analogBookCover from "@/assets/may/analog-book-cover.webp";
import singerPinkPerforming from "@/assets/may/singer-pink-performing.webp";
import pressSonomaMag from "@/assets/may/press-sonoma-mag.webp";
import { STORE_LINK } from "@/platform/externalLinks";

// Animation variants
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
};

// Animated section wrapper
const AnimatedSection = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div ref={ref} initial="hidden" animate={isInView ? "visible" : "hidden"} variants={fadeInUp} className={className}>
      {children}
    </motion.div>
  );
};

// Duotone image panel component
const DuotonePanel = ({ 
  image, alt, color, secondaryColor = COLORS.denim, className = "",
  imageBrightness = 0.9, colorOpacity = 0.55, halftoneOpacity = 0.4, objectPosition = "center center"
}: { 
  image: string; alt: string; color: string; secondaryColor?: string; className?: string;
  imageBrightness?: number; colorOpacity?: number; halftoneOpacity?: number; objectPosition?: string;
}) => (
  <motion.div 
    className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`}
    style={{ backgroundColor: color }}
    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
  >
    <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.35, mixBlendMode: 'overlay' }} />
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ filter: `grayscale(100%) contrast(1.1) brightness(${imageBrightness})`, mixBlendMode: 'multiply', objectPosition }} />
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, mixBlendMode: 'multiply', opacity: colorOpacity }} />
    <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(180deg, ${secondaryColor}30 0%, transparent 50%, ${color}20 100%)`, mixBlendMode: 'overlay' }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: halftoneOpacity }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ ...heavyGrain, opacity: 0.25 }} />
  </motion.div>
);

// Clear image panel
const ClearImagePanel = ({ image, alt, className = "", objectPosition = "center center" }: { image: string; alt: string; className?: string; objectPosition?: string }) => (
  <motion.div className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition }} />
    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.15) 100%)' }} />
  </motion.div>
);

// Typography panel component
const TypographyPanel = ({ 
  label, headline, body, footnote, bgColor, textColor, labelColor, children, className = "" 
}: { 
  label: string; headline: React.ReactNode; body?: React.ReactNode; footnote?: string;
  bgColor: string; textColor: string; labelColor: string; children?: React.ReactNode; className?: string;
}) => (
  <motion.div 
    className={`relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 ${className}`}
    style={{ backgroundColor: bgColor }}
    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
  >
    <FilmGrainOverlay opacity={0.5} />
    <div className="relative z-10" />
    <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
      <motion.h2 
        className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10"
        style={{ ...typography.headline, color: textColor, textTransform: 'uppercase' }}
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
      >
        {headline}
      </motion.h2>
      {body && (
        <motion.div className="space-y-4 max-w-sm" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}>
          {body}
        </motion.div>
      )}
      {children}
    </div>
    {footnote && (
      <motion.div className="relative z-10" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.6 }}>
        <p style={{ ...typography.caption, color: labelColor, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>{footnote}</p>
      </motion.div>
    )}
  </motion.div>
);

const MayStory = () => {
  useCanonicalUrl('/story');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Our Story",
      item_category: "Festival",
      price: 215,
    });
  }, []);

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop />

      {/* ===== SECTION 1: HOW IT ALL BEGAN ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel image={foundersRitual} alt="Founders ritual ceremony" color={COLORS.forest} secondaryColor={COLORS.sage} imageBrightness={1.25} colorOpacity={0.45} halftoneOpacity={0.25} />
          <TypographyPanel
            label="OUR STORY"
            headline={<>How It<br />All<br />Began.</>}
            bgColor={COLORS.clay}
            textColor={COLORS.charcoal}
            labelColor={COLORS.charcoal}
            footnote="EXAMPLE VALLEY, CALIFORNIA"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  What began as Cosmico started simply — a few friends, a stretch of river, and a shared belief that music could bring people closer.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  It wasn't designed to scale. It was designed to feel real.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  That intention is still here. It just has a clearer name now.
                </p>
                <p style={{ ...typography.body, color: COLORS.denim, fontSize: '15px', lineHeight: 1.7 }}>
                  Cosmico is a gathering built around music, nature, and the people who show up fully.
                </p>
              </>
            }
          />
        </div>
      </section>

      {/* ===== SECTION 2: THE GATHERING ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="THE GATHERING"
            headline={<>The<br />Gathering.</>}
            bgColor={COLORS.dustySky}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            footnote="THREE DAYS · EXAMPLE RIVER"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Cosmico is a weekend designed to bring people together in the real world.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  Three days shaped by music, nature, and conversation.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  Mornings begin slowly along the river.<br />
                  Afternoons fill with discovery — new artists, unexpected conversations, shared meals.<br />
                  And as night falls, the gathering comes alive under the stars.
                </p>
                <p style={{ ...typography.body, color: COLORS.denim, fontSize: '15px', lineHeight: 1.7 }}>
                  This isn't something you attend.<br />
                  It's something you become part of.
                </p>
              </>
            }
          />
          <ClearImagePanel image={holdingHandsWristband} alt="Holding hands with wristbands" />
        </div>
      </section>

      {/* ===== SECTION 3: FROM THE FOUNDERS ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          {/* Founders image with editorial caption */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen overflow-hidden" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <img src={foundersPortrait} alt="Demo Organizer One and Demo Organizer Two, founders of Cosmico" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 25%' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
            <div className="absolute bottom-0 left-0 right-0 z-10 p-6 md:p-8">
              <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '10px', letterSpacing: '0.1em', opacity: 0.9 }}>
                DEMO ORGANIZER ONE + DEMO ORGANIZER TWO
              </p>
              <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '9px', letterSpacing: '0.1em', opacity: 0.6, marginTop: '4px' }}>
                FOUNDERS OF COSMICO
              </p>
              <div className="flex items-center gap-3 mt-4" style={{ opacity: 0.5 }}>
                <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '8px', letterSpacing: '0.08em' }}>AS SEEN IN</p>
                <img src={pressSonomaMag} alt="Example Valley Magazine" className="h-7 brightness-0 invert" style={{ opacity: 0.7 }} />
              </div>
            </div>
          </motion.div>
          <TypographyPanel
            label="FROM THE FOUNDERS"
            headline={<>From The<br />Founders.</>}
            bgColor={COLORS.sage}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            footnote="DEMO ORGANIZER ONE + DEMO ORGANIZER TWO · FOUNDERS"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Cosmico began as a simple idea: create space for people to gather in the real world around music, creativity, and community.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  What started as small gatherings among friends slowly grew into a weekend designed to bring people together along the Example River.
                </p>
                <motion.div 
                  className="my-10 py-8 px-0" 
                  style={{ borderTop: `1px solid ${COLORS.forest}30`, borderBottom: `1px solid ${COLORS.forest}30` }}
                  initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}
                >
                  <p style={{ 
                    ...typography.body, 
                    color: COLORS.forest, 
                    fontSize: '20px', 
                    lineHeight: 1.5, 
                    fontStyle: 'italic',
                    letterSpacing: '-0.01em',
                  }}>
                    "We're intentionally discovery-focused — people trust us to introduce them to new music."
                  </p>
                  <p style={{ ...typography.caption, color: COLORS.charcoal, marginTop: '14px', fontSize: '10px', opacity: 0.5 }}>
                    — DEMO ORGANIZER ONE
                  </p>
                </motion.div>
              </>
            }
          />
        </div>
      </section>

      {/* ===== SECTION 4: THE ANALOG PHILOSOPHY ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="THE PHILOSOPHY"
            headline={<>The Analog<br />Philosophy.</>}
            bgColor={COLORS.deepWater}
            textColor={COLORS.dustySky}
            labelColor={COLORS.electricLavender}
            footnote="ANALOG — A #1 AMAZON BESTSELLER"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  The ideas behind Cosmico grew out of a larger question:
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85, fontStyle: 'italic' }}>
                  How do we live meaningful lives in a world increasingly shaped by screens and algorithms?
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  A founder explored that question in a book <em>Analog: How to Love Your Work and Not Wait for Retirement to Live the Good Life</em>, which became a #1 Amazon bestseller.
                </p>
                <p style={{ ...typography.body, color: COLORS.mustard, fontSize: '15px', lineHeight: 1.7 }}>
                  The gathering is where those ideas come to life — a weekend dedicated to music, creativity, and real-world connection.
                </p>
              </>
            }
          >
            <motion.div 
              className="mt-8"
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.6 }}
            >
              {STORE_LINK.url && (
                <Button
                  asChild
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity font-serialb"
                  style={{ backgroundColor: COLORS.mustard, color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '-0.02em' }}
                >
                  <a href={STORE_LINK.url} target="_blank" rel="noopener noreferrer">{STORE_LINK.label}</a>
                </Button>
              )}
            </motion.div>
          </TypographyPanel>
          
          {/* Book cover panel */}
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: COLORS.charcoal }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 p-12 md:p-16 flex flex-col items-center">
              <motion.img 
                src={analogBookCover} 
                alt="Analog book by Demo Organizer One" 
                className="w-64 md:w-80"
                style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))' }}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.3 }}
              />
              <motion.div 
                className="mt-8 text-center"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.5 }}
              >
                <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '10px', opacity: 0.7 }}>
                  ANALOG — A #1 AMAZON BESTSELLER
                </p>
                <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>
                  BY DEMO ORGANIZER ONE
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== SECTION 5: JOIN THE GATHERING ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="JOIN US"
            headline={<>Join<br />The<br />Gathering.</>}
            bgColor={COLORS.forest}
            textColor={COLORS.dustySky}
            labelColor={COLORS.sage}
            footnote="MAY 14–16, 2027"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Each spring, a small group of people gathers along the Example River for a weekend shaped by music, creativity, and connection.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  Seven hundred people.<br />
                  Three days.<br />
                  A gathering built for presence.
                </p>
              </>
            }
          >
            <motion.div 
              className="mt-10"
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.6 }}
            >
              <Button 
                asChild
                className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity font-serialb"
                style={{ backgroundColor: COLORS.clay, color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '-0.02em' }}
              >
                <Link to="/experience">Explore The Weekend</Link>
              </Button>
            </motion.div>
          </TypographyPanel>
          <DuotonePanel image={singerPinkPerforming} alt="Singer performing on stage" color={COLORS.clay} secondaryColor={COLORS.mustard} />
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default MayStory;
