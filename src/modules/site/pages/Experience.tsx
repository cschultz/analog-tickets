import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import ScheduleStrip from "@/components/may/ScheduleStrip";

// Images
import crowdGolden from "@/assets/may/crowd-golden.webp";
import kidsSprinkler from "@/assets/may/kids-sprinkler.webp";
import winecampGathering from "@/assets/may/winecamp-gathering.webp";
import denimWoman from "@/assets/may/denim-woman-portrait.webp";
import dinnerLongTable from "@/assets/may/dinner-long-table.jpg";
import { foodVendors } from "@/data/foodVendors";
import { saunaVendors } from "@/data/saunaVendors";
import fjordHero from "@/assets/may/saunavendors/fjord-hero.jpg";
import saunaVillageImg from "@/assets/may/sauna-village.jpg";
import andersonSoundBath from "@/assets/may/saunavendors/anderson-pugash-founder.jpg";
import barHero from "@/assets/may/bar/bar-hero.jpg";
import bigWestBarWestLogo from "@/assets/may/bar/big-west-bar-west-logo.png";
const DuotonePanel = ({
  image,
  alt,
  color,
  secondaryColor = COLORS.denim,
  className = ""
}: {
  image: string;
  alt: string;
  color: string;
  secondaryColor?: string;
  className?: string;
}) => <motion.div className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`} style={{
  backgroundColor: color
}} initial={{
  opacity: 0
}} whileInView={{
  opacity: 1
}} viewport={{
  once: true
}} transition={{
  duration: 0.8
}}>
    <div className="absolute inset-0 pointer-events-none z-10" style={{
    ...heavyGrain,
    opacity: 0.35,
    mixBlendMode: 'overlay'
  }} />
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{
    filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
    mixBlendMode: 'multiply'
  }} />
    <div className="absolute inset-0 pointer-events-none" style={{
    backgroundColor: color,
    mixBlendMode: 'multiply',
    opacity: 0.65
  }} />
    <div className="absolute inset-0 pointer-events-none" style={{
    background: `linear-gradient(180deg, ${secondaryColor}30 0%, transparent 50%, ${color}20 100%)`,
    mixBlendMode: 'overlay'
  }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{
    backgroundImage: halftonePatternDense,
    backgroundSize: '3px 3px',
    mixBlendMode: 'multiply',
    opacity: 0.35
  }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{
    ...heavyGrain,
    opacity: 0.25
  }} />
  </motion.div>;

// Clear image panel - no duotone overlay for natural color images
const ClearImagePanel = ({ image, alt, className = "" }: { image: string; alt: string; className?: string }) => (
  <motion.div className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.15) 100%)' }} />
  </motion.div>
);

const MayExperience = () => {
  useCanonicalUrl('/experience');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Experience",
      item_category: "Festival",
      price: 215,
    });
  }, []);

  return <div className="min-h-screen overflow-hidden" style={{
    backgroundColor: COLORS.dustySky
  }}>
      <MayHeader transparentOnTop />
      {/* HERO */}
      <section className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <ClearImagePanel image={crowdGolden} alt="Crowd at golden hour" />
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16" style={{
          backgroundColor: COLORS.clay
        }} initial={{
          opacity: 0
        }} whileInView={{
          opacity: 1
        }} viewport={{
          once: true
        }} transition={{
          duration: 0.8,
          delay: 0.1
        }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10" style={{
              ...typography.headline,
              color: COLORS.charcoal,
              textTransform: 'uppercase'
            }} initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }} transition={{
              duration: 0.7,
              delay: 0.2
            }}>Run Your<br />Own Fest.</motion.h1>
              <motion.div className="space-y-4 max-w-sm" initial={{
              opacity: 0
            }} whileInView={{
              opacity: 1
            }} viewport={{
              once: true
            }} transition={{
              duration: 0.6,
              delay: 0.4
            }}>
                <p style={{
                ...typography.body,
                color: COLORS.charcoal,
                fontSize: '15px',
                lineHeight: 1.7,
                opacity: 0.9
              }}>Soundchecks over coffee from your deck. New favorite bands you'll never forget. The lawn with the artists, a glass with the winemakers.<br /><br />Small by design — so everyone's part of it.</p>
              </motion.div>
            </div>
            <div className="relative z-10"><p style={{
              ...typography.caption,
              color: COLORS.charcoal,
              letterSpacing: '0.1em',
              fontSize: '10px',
              opacity: 0.5
            }}>MAY 14–16, 2027 · EXAMPLE COUNTY</p></div>
          </motion.div>
        </div>
      </section>

      {/* FOOD */}
      <section className="relative" style={{ backgroundColor: COLORS.deepWater }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <ClearImagePanel image={dinnerLongTable} alt="Long communal table at Field Day dinner" />
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.deepWater }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.02] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
              >
                Example County,<br />Served Right
              </motion.h2>
              <motion.div
                className="space-y-5 max-w-sm"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.65, opacity: 0.9 }}>
                  Every plate comes from a place we already love. Local restaurants, small independents, the spots we go back to all year — cooking on-site, all weekend.
                </p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.65, opacity: 0.9 }}>
                  No filler. No festival food. Just Example County, the way we actually eat.
                </p>

                {/* Restaurant name list */}
                <div className="pt-4">
                  <ul className="space-y-2">
                    {foodVendors.map((vendor) => (
                      <li key={vendor.slug}>
                        <Link
                          to={vendor.slug === "long-table" ? "/fielddayca" : `/eat/${vendor.slug}`}
                          className="group inline-flex items-baseline gap-3 hover:opacity-70 transition-opacity"
                        >
                          <span
                            style={{
                              ...typography.headline,
                              color: COLORS.dustySky,
                              fontSize: '1.15rem',
                              lineHeight: 1.15,
                              textTransform: 'uppercase',
                              letterSpacing: '-0.005em',
                            }}
                          >
                            {vendor.name}
                          </span>
                          {vendor.shortDescriptor && (
                            <span
                              style={{
                                ...typography.body,
                                color: COLORS.mustard,
                                fontSize: '11px',
                                opacity: 0.75,
                              }}
                            >
                              {vendor.shortDescriptor.split('.')[0]}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  to="/eat"
                  className="inline-block mt-4 transition-opacity hover:opacity-70"
                  style={{ ...typography.caption, color: COLORS.mustard, fontSize: '10px', letterSpacing: '0.14em', borderBottom: `1px solid ${COLORS.mustard}`, paddingBottom: '3px' }}
                >
                  EXPLORE THE LINEUP →
                </Link>
              </motion.div>
            </div>
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>EAT WELL</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* BIG WEST STUDIO */}
      <section className="relative" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-2 md:order-1"
            style={{ backgroundColor: COLORS.charcoal }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.div
                className="mb-6 flex items-center gap-3"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.15 }}
              >
                <img src={bigWestBarWestLogo} alt="Big West Studio" className="h-8 md:h-10 w-auto object-contain" style={{ opacity: 0.95 }} />
              </motion.div>
              <motion.h2
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
              >
                Big West Studio<br />× Analog.
              </motion.h2>
              <motion.div
                className="space-y-6 max-w-sm"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Two bars, built around connection. <strong>Coyote</strong> — the full-service bar at the heart of the festival, fully stocked with beer, wine, and premium craft cocktails by the Big West Studio crew.<br /><br />
                  <strong>Raven</strong> — a hosted, VIP-only bar tucked stage-side, with a private viewing area and rotating proprietors pouring all weekend. Every drink included.
                </p>
                <Link
                  to="/bar"
                  className="inline-block transition-opacity hover:opacity-70"
                  style={{ ...typography.caption, color: COLORS.mustard, fontSize: '10px', letterSpacing: '0.12em', borderBottom: `1px solid ${COLORS.mustard}`, paddingBottom: '3px' }}
                >
                  MEET COYOTE & RAVEN →
                </Link>
              </motion.div>
            </div>
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>DRINK WELL</p>
            </div>
          </motion.div>
          <ClearImagePanel image={barHero} alt="The Big West bar at Cosmico in the redwoods at golden hour" className="order-1 md:order-2" />
        </div>
      </section>
      {/* FAMILIES */}
      <section className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-screen">
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16" style={{
          backgroundColor: COLORS.forest
        }} initial={{
          opacity: 0
        }} whileInView={{
          opacity: 1
        }} viewport={{
          once: true
        }} transition={{
          duration: 0.8
        }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.p style={{
                ...typography.caption,
                color: COLORS.sage,
                letterSpacing: '0.12em',
                fontSize: '10px',
                marginBottom: '14px'
              }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.15 }}>HAPPENING AT THE SAME TIME — BY DESIGN</motion.p>
              <motion.h2 className="text-[1.5rem] sm:text-[1.75rem] md:text-[2rem] leading-[1.1] tracking-tight mb-10" style={{
              ...typography.headline,
              color: COLORS.dustySky,
              textTransform: 'uppercase'
            }} initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }} transition={{
              duration: 0.7,
              delay: 0.2
            }}>Wine For Adults.<br />Wonder<br />For Kids.</motion.h2>
              <motion.div className="space-y-4 max-w-sm" initial={{
              opacity: 0
            }} whileInView={{
              opacity: 1
            }} viewport={{
              once: true
            }} transition={{
              duration: 0.6,
              delay: 0.4
            }}>
                <div><p style={{
                  ...typography.caption,
                  color: COLORS.sage,
                  letterSpacing: '0.1em',
                  fontSize: '10px'
                }}>WINECAMP</p><p style={{
                  ...typography.body,
                  color: COLORS.dustySky,
                  fontSize: '15px',
                  marginTop: '4px',
                  opacity: 0.9
                }}>Hang with independent winemakers, taste what they're excited about right now, and talk shop without the pretense.</p>
                  <Link
                    to="/winecamp"
                    className="inline-block mt-3 transition-opacity hover:opacity-70"
                    style={{ ...typography.caption, color: COLORS.sage, fontSize: '10px', letterSpacing: '0.12em', borderBottom: `1px solid ${COLORS.sage}`, paddingBottom: '3px' }}
                  >
                    EXPLORE WINECAMP →
                  </Link>
                </div>
                <div>
                  <p style={{ ...typography.caption, color: COLORS.sage, letterSpacing: '0.1em', fontSize: '10px' }}>ANALOG KIDS</p>
                  <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', marginTop: '4px', opacity: 0.9 }}>
                    Thoughtfully guided art and nature play — so the kids are engaged and having fun while you take your time at WineCamp.
                  </p>
                  <Link
                    to="/tickets"
                    className="inline-block mt-3 transition-opacity hover:opacity-70"
                    style={{ ...typography.caption, color: COLORS.sage, fontSize: '10px', letterSpacing: '0.12em', borderBottom: `1px solid ${COLORS.sage}`, paddingBottom: '3px' }}
                  >
                    KIDS CAMP TICKETS AVAILABLE NOW →
                  </Link>
                </div>
              </motion.div>
            </div>
            <div className="relative z-10"><p style={{
              ...typography.caption,
              color: COLORS.sage,
              letterSpacing: '0.1em',
              fontSize: '10px',
              opacity: 0.6
            }}>FAMILIES WELCOME</p></div>
          </motion.div>
          {/* Stacked image panels: WineCamp top, Kids bottom */}
          <div className="md:col-span-2 grid grid-rows-2 min-h-[50vh] md:min-h-screen">
            <ClearImagePanel image={winecampGathering} alt="WineCamp gathering with independent winemakers" className="!min-h-[25vh] md:!min-h-[50vh]" />
            <ClearImagePanel image={kidsSprinkler} alt="Kids playing in the sprinkler" className="!min-h-[25vh] md:!min-h-[50vh]" />
          </div>
        </div>
      </section>

      {/* SAUNA VILLAGE */}
      <section className="relative" style={{ backgroundColor: COLORS.forest }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-2 md:order-1"
            style={{ backgroundColor: COLORS.forest }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
              >
                Refresh.<br />Recharge.<br />Revive.
              </motion.h2>
              <motion.div
                className="space-y-6 max-w-sm"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  A sauna session with friends old and new, then a cold plunge in the Example River.<br /><br />
                  Sure to get you ready for action each day of the festival.
                </p>

                {/* Sauna logo strip */}
                <div className="pt-2">
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '14px' }}>
                    OUR SAUNA PARTNERS
                  </p>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                    {saunaVendors.filter(v => (v.discipline ?? 'sauna') === 'sauna').map((vendor) => (
                      vendor.logo && (
                        <Link key={vendor.slug} to={`/sauna/${vendor.slug}`} className="block hover:opacity-70 transition-opacity">
                          <img
                            src={vendor.logo}
                            alt={`${vendor.name} logo`}
                            className="h-10 md:h-12 w-auto object-contain"
                            style={{ opacity: 0.95 }}
                          />
                        </Link>
                      )
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>SAUNA VILLAGE</p>
            </div>
          </motion.div>
          <ClearImagePanel image={saunaVillageImg} alt="Sunhouse mobile sauna with friends gathered on the Example River" className="order-1 md:order-2" />
        </div>
      </section>

      {/* SOUND MEDITATION */}
      <section className="relative" style={{ backgroundColor: COLORS.deepWater }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <ClearImagePanel image={andersonSoundBath} alt="Still Hour Sound leading a sound meditation with gongs" className="order-1" />
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-2"
            style={{ backgroundColor: COLORS.deepWater }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}
              >
                Slow<br />the room<br />down.
              </motion.h2>
              <motion.div
                className="space-y-6 max-w-sm"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Sound meditation tucked between the music — gongs, crystal bowls, and overtone instruments.<br /><br />
                  Lay back, close your eyes, let the room go quiet around you.
                </p>

                <div className="pt-2">
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '14px' }}>
                    LED BY
                  </p>
                  <Link
                    to="/sauna/still-hour"
                    className="inline-block hover:opacity-70 transition-opacity"
                    style={{ ...typography.headline, color: COLORS.dustySky, fontSize: '1.25rem', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${COLORS.mustard}80`, paddingBottom: '4px' }}
                  >
                    Still Hour Sound →
                  </Link>
                </div>
              </motion.div>
            </div>
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>SOUND MEDITATION</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* BIG WEST STUDIO TEASER */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '4px 4px', mixBlendMode: 'multiply', opacity: 0.15 }} />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '20px' }}
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
          >
            BIG WEST × COSMICO
          </motion.p>
          <motion.h2
            className="text-[2rem] sm:text-[2.5rem] md:text-[3.25rem] leading-[1.05] tracking-tight uppercase mb-8"
            style={{ ...typography.headline, color: COLORS.dustySky }}
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
          >
            Introducing Big West Studio
          </motion.h2>
          <motion.p
            className="max-w-xl mx-auto mb-10"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1.05rem', lineHeight: 1.7, opacity: 0.9 }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
          >
            Two bar environments — <em>Coyote</em> and <em>Raven</em> — curated by the team behind Big West. Where craft meets connection, all weekend long.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}>
            <Link
              to="/bar"
              className="inline-block px-10 py-4 hover:opacity-90 transition-opacity"
              style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, fontSize: '13px', letterSpacing: '0.05em' }}
            >
              Explore the bar program
            </Link>
          </motion.div>
        </div>
      </section>

      {/* WEEKEND RHYTHM */}
      <section className="relative py-24 md:py-32" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.35} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px' }} className="mb-4">THE RHYTHM</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl mb-16" style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase', lineHeight: 1.1 }}>
              A Weekend That<br />Looks Like This
            </h2>
          </motion.div>
          
          <motion.div className="space-y-10" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}>
            {[
              { label: 'FRIDAY', text: 'Arrival in Example Valley. Friends reconnect. The music begins.' },
              { label: 'SATURDAY', text: 'Start the day in the sauna before river swims, afternoon sets, and long golden-hour evenings.' },
              { label: 'NIGHT', text: 'Dancing under the open sky as the music carries late into the night.' },
              { label: 'SUNDAY', text: "VIP guests gather along a quiet creek at the founders' home for an intimate closing of the weekend." },
            ].map((item) => (
              <div key={item.label}>
                <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '10px' }} className="mb-2">{item.label}</p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', lineHeight: 1.75, opacity: 0.9 }}>{item.text}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* WHAT MAKES ANALOG DIFFERENT */}
      <section className="relative min-h-[60vh]" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 h-full min-h-[60vh] flex flex-col justify-center p-8 md:p-16 lg:p-24 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <h2 className="text-2xl sm:text-3xl md:text-4xl mb-12" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase', lineHeight: 1.1 }}>
              What Makes This<br />Gathering Different
            </h2>
          </motion.div>
          <motion.div className="space-y-5" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.95 }}>Cosmico was designed to feel different from typical festivals.</p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>The crowd is intentionally small.</p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>The music is carefully curated.</p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>The setting invites people to slow down.</p>
            <p style={{ ...typography.body, color: COLORS.denim, fontSize: '17px', lineHeight: 1.8 }}>It's a weekend built for presence, creativity, and connection.</p>
          </motion.div>
        </div>
      </section>

      {/* THE PEOPLE */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <DuotonePanel image={denimWoman} alt="Community member" color={COLORS.magenta} secondaryColor={COLORS.electricLavender} className="order-2 md:order-1" />
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-1 md:order-2" style={{ backgroundColor: COLORS.clay }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10" style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>
                The<br />People
              </motion.h2>
              <motion.p className="max-w-sm" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}>
                Artists, creators, families, and curious minds come together each year in Example County to share music, conversation, and the simple joy of being present together.
              </motion.p>
            </div>
            <div className="relative z-10"><p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.5 }}>COMMUNITY</p></div>
          </motion.div>
        </div>
      </section>

      {/* TICKET CTA */}
      <section className="relative min-h-[60vh]" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 h-full min-h-[60vh] flex flex-col justify-center items-center p-8 md:p-16 lg:p-24 text-center">
          <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-6" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>
            Join The Gathering
          </motion.h2>
          <motion.p className="mb-10" style={{ ...typography.body, color: COLORS.dustySky, fontSize: '16px', lineHeight: 1.7, opacity: 0.85 }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.4 }}>
            700 people. Three days. Example County.
          </motion.p>
          <motion.div className="flex flex-col sm:flex-row gap-4" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.5 }}>
            <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em' }}>
              <Link to="/tickets">Get Weekend Pass</Link>
            </Button>
            <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{ ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', border: `1.5px solid ${COLORS.dustySky}60` }}>
              <Link to="/tickets">Explore Tickets</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <ScheduleStrip />
      <MayFooter />
    </div>;
};
export default MayExperience;