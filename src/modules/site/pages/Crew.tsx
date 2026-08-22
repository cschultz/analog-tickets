import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";

// Photos
import crewStage from "@/assets/may/crew-stage-crowd.webp";
import crewFriendsGolden from "@/assets/may/crew-friends-golden.webp";
import dockHangout from "@/assets/may/dock-hangout-river.webp";
import singerPinkPerforming from "@/assets/may/singer-pink-performing.webp";
import foundersPortrait from "@/assets/may/founders-portrait.webp";
import cosmicoStageNight from "@/assets/may/cosmico-stage-night.webp";
import holdingHandsWristband from "@/assets/may/holding-hands-wristband.webp";
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

const MayCrew = () => {
  useCanonicalUrl('/crew');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Crew Landing",
      item_category: "Festival",
      price: 215,
    });
  }, []);

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== 1. HERO ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel 
            image={crewStage} 
            alt="Friends at Cosmico" 
            color={COLORS.forest} 
            secondaryColor={COLORS.sage}
            imageBrightness={1.1}
            colorOpacity={0.45}
            halftoneOpacity={0.25}
            objectPosition="center 30%"
          />

          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.clay }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1 
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                Bring<br />Your Crew
              </motion.h1>

              <motion.div className="mt-10 md:mt-14 max-w-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.7 }}>
                <p className="text-sm md:text-base mb-4" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.9, lineHeight: 1.6 }}>
                  Three days of music, river swims, and late-night sets in Example County.
                </p>
                <p className="text-sm md:text-base" style={{ ...typography.body, color: COLORS.denim, lineHeight: 1.6 }}>
                  Bring the friends you wish you saw more often.
                </p>
              </motion.div>

              <motion.div className="mt-10 flex flex-wrap gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.9 }}>
                <Link to="/tickets" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                  ...typography.button, backgroundColor: COLORS.charcoal, color: COLORS.clay, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
                }}>Get Weekend Pass</Link>
                <Link to="/experience" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                  ...typography.button, backgroundColor: 'transparent', color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', border: `1.5px solid ${COLORS.charcoal}`
                }}>Explore the Weekend</Link>
              </motion.div>
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
            label="THE GATHERING"
            headline={<>A Different<br />Kind Of<br />Festival.</>}
            bgColor={COLORS.dustySky}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            footnote="700 ATTENDEES · EXAMPLE COUNTY"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Cosmico isn't about massive crowds or headliners you already know.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  It's about discovering new music, reconnecting with people you care about, and spending a weekend in the real world.
                </p>
                <p style={{ ...typography.body, color: COLORS.denim, fontSize: '15px', lineHeight: 1.7 }}>
                  Limited to 700 people, the gathering stays intentionally small so conversations, creativity, and community can flourish.
                </p>
              </>
            }
          />
          <DuotonePanel 
            image={crewFriendsGolden} 
            alt="Friends gathering at golden hour" 
            color={COLORS.denim} 
            secondaryColor={COLORS.forest}
            imageBrightness={1.1}
            colorOpacity={0.4}
            objectPosition="center 25%"
          />
        </div>
      </section>

      {/* ===== 3. WHO COMES ===== */}
      <section className="relative" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.2, mixBlendMode: 'overlay' }} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 py-24 md:py-36">
          <div className="max-w-3xl">
            <motion.p 
              style={{ ...typography.caption, color: COLORS.forest, letterSpacing: '0.15em', fontSize: '11px' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            >
              WHO COMES
            </motion.p>
            <motion.h2 
              className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mt-6 mb-6"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
            >
              Who Comes
            </motion.h2>

            <motion.div 
              className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-8 mb-14"
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}
            >
              {['Musicians', 'Winemakers', 'Artists', 'Designers', 'Writers', 'Founders', 'Families', 'Curious humans'].map((role) => (
                <p key={role} style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '18px', lineHeight: 1.3, textTransform: 'uppercase' }}>
                  {role}
                </p>
              ))}
            </motion.div>

            <motion.p
              style={{ ...typography.body, color: COLORS.denim, fontSize: '15px', lineHeight: 1.7 }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
            >
              People who want to live more in the real world.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ===== 4. THE WEEKEND ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel 
            image={dockHangout} 
            alt="River gathering at Cosmico" 
            color={COLORS.forest} 
            secondaryColor={COLORS.sage}
            imageBrightness={1.1}
            colorOpacity={0.4}
            halftoneOpacity={0.25}
          />
          <TypographyPanel
            label="THE WEEKEND"
            headline={<>Daylight<br />To<br />Firelight.</>}
            bgColor={COLORS.charcoal}
            textColor={COLORS.white}
            labelColor={COLORS.clay}
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Mornings start slow along the Example River.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  Afternoons drift between music, conversation, and swims.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  As the sun sets, the crowd gathers again for the next set.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  And the next conversation.
                </p>
                <p style={{ ...typography.body, color: COLORS.mustard, fontSize: '15px', lineHeight: 1.7 }}>
                  And the next moment you'll remember.
                </p>
              </>
            }
          />
        </div>
      </section>

      {/* ===== 5. MUSIC ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="THE LINEUP"
            headline={<>Discover<br />Your New<br />Favorite<br />Artists.</>}
            bgColor={COLORS.sage}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Featuring The Heavy Heavy and a curated lineup of rising artists.
                </p>
              </>
            }
          >
            <motion.div className="mt-8" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}>
              <Link to="/lineup" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: COLORS.forest, color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
              }}>View Lineup</Link>
            </motion.div>
          </TypographyPanel>
          <DuotonePanel 
            image={singerPinkPerforming} 
            alt="Artist performing live on stage" 
            color={COLORS.clay} 
            secondaryColor={COLORS.mustard}
            imageBrightness={1.0}
            colorOpacity={0.45}
          />
        </div>
      </section>

      {/* ===== 6. FROM THE FOUNDERS ===== */}
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
            headline={<>From The<br />Founders.</>}
            bgColor={COLORS.dustySky}
            textColor={COLORS.charcoal}
            labelColor={COLORS.forest}
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Cosmico began as a simple idea: create space for people to gather in the real world around music, creativity, and community.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
                  What started as small gatherings among friends has grown into a weekend designed to bring people together along the Example River.
                </p>
                <motion.div 
                  className="py-8 px-0 mt-4" 
                  style={{ borderTop: `2px solid ${COLORS.forest}40`, borderBottom: `2px solid ${COLORS.forest}40` }}
                  initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}
                >
                  <p style={{ 
                    ...typography.headline, 
                    color: COLORS.forest, 
                    fontSize: '20px', 
                    lineHeight: 1.5, 
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                  }}>
                    "Cosmico brings indie music and connection to the Example River."
                  </p>
                  <p style={{ ...typography.caption, color: COLORS.charcoal, marginTop: '14px', fontSize: '10px', opacity: 0.6 }}>
                    — EXAMPLE VALLEY MAGAZINE
                  </p>
                </motion.div>
              </>
            }
          />
        </div>
      </section>

      {/* ===== 7. PRESS ===== */}
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

      {/* ===== 8. FINAL CTA ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <TypographyPanel
            label="JOIN US"
            headline={<>Join<br />The<br />Gathering.</>}
            bgColor={COLORS.forest}
            textColor={COLORS.dustySky}
            labelColor={COLORS.sage}
            footnote="MAY 14–16, 2027 · EXAMPLE VALLEY, CALIFORNIA"
            body={
              <>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  May 14–16, 2027<br />
                  Example Valley, California
                </p>
              </>
            }
          >
            <motion.div className="mt-8 flex flex-wrap gap-3" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}>
              <Link to="/tickets" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
              }}>Get Weekend Pass</Link>
              <Link to="/tickets" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', border: `1.5px solid ${COLORS.dustySky}`
              }}>View Tickets</Link>
            </motion.div>
          </TypographyPanel>
          <DuotonePanel 
            image={cosmicoStageNight} 
            alt="Night stage at Cosmico" 
            color={COLORS.clay} 
            secondaryColor={COLORS.mustard}
          />
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default MayCrew;
