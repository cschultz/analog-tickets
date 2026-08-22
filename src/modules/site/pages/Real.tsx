import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";

// Photos
import heroCoupleStage from "@/assets/may/hero-couple-stage.webp";
import dockHangout from "@/assets/may/dock-hangout-river.webp";
import foundersPortrait from "@/assets/may/founders-portrait.webp";
import singerPinkPerforming from "@/assets/may/singer-pink-performing.webp";
import cosmicoStageNight from "@/assets/may/cosmico-stage-night.webp";
import holdingHandsWristband from "@/assets/may/holding-hands-wristband.webp";
import crewFriendsGolden from "@/assets/may/crew-friends-golden.webp";
import nightCrowdMagenta from "@/assets/may/night-crowd-magenta.webp";
import discoballPortrait from "@/assets/may/disco-ball-portrait.webp";
import crowdGolden from "@/assets/may/crowd-golden.webp";
import pressKCRW from "@/assets/may/press-kcrw.webp";
import pressPD from "@/assets/may/press-pd.webp";
import pressSonomaMag from "@/assets/may/press-sonoma-mag.webp";

// Duotone image panel
const DuotonePanel = ({ 
  image, alt, color, secondaryColor = COLORS.denim,
  imageBrightness = 0.9, colorOpacity = 0.55, halftoneOpacity = 0.4, objectPosition = "center center"
}: { 
  image: string; alt: string; color: string; secondaryColor?: string;
  imageBrightness?: number; colorOpacity?: number; halftoneOpacity?: number; objectPosition?: string;
}) => (
  <motion.div 
    className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
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

// Full-width cinematic image divider
const CinematicDivider = ({ 
  image, alt, color, objectPosition = "center center" 
}: { 
  image: string; alt: string; color: string; objectPosition?: string; 
}) => (
  <section className="relative h-[40vh] md:h-[50vh] overflow-hidden" style={{ backgroundColor: color }}>
    <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.3, mixBlendMode: 'overlay' }} />
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'grayscale(100%) contrast(1.1) brightness(0.95)', mixBlendMode: 'multiply', objectPosition }} />
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, mixBlendMode: 'multiply', opacity: 0.35 }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.3 }} />
  </section>
);

// Typography panel
const TypographyPanel = ({ 
  label, headline, body, footnote, bgColor, textColor, labelColor, children 
}: { 
  label: string; headline: React.ReactNode; body?: React.ReactNode; footnote?: string;
  bgColor: string; textColor: string; labelColor: string; children?: React.ReactNode;
}) => (
  <motion.div 
    className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
    style={{ backgroundColor: bgColor }}
    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
  >
    <FilmGrainOverlay opacity={0.5} />
    <div className="relative z-10" />
    <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
      <motion.p
        style={{ ...typography.caption, color: labelColor, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
      >
        {label}
      </motion.p>
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

// Sticky CTA bar
const StickyCTA = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 1.2);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-3"
          style={{ backgroundColor: COLORS.charcoal, borderTop: `1px solid ${COLORS.forest}40` }}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="hidden sm:block" style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '10px', letterSpacing: '0.12em', opacity: 0.7 }}>
            MAY 14–16 · EXAMPLE VALLEY, CA · LIMITED TO 700
          </p>
          <div className="flex gap-3 w-full sm:w-auto justify-center sm:justify-end">
            <Link to="/tickets" className="inline-block px-5 py-2.5 text-xs uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', fontSize: '11px'
            }}>Get Tickets</Link>
            <Link to="/experience" className="hidden sm:inline-block px-5 py-2.5 text-xs uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', fontSize: '11px', border: `1px solid ${COLORS.dustySky}50`
            }}>See Details</Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const MayReal = () => {
  useCanonicalUrl('/real');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Real Landing",
      item_category: "Festival",
      price: 215,
    });
  }, []);

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />
      <StickyCTA />

      {/* ===== 1. HERO ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel 
            image={heroCoupleStage} 
            alt="Festival moment at Cosmico" 
            color={COLORS.forest} 
            secondaryColor={COLORS.mustard}
            imageBrightness={1.1}
            colorOpacity={0.45}
            halftoneOpacity={0.25}
          />

          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.clay }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1 
                className="text-[2.2rem] sm:text-[2.8rem] md:text-[3.2rem] lg:text-[3.8rem] leading-[1.05] tracking-tight"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                Over Big<br />Festivals?<br />Come Back<br />To Real.
              </motion.h1>

              <motion.div className="mt-10 md:mt-14 max-w-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.7 }}>
                <p className="text-sm md:text-base mb-4" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.9, lineHeight: 1.6 }}>
                  A smaller, intentional weekend for people who are done with fake hype, endless scrolling, and crowds that came to be seen instead of actually feel something.
                </p>
              </motion.div>

              <motion.div className="mt-10 flex flex-wrap gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.9 }}>
                <Link to="/tickets" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                  ...typography.button, backgroundColor: COLORS.charcoal, color: COLORS.clay, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
                }}>Get Tickets</Link>
                <Link to="/experience" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                  ...typography.button, backgroundColor: 'transparent', color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', border: `1.5px solid ${COLORS.charcoal}`
                }}>See What This Is</Link>
              </motion.div>

              <motion.p 
                className="mt-4"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: '12px', opacity: 0.6, lineHeight: 1.5 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.1 }}
              >
                Limited to 700. If this speaks to you, you're probably one of them.
              </motion.p>
            </div>

            <motion.div className="relative z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1 }}>
              <p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.12em', fontSize: '13px', fontWeight: 500 }}>
                MAY 14–16, 2027 · EXAMPLE VALLEY, CA
              </p>
              <p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.12em', fontSize: '11px', fontWeight: 500, opacity: 0.6, marginTop: '4px' }}>
                LIMITED TO 700 ATTENDEES
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ===== 2. A DIFFERENT KIND OF FESTIVAL ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="THE EXPERIENCE"
            headline={<>This Isn't<br />A Festival<br />For Spectators.</>}
            bgColor={COLORS.dustySky}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            footnote="THREE DAYS · EXAMPLE RIVER"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  If you want massive crowds, headliners you already know, and people filming more than listening… this isn't your place.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  Analog is for people who actually want to feel something again.<br />
                  To discover music.<br />
                  To meet real people.<br />
                  To be present without performing.
                </p>
              </>
            }
          />
          <DuotonePanel 
            image={dockHangout} 
            alt="Community gathering along the river" 
            color={COLORS.sage} 
            secondaryColor={COLORS.forest}
            imageBrightness={1.0}
            colorOpacity={0.55}
            halftoneOpacity={0.3}
          />
        </div>
      </section>

      {/* ===== 3. WHO COMES ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="WHO COMES"
            headline={<>Done With<br />Everything<br />Else.</>}
            bgColor={COLORS.dustySky}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            body={
              <>
                {[
                  'Over big festivals',
                  'Creatives & builders',
                  'Culture-makers',
                  'Discovery over hype',
                  'Actually want to connect',
                  'Felt it the moment they found this',
                ].map((role) => (
                  <p key={role} style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.3, textTransform: 'uppercase', opacity: 0.85 }}>
                    {role}
                  </p>
                ))}
              </>
            }
          />
          <DuotonePanel 
            image={crewFriendsGolden} 
            alt="Friends gathering at golden hour" 
            color={COLORS.clay} 
            secondaryColor={COLORS.mustard}
            imageBrightness={1.1}
            colorOpacity={0.55}
            halftoneOpacity={0.3}
            objectPosition="center 40%"
          />
        </div>
      </section>

      {/* ===== 4. ARTISTS ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel 
            image={singerPinkPerforming} 
            alt="Artist performing live on stage" 
            color={COLORS.denim} 
            secondaryColor={COLORS.sage}
            imageBrightness={0.9}
            colorOpacity={0.6}
            halftoneOpacity={0.35}
          />
          <TypographyPanel
            label="THE LINEUP"
            headline={<>You Don't<br />Come Here<br />For Headliners.</>}
            bgColor={COLORS.charcoal}
            textColor={COLORS.white}
            labelColor={COLORS.clay}
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  You come here to discover the artists you didn't know you needed.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  Every set is curated.<br />
                  Every moment is intentional.<br />
                  And by the end of the weekend—you'll have a whole new soundtrack.
                </p>
              </>
            }
          >
            <motion.div className="mt-8" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}>
              <Link to="/lineup" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
              }}>Explore Lineup</Link>
            </motion.div>
          </TypographyPanel>
        </div>
      </section>

      {/* ===== 5. FROM THE FOUNDERS ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          >
            <img 
              src={foundersPortrait} 
              alt="Demo Organizer One and Demo Organizer Two, founders of Cosmico" 
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: 'center 25%' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
            <div className="absolute bottom-0 left-0 right-0 z-10 p-6 md:p-8">
              <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '10px', letterSpacing: '0.1em', opacity: 0.9 }}>
                DEMO ORGANIZER ONE + DEMO ORGANIZER TWO
              </p>
              <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '9px', letterSpacing: '0.1em', opacity: 0.6, marginTop: '4px' }}>
                FOUNDERS · COSMICO
              </p>
              <div className="flex items-center gap-3 mt-4" style={{ opacity: 0.5 }}>
                <p style={{ ...typography.caption, color: COLORS.dustySky, fontSize: '8px', letterSpacing: '0.08em' }}>AS SEEN IN</p>
                <img src={pressSonomaMag} alt="Example Valley Magazine" className="h-7 brightness-0 invert" style={{ opacity: 0.7 }} />
              </div>
            </div>
          </motion.div>

          <TypographyPanel
            label="FROM THE FOUNDERS"
            headline={<>We Built<br />The Festival<br />We Couldn't<br />Find.</>}
            bgColor={COLORS.sage}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            footnote="DEMO ORGANIZER ONE + DEMO ORGANIZER TWO · FOUNDERS"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Something smaller.<br />
                  More intentional.<br />
                  Focused on real connection—not performance.
                </p>
                <p style={{ ...typography.body, color: COLORS.forest, fontSize: '15px', lineHeight: 1.7 }}>
                  A place where the right people find each other—and the noise fades out.
                </p>
              </>
            }
          />
        </div>
      </section>

      {/* ===== 6. THE WEEKEND ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="THE WEEKEND"
            headline={<>Three Days.<br />No Distractions.</>}
            bgColor={COLORS.dustySky}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            footnote="MAY 14–16, 2027"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Music, nature, and the kind of moments you don't need to document to remember.
                </p>
              </>
            }
          >
            <motion.div className="mt-10" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}>
              <Link to="/experience" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: COLORS.forest, color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
              }}>Explore The Weekend</Link>
            </motion.div>
          </TypographyPanel>
          <DuotonePanel 
            image={holdingHandsWristband} 
            alt="Holding hands with festival wristbands" 
            color={COLORS.mustard} 
            secondaryColor={COLORS.clay}
            imageBrightness={1.0}
            colorOpacity={0.55}
            halftoneOpacity={0.3}
          />
        </div>
      </section>

      {/* ===== CINEMATIC DIVIDER ===== */}
      <CinematicDivider 
        image={crowdGolden} 
        alt="Festival crowd at golden hour" 
        color={COLORS.denim} 
        objectPosition="center 50%"
      />

      {/* ===== 7. THE ANALOG PHILOSOPHY ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="THE PHILOSOPHY"
            headline={<>Stop<br />Consuming.<br />Start Feeling.</>}
            bgColor={COLORS.deepWater}
            textColor={COLORS.dustySky}
            labelColor={COLORS.electricLavender}
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  You don't need another weekend scrolling, comparing, and watching everyone else live.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  This is where you put the phone down.<br />
                  Where conversations last longer than stories.<br />
                  Where the experience is the point—not the content.
                </p>
              </>
            }
          />

          <DuotonePanel
            image={nightCrowdMagenta}
            alt="Crowd immersed in music at night"
            color={COLORS.magenta}
            secondaryColor={COLORS.clay}
            imageBrightness={0.9}
            colorOpacity={0.65}
            halftoneOpacity={0.35}
          />
        </div>
      </section>

      {/* ===== 8. PRESENCE / PHONE ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel
            image={discoballPortrait}
            alt="Presence at Cosmico"
            color={COLORS.deepWater}
            secondaryColor={COLORS.electricLavender}
            imageBrightness={0.9}
            colorOpacity={0.6}
            halftoneOpacity={0.3}
          />
          <TypographyPanel
            label="PRESENCE"
            headline={<>The Moment<br />Your Phone<br />Stays In<br />Your Pocket.</>}
            bgColor={COLORS.charcoal}
            textColor={COLORS.dustySky}
            labelColor={COLORS.mustard}
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  No pressure to capture it.<br />
                  No need to prove you were there.<br />
                  Just music, people, and the rare feeling of actually being present.
                </p>
                <p style={{ ...typography.body, color: COLORS.mustard, fontSize: '15px', lineHeight: 1.7 }}>
                  You'll get it.
                </p>
              </>
            }
          />
        </div>
      </section>

      {/* ===== 9. WHY PEOPLE ARE TRYING TO GET IN ===== */}
      <section className="relative" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.2, mixBlendMode: 'overlay' }} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 py-24 md:py-36">
          <div className="max-w-3xl">
            <motion.p 
              style={{ ...typography.caption, color: COLORS.forest, letterSpacing: '0.15em', fontSize: '11px' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            >
              DEMAND SIGNALS
            </motion.p>
            <motion.h2 
              className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mt-6 mb-14"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
            >
              People Are<br />Trying To<br />Get In.
            </motion.h2>

            <motion.div 
              className="space-y-0"
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
            >
              {[
                { quote: "I've been not loving the huge festivals.", who: "— Music lover, Oakland" },
                { quote: "I didn't know the lineup—but I trusted it.", who: "— First-timer, 2025" },
                { quote: "I'd volunteer just to be there.", who: "— Volunteer applicant" },
                { quote: "I've been looking for something like this.", who: "— Creative director, SF" },
              ].map(({ quote, who }, i) => (
                <motion.div 
                  key={i}
                  className="py-6"
                  style={{ borderBottom: `1px solid ${COLORS.charcoal}15` }}
                  initial={{ opacity: 0, y: 10 }} 
                  whileInView={{ opacity: 1, y: 0 }} 
                  viewport={{ once: true }} 
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                >
                  <p style={{ 
                    ...typography.headline, 
                    color: COLORS.charcoal, 
                    fontSize: '20px', 
                    lineHeight: 1.5, 
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                  }}>
                    "{quote}"
                  </p>
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.1em', marginTop: '8px' }}>
                    {who}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== CINEMATIC DIVIDER 2 ===== */}
      <CinematicDivider 
        image={holdingHandsWristband} 
        alt="Connection at the festival" 
        color={COLORS.denim} 
        objectPosition="center center"
      />

      {/* ===== 10. PRESS ===== */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.2, mixBlendMode: 'overlay' }} />
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <motion.p 
            className="text-center mb-12"
            style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.15em', fontSize: '10px' }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          >
            AS SEEN IN
          </motion.p>

          <motion.div 
            className="flex items-center justify-center gap-10 md:gap-16 lg:gap-20 mb-16"
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
          >
            <img src={pressKCRW} alt="KCRW" className="h-10 md:h-14 w-auto" style={{ opacity: 0.4, filter: 'grayscale(100%)' }} />
            <img src={pressSonomaMag} alt="Example Valley Magazine" className="h-8 md:h-11 w-auto" style={{ opacity: 0.4, filter: 'grayscale(100%)' }} />
            <img src={pressPD} alt="The Press Democrat" className="h-5 md:h-7 w-auto" style={{ opacity: 0.4, filter: 'grayscale(100%)' }} />
          </motion.div>

          <motion.div 
            className="max-w-lg mx-auto text-center py-8"
            style={{ borderTop: `2px solid ${COLORS.charcoal}20`, borderBottom: `2px solid ${COLORS.charcoal}20` }}
            initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
          >
            <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '18px', lineHeight: 1.5, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              "A screen-free escape on the Example River."
            </p>
            <p className="mt-4" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.12em' }}>
              — THE PRESS DEMOCRAT
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== 11. FINAL CTA ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="DON'T SIT ON THIS"
            headline={<>If You've<br />Been Looking<br />For Something<br />Real.</>}
            bgColor={COLORS.forest}
            textColor={COLORS.dustySky}
            labelColor={COLORS.sage}
            footnote="MAY 14–16, 2027 · EXAMPLE VALLEY, CA"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Spots are limited.<br />
                  People are already trying to find their way in.
                </p>
                <p style={{ ...typography.body, color: COLORS.sage, fontSize: '15px', lineHeight: 1.7 }}>
                  This is the easiest way.
                </p>
              </>
            }
          >
            <motion.div className="mt-8 flex flex-wrap gap-3" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}>
              <Link to="/tickets" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
              }}>Get Tickets</Link>
              <Link to="/experience" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', border: `1.5px solid ${COLORS.dustySky}`
              }}>See Details</Link>
            </motion.div>
          </TypographyPanel>
          <DuotonePanel 
            image={cosmicoStageNight} 
            alt="Night stage at Cosmico" 
            color={COLORS.mustard} 
            secondaryColor={COLORS.clay}
            colorOpacity={0.65}
            halftoneOpacity={0.35}
          />
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default MayReal;
