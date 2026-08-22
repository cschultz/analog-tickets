import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";
import { Button } from "@/components/ui/button";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import EmailCapture from "@/components/may/EmailCapture";
import ScheduleStrip from "@/components/may/ScheduleStrip";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import DemoSiteNotice from "@/components/DemoSiteNotice";

import { COLORS, typography, heavyGrain, halftonePattern, halftonePatternDense, fadeInUp } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem, initScrollDepthTracking } from "@/components/AnalyticsTracking";
import { useImagePreload, useExternalPreconnects } from "@/lib/preload";
import analogLogoWordmark from "@/assets/analog-logo-wordmark.webp";
import analogLogoGolden from "@/assets/analog-logo-golden.webp";

// Festival photos
import crowdGolden from "@/assets/may/crowd-golden.webp";
import foundersRitual from "@/assets/may/founders-ritual.webp";
import discoBallPortrait from "@/assets/may/disco-ball-portrait.webp";
import { PLACEHOLDER_MEDIA } from "@/platform/media/placeholderMedia";
import cosmicoStageNight from "@/assets/may/cosmico-stage-night.webp";
import handsRaisedBokeh from "@/assets/may/hands-raised-bokeh.webp";
import lineupPoster from "@/assets/may/analog-poster-2026.webp";
import pressKCRW from "@/assets/may/press-kcrw.webp";
import pressPD from "@/assets/may/press-pd.webp";
import pressSonomaMag from "@/assets/may/press-sonoma-mag.webp";
const MayIndex = () => {
  const heroRef = useRef<HTMLElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const {
    scrollY
  } = useScroll();
  const {
    scrollYProgress
  } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  const logoScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.35]);
  const logoOpacity = useTransform(scrollYProgress, [0, 0.3, 0.5], [1, 1, 0]);
  useMotionValueEvent(scrollY, "change", latest => {
    setHasScrolled(latest > 100);
  });
  useCanonicalUrl('/');
  
  // Preload hero images for faster LCP
  useImagePreload([PLACEHOLDER_MEDIA.hero, cosmicoStageNight], true);
  
  // Preconnect to external services
  useExternalPreconnects();
  
  // Track view_item on page load (fires once per session per page)
  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico Ticket",
      item_category: "Festival Ticket",
      price: 215,
    });
    const cleanup = initScrollDepthTracking();
    return cleanup;
  }, []);

  return <div className="min-h-screen overflow-hidden" style={{
    backgroundColor: COLORS.dustySky
  }}>
      
      <MayHeader transparentOnTop forceLightText={!hasScrolled} />

      {/* ===== 1. HERO: CLEAN SPLIT SPREAD ===== */}
      <section ref={heroRef} className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          {/* ===== LEFT PANEL: Duotone Image with Logo ===== */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen overflow-hidden" style={{
          backgroundColor: COLORS.forest
        }} initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} transition={{
          duration: 0.8,
          delay: 0.1
        }}>
            <div className="absolute inset-0 pointer-events-none z-10" style={{
            ...heavyGrain,
            opacity: 0.25,
            mixBlendMode: 'overlay'
          }} />
            
            <img src={PLACEHOLDER_MEDIA.hero} alt="Festival moment" className="absolute inset-0 w-full h-full object-cover" style={{
            filter: 'grayscale(100%) contrast(1.1) brightness(1.1)',
            mixBlendMode: 'multiply'
          }} />
            
            <div className="absolute inset-0 pointer-events-none" style={{
            backgroundColor: COLORS.mustard,
            mixBlendMode: 'multiply',
            opacity: 0.45
          }} />
            
            <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(180deg, ${COLORS.clay}20 0%, transparent 40%, ${COLORS.forest}15 100%)`,
            mixBlendMode: 'overlay'
          }} />
            
            <div className="absolute inset-0 pointer-events-none z-20" style={{
            backgroundImage: halftonePatternDense,
            backgroundSize: '3px 3px',
            mixBlendMode: 'multiply',
            opacity: 0.25
          }} />
            
            <div className="absolute inset-0 pointer-events-none z-20" style={{
            ...heavyGrain,
            opacity: 0.2
          }} />
            
            {/* Empty top for cleaner design */}
            
            {/* ANALOG Logo at bottom - positioned to avoid image overlap */}
            <motion.div className="absolute bottom-8 md:bottom-12 left-6 md:left-8 right-6 md:right-8 z-30 origin-bottom-left" style={{
            scale: logoScale,
            opacity: logoOpacity
          }} initial={{
            opacity: 0,
            y: 30
          }} animate={{
            opacity: 1,
            y: 0
          }} transition={{
            duration: 0.7,
            delay: 0.4
          }}>
              <img src={analogLogoWordmark} alt="Analog" className="h-20 sm:h-24 md:h-32 lg:h-40 xl:h-44 w-auto" style={{
              filter: 'brightness(0) invert(0.95) sepia(0.1) saturate(0.8)'
            }} />
            </motion.div>
          </motion.div>
          
          {/* ===== RIGHT PANEL: Solid Color with Typography ===== */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16" style={{
          backgroundColor: COLORS.clay
        }} initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} transition={{
          duration: 0.8,
          delay: 0.2
        }}>
            <FilmGrainOverlay opacity={0.5} />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight" style={{
              ...typography.headline,
              color: COLORS.charcoal,
              textTransform: 'uppercase'
            }} initial={{
              opacity: 0,
              y: 20
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              duration: 0.7,
              delay: 0.5,
              ease: [0.22, 1, 0.36, 1]
            }}>
                Live In<br />The Real
              </motion.h1>
              
              <motion.div className="mt-10 md:mt-14 max-w-md" initial={{
              opacity: 0
            }} animate={{
              opacity: 1
            }} transition={{
              duration: 0.6,
              delay: 0.7
            }}>
                <p className="text-sm md:text-base mb-4" style={{
                ...typography.body,
                color: COLORS.charcoal,
                opacity: 0.9,
                lineHeight: 1.6
              }}>
                  Three days of music, river swims, and real-world connection in Example County.
                </p>
              </motion.div>
              
              <motion.div className="mt-10 flex flex-wrap gap-3" initial={{
              opacity: 0
            }} animate={{
              opacity: 1
            }} transition={{
              duration: 0.5,
              delay: 0.9
            }}>
                <Button asChild className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button,
                backgroundColor: COLORS.charcoal,
                color: COLORS.clay,
                borderRadius: '0',
                fontWeight: 500,
                letterSpacing: '0.05em'
              }}>
                  <Link to="/tickets">Join the Gathering</Link>
                </Button>
                <Button asChild className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.charcoal,
                borderRadius: '0',
                fontWeight: 500,
                letterSpacing: '0.05em',
                border: `1.5px solid ${COLORS.charcoal}`
              }}>
                  <Link to="/experience">Explore the Weekend</Link>
                </Button>
              </motion.div>
            </div>
            
            <motion.div className="relative z-10" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} transition={{
            duration: 0.5,
            delay: 1
          }}>
              <p style={{
              ...typography.caption,
              color: COLORS.charcoal,
              letterSpacing: '0.12em',
              fontSize: '13px',
              fontWeight: 500
            }}>
                MAY 14–16, 2027 · EXAMPLE VALLEY, CA
              </p>
              <p style={{
              ...typography.caption,
              color: COLORS.charcoal,
              letterSpacing: '0.12em',
              fontSize: '11px',
              fontWeight: 500,
              opacity: 0.6,
              marginTop: '4px'
            }}>
                LIMITED TO 700 ATTENDEES
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>


      {/* ===== PRESS CREDIBILITY ===== */}
      <section className="relative py-16 md:py-20" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          ...heavyGrain,
          opacity: 0.2,
          mixBlendMode: 'overlay'
        }} />
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <motion.p 
            className="text-center mb-10"
            style={{
              ...typography.caption,
              color: COLORS.boulder,
              letterSpacing: '0.15em',
              fontSize: '10px'
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            FEATURED IN
          </motion.p>
          
          <motion.div 
            className="flex items-center justify-center gap-10 md:gap-16 lg:gap-20 mb-14"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <img src={pressKCRW} alt="KCRW" className="h-10 md:h-14 w-auto" style={{ opacity: 0.4, filter: 'grayscale(100%)' }} />
            <img src={pressSonomaMag} alt="Example Valley Magazine" className="h-8 md:h-11 w-auto" style={{ opacity: 0.4, filter: 'grayscale(100%)' }} />
            <img src={pressPD} alt="The Press Democrat" className="h-5 md:h-7 w-auto" style={{ opacity: 0.4, filter: 'grayscale(100%)' }} />
          </motion.div>
          
          <motion.div 
            className="max-w-lg mx-auto text-center"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <p style={{
              ...typography.headline,
              color: COLORS.charcoal,
              fontSize: '18px',
              lineHeight: 1.7,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              opacity: 0.85,
            }}>
              "A screen-free escape on the Example River."
            </p>
            <p className="mt-4" style={{
              ...typography.caption,
              color: COLORS.boulder,
              letterSpacing: '0.12em',
              fontSize: '10px',
            }}>
              — THE PRESS DEMOCRAT
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== ONE WEEK OUT — CLARITY BAR ===== */}
      <section style={{ backgroundColor: COLORS.clay }} className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.2, mixBlendMode: 'overlay' }} />
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-5 md:py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4 md:mb-5">
            <span
              style={{
                ...typography.caption,
                color: COLORS.white,
                letterSpacing: '0.18em',
                fontSize: '11px',
              }}
            >
              ONE WEEK OUT · MAY 14–16
            </span>
            <span
              className="hidden md:inline"
              style={{
                ...typography.body,
                color: COLORS.white,
                fontSize: '14px',
                opacity: 0.9,
              }}
            >
              The two questions everyone's asking →
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-3 md:gap-4">
            {/* Getting Here — critical */}
            <Link
              to="/getting-here"
              className="group block hover:opacity-95 transition-opacity"
              style={{
                backgroundColor: COLORS.white,
                padding: '18px 20px',
                border: `2px solid ${COLORS.charcoal}`,
                textDecoration: 'none',
              }}
            >
              <p
                style={{
                  ...typography.caption,
                  color: COLORS.clay,
                  fontSize: '10px',
                  letterSpacing: '0.16em',
                  marginBottom: '6px',
                }}
              >
                HOW DO I GET THERE?
              </p>
              <p
                style={{
                  ...typography.subhead,
                  color: COLORS.charcoal,
                  fontSize: '17px',
                  lineHeight: 1.25,
                  marginBottom: '8px',
                }}
              >
                Parking, shuttles & the map
              </p>
              <span
                className="group-hover:opacity-70 transition-opacity"
                style={{
                  ...typography.caption,
                  color: COLORS.charcoal,
                  fontSize: '10px',
                  letterSpacing: '0.14em',
                  borderBottom: `1px solid ${COLORS.charcoal}`,
                  paddingBottom: '2px',
                }}
              >
                GETTING HERE GUIDE →
              </span>
            </Link>

            {/* Everything else */}
            <Link
              to="/almost-here"
              className="group block hover:opacity-95 transition-opacity"
              style={{
                backgroundColor: COLORS.white,
                padding: '18px 20px',
                border: `2px solid ${COLORS.charcoal}`,
                textDecoration: 'none',
              }}
            >
              <p
                style={{
                  ...typography.caption,
                  color: COLORS.clay,
                  fontSize: '10px',
                  letterSpacing: '0.16em',
                  marginBottom: '6px',
                }}
              >
                STILL HAVE QUESTIONS?
              </p>
              <p
                style={{
                  ...typography.subhead,
                  color: COLORS.charcoal,
                  fontSize: '17px',
                  lineHeight: 1.25,
                  marginBottom: '8px',
                }}
              >
                Lodging, schedule, food, the rest
              </p>
              <span
                className="group-hover:opacity-70 transition-opacity"
                style={{
                  ...typography.caption,
                  color: COLORS.charcoal,
                  fontSize: '10px',
                  letterSpacing: '0.14em',
                  borderBottom: `1px solid ${COLORS.charcoal}`,
                  paddingBottom: '2px',
                }}
              >
                READ EVERYTHING →
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section style={{ backgroundColor: COLORS.dustySky }}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 md:py-5">
          <Link
            to="/my-tickets"
            className="group block rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:opacity-95"
            style={{
              backgroundColor: COLORS.white,
              borderColor: `${COLORS.charcoal}12`,
              boxShadow: `0 10px 30px -24px ${COLORS.charcoal}40`,
            }}
          >
            <div className="flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-7">
              <div className="min-w-0 md:flex-1">
                <div
                  className="inline-flex items-center rounded-full px-3 py-1"
                  style={{
                    backgroundColor: `${COLORS.denim}10`,
                    color: COLORS.denim,
                    ...typography.caption,
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                  }}
                >
                  ALREADY BOOKED?
                </div>
                <p
                  className="mt-3"
                  style={{
                    ...typography.subhead,
                    color: COLORS.charcoal,
                    fontSize: "clamp(20px, 2.5vw, 24px)",
                    lineHeight: 1.1,
                  }}
                >
                  Manage your booking
                </p>
                <p
                  style={{
                    ...typography.body,
                    color: COLORS.boulder,
                    fontSize: "14px",
                    marginTop: "8px",
                    maxWidth: "38rem",
                    lineHeight: 1.5,
                  }}
                >
                  See tickets, add accommodations, and purchase add-ons.
                </p>
              </div>

              <div className="flex items-center md:justify-end">
                <div
                  className="inline-flex items-center gap-3 px-5 py-3 transition-opacity duration-300 group-hover:opacity-90"
                  style={{
                    backgroundColor: COLORS.clay,
                    color: COLORS.charcoal,
                    ...typography.button,
                    fontSize: "13px",
                    borderRadius: "0",
                    letterSpacing: "0.05em",
                  }}
                >
                  Manage Booking
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ===== 2. FULL-WIDTH POSTER SECTION ===== */}
      <section className="relative py-20 md:py-32" style={{
      backgroundColor: COLORS.deepWater
    }}>
        <FilmGrainOverlay opacity={0.15} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 flex flex-col items-center">
          <motion.img src={lineupPoster} alt="Cosmico 2026 Lineup Poster" className="w-full max-w-lg h-auto" style={{
          boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.08)'
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
        }} />
          <motion.div className="mt-10 flex flex-wrap justify-center gap-4" initial={{
          opacity: 0
        }} whileInView={{
          opacity: 1
        }} viewport={{
          once: true
        }} transition={{
          duration: 0.5,
          delay: 0.4
        }}>
            <Button asChild className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
            ...typography.button,
            backgroundColor: COLORS.clay,
            color: COLORS.charcoal,
            borderRadius: '0',
            fontWeight: 500,
            letterSpacing: '0.05em'
          }}>
              <Link to="/tickets">Get Tickets</Link>
            </Button>
            <Button asChild className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
            ...typography.button,
            backgroundColor: 'transparent',
            color: COLORS.dustySky,
            borderRadius: '0',
            fontWeight: 500,
            letterSpacing: '0.05em',
            border: `1.5px solid ${COLORS.dustySky}60`
          }}>
              <Link to="/lineup">View Full Lineup</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ===== MIXTAPE TEASER ===== */}
      <section className="relative py-10 md:py-12 overflow-hidden" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <Link
            to="/mixtape"
            className="group flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-8"
          >
            <div className="flex items-center gap-4">
              <span
                className="inline-flex items-center justify-center w-10 h-10 shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: COLORS.mustard, color: COLORS.charcoal }}
                aria-hidden
              >
                ▶
              </span>
              <div>
                <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '11px' }}>
                  AN ANALOG MIXTAPE · BY GILLIGAN MOSS
                </p>
                <p
                  className="mt-1 text-lg md:text-2xl"
                  style={{ ...typography.headline, color: COLORS.white, lineHeight: 1.1 }}
                >
                  Press play. Roll the windows down.
                </p>
              </div>
            </div>
            <span
              className="self-start md:self-auto inline-flex items-center gap-2 transition-opacity group-hover:opacity-80"
              style={{ ...typography.caption, color: COLORS.dustySky, letterSpacing: '0.1em', fontSize: '11px' }}
            >
              LISTEN →
            </span>
          </Link>
        </div>
      </section>

      {/* ===== 2B. WHAT IS THIS: Clean Split Layout ===== */}
      <section className="relative min-h-[80vh]" style={{
      backgroundColor: COLORS.dustySky
    }}>
        <div className="absolute inset-0 pointer-events-none" style={{
        ...heavyGrain,
        opacity: 0.2,
        mixBlendMode: 'overlay'
      }} />
        <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: halftonePattern,
        backgroundSize: '4px 4px',
        mixBlendMode: 'multiply',
        opacity: 0.08
      }} />
        
        <div className="relative z-10 container mx-auto px-6 md:px-12 py-20 md:py-32">
          <div className="max-w-3xl">
            <motion.p style={{
            ...typography.caption,
            color: COLORS.forest,
            letterSpacing: '0.15em',
            fontSize: '11px'
          }} initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }}>
              WHAT IS THIS
            </motion.p>
            
            <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mt-6 mb-12" style={{
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
          }}>
              A Three-Day Music + Community Gathering.
            </motion.h2>
            
            <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-8" initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.6,
            delay: 0.4
          }}>
              {[{
              label: 'WHAT',
              text: 'Music discovery. Artists on the rise. Ceremony. WineCamp with Example County\'s finest winemakers. Late-night dancing.'
            }, {
              label: 'WHEN',
              text: 'May 14–16, 2027. Friday and Saturday for all. Sunday reserved for VIP.'
            }, {
              label: 'WHERE',
              text: 'Example Valley, CA. Set on the Example River, surrounded by vineyards of Example County.'
            }].map(item => <div key={item.label}>
                  <p className="text-xs mb-2" style={{
                ...typography.caption,
                color: COLORS.denim,
                letterSpacing: '0.15em'
              }}>
                    {item.label}
                  </p>
                  <p style={{
                ...typography.body,
                color: COLORS.charcoal,
                fontSize: '15px',
                lineHeight: 1.5
              }}>
                    {item.text}
                  </p>
                </div>)}
            </motion.div>
            
            <motion.p className="mt-16" style={{
            ...typography.caption,
            color: COLORS.boulder,
            letterSpacing: '0.1em',
            fontSize: '10px'
          }} initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.5,
            delay: 0.6
          }}>
              COSMICO · FICTIONAL DEMO EVENT
            </motion.p>
            
            {/* Email Capture - Primary Location */}
            <motion.div 
              className="mt-16 max-w-md"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <EmailCapture
                variant="stacked"
                headline="Stay in the Loop"
                subheadline="Get lineup updates, early access, and festival news delivered to your inbox."
                buttonText="Subscribe"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== 3. WHY WE GATHER ===== */}
      <section className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          <motion.div className="relative min-h-[50vh] md:min-h-screen overflow-hidden order-2 md:order-1" style={{
          backgroundColor: COLORS.deepWater
        }} initial={{
          opacity: 0
        }} whileInView={{
          opacity: 1
        }} viewport={{
          once: true
        }} transition={{
          duration: 0.8
        }}>
            <img src={foundersRitual} alt="Founders ritual" className="absolute inset-0 w-full h-full object-cover" />
          </motion.div>
          
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-1 md:order-2" style={{
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
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10" style={{
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
            }}>
                We Don't<br />Do This<br />To Escape.
              </motion.h2>
              
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
              }}>
                  We do it to remember what we've been missing.
                </p>
                <p style={{
                ...typography.body,
                color: COLORS.charcoal,
                fontSize: '15px',
                lineHeight: 1.7
              }}>
                  Three days. One shared experience.<br />Old friends. New ones too.<br />The kind of weekend people talk about for years.
                </p>
              </motion.div>
            </div>
            
            <motion.div className="relative z-10" initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.5,
            delay: 0.6
          }}>
              <p style={{
              ...typography.caption,
              color: COLORS.charcoal,
              letterSpacing: '0.1em',
              fontSize: '10px',
              opacity: 0.6
            }}>
                PRESENCE OVER DISTRACTION
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ===== 4. WHAT IT FEELS LIKE - 2/3 + 1/3 Layout ===== */}
      <section className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-screen">
          
          {/* 2/3 WIDTH - Text Panel */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen md:col-span-2 flex flex-col justify-between p-8 md:p-12 lg:p-20" style={{
          backgroundColor: COLORS.denim
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
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-12" style={{
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
            }}>
                You'll Know It<br />When You're Here.
              </motion.h2>
              
              <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl" initial={{
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
                color: '#FFFFFF',
                fontSize: '15px',
                lineHeight: 1.7,
                opacity: 0.9
              }}>
                  You forget where your phone is — and don't miss it.
                </p>
                <p style={{
                ...typography.body,
                color: '#FFFFFF',
                fontSize: '15px',
                lineHeight: 1.7
              }}>
                  You stop watching and start joining in.
                </p>
                <p style={{
                ...typography.body,
                color: '#FFFFFF',
                fontSize: '15px',
                lineHeight: 1.7
              }}>
                  By Sunday, strangers feel like old friends.
                </p>
              </motion.div>
            </div>
            
            <motion.div className="relative z-10" initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.5,
            delay: 0.6
          }}>
              <p style={{
              ...typography.caption,
              color: COLORS.dustySky,
              letterSpacing: '0.1em',
              fontSize: '10px',
              opacity: 0.5
            }}>
                COMMUNITY OVER ISOLATION
              </p>
            </motion.div>
          </motion.div>
          
          {/* 1/3 WIDTH - Image Panel */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen md:col-span-1 overflow-hidden" style={{
          backgroundColor: COLORS.magenta
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
            <div className="absolute inset-0 pointer-events-none z-10" style={{
            ...heavyGrain,
            opacity: 0.35,
            mixBlendMode: 'overlay'
          }} />
            <img src={discoBallPortrait} alt="Disco ball portrait" className="absolute inset-0 w-full h-full object-cover" style={{
            filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
            mixBlendMode: 'multiply'
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            backgroundColor: COLORS.magenta,
            mixBlendMode: 'multiply',
            opacity: 0.65
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(180deg, ${COLORS.electricLavender}30 0%, transparent 50%, ${COLORS.deepWater}20 100%)`,
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
          </motion.div>
        </div>
      </section>

      {/* ===== 5. PROOF OF ENERGY - 1/3 + 2/3 Layout (Reversed) ===== */}
      <section className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-screen">
          
          {/* 1/3 WIDTH - Image Panel */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen md:col-span-1 overflow-hidden order-2 md:order-1" style={{
          backgroundColor: COLORS.mustard
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
            <img src={handsRaisedBokeh} alt="Hands raised" className="absolute inset-0 w-full h-full object-cover" style={{
            filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
            mixBlendMode: 'multiply'
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            backgroundColor: COLORS.mustard,
            mixBlendMode: 'multiply',
            opacity: 0.65
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(180deg, ${COLORS.clay}20 0%, transparent 50%, ${COLORS.forest}15 100%)`,
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
          </motion.div>
          
          {/* 2/3 WIDTH - Text Panel */}
          <motion.div className="relative min-h-[50vh] md:min-h-screen md:col-span-2 flex flex-col justify-between p-8 md:p-12 lg:p-20 order-1 md:order-2" style={{
          backgroundColor: COLORS.sage
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
            <div className="absolute inset-0 pointer-events-none" style={{
            ...heavyGrain,
            opacity: 0.25,
            mixBlendMode: 'overlay'
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: halftonePattern,
            backgroundSize: '4px 4px',
            mixBlendMode: 'multiply',
            opacity: 0.08
          }} />
            
            <div className="relative z-10" />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-12" style={{
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
            }}>
                The Energy<br />Is Real.
              </motion.h2>
              
              <motion.div className="max-w-xl" initial={{
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
                opacity: 0.85
              }}>
                  We're here for a good time —
                  the kind you actually feel.
                  <br /><br />
                  Because being truly present is rare. And it doesn't happen by accident.
                  <br /><br />
                  This is a chance to slow down, step out of the current, and reconnect with what's happening right here — in the music, in the moment, and with each other.
                </p>
              </motion.div>
            </div>
            
            <motion.div className="relative z-10" initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.5,
            delay: 0.6
          }}>
              <p style={{
              ...typography.caption,
              color: COLORS.forest,
              letterSpacing: '0.1em',
              fontSize: '10px',
              opacity: 0.6
            }}>
                CREATIVITY OVER CONSUMPTION
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ===== 6. NATURE + PLACE ===== */}
      <section className="relative min-h-screen" style={{
      backgroundColor: COLORS.charcoal
    }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-2 md:order-1" style={{
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
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10" style={{
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
            }}>
                Let<br />Nature<br />Set The<br />Pace.
              </motion.h2>
              
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
                color: COLORS.dustySky,
                fontSize: '15px',
                lineHeight: 1.7,
                opacity: 0.9
              }}>
                  Sleep under the oaks. Morning sauna, then straight into the river. The day gathers momentum. Music, people, sunlight. At some point, you stop checking the time and just stay with it.
                </p>
              </motion.div>
              
              <motion.div className="mt-10" initial={{
              opacity: 0
            }} whileInView={{
              opacity: 1
            }} viewport={{
              once: true
            }} transition={{
              duration: 0.5,
              delay: 0.6
            }}>
                <Button asChild className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.dustySky,
                borderRadius: '0',
                fontWeight: 500,
                letterSpacing: '0.05em',
                border: `1.5px solid ${COLORS.dustySky}60`
              }}>
                  <Link to="/stay">Explore Accommodations</Link>
                </Button>
              </motion.div>
            </div>
            
            <div className="relative z-10">
              <p style={{
              ...typography.caption,
              color: COLORS.sage,
              letterSpacing: '0.1em',
              fontSize: '10px',
              opacity: 0.6
            }}>EXAMPLE COUNTY, CALIFORNIA</p>
            </div>
          </motion.div>
          
          <motion.div className="relative min-h-[50vh] md:min-h-screen overflow-hidden order-1 md:order-2" style={{
          backgroundColor: COLORS.sage
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
            <div className="absolute inset-0 pointer-events-none z-10" style={{
            ...heavyGrain,
            opacity: 0.35,
            mixBlendMode: 'overlay'
          }} />
            <img src={PLACEHOLDER_MEDIA.gallery} alt="Friends by the river" className="absolute inset-0 w-full h-full object-cover" style={{
            filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
            mixBlendMode: 'multiply'
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            backgroundColor: COLORS.sage,
            mixBlendMode: 'multiply',
            opacity: 0.65
          }} />
            <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(180deg, ${COLORS.forest}30 0%, transparent 50%, ${COLORS.denim}15 100%)`,
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
          </motion.div>
        </div>
      </section>

      {/* ===== 7. FINAL CALL - Full Width ===== */}
      <section className="relative min-h-[70vh] md:min-h-screen" style={{
      backgroundColor: COLORS.mustard
    }}>
        <FilmGrainOverlay opacity={0.5} />
        
        <div className="relative z-10 h-full min-h-[70vh] md:min-h-screen flex flex-col justify-between p-8 md:p-16 lg:p-24">
          <div />
          
          <div className="flex-1 flex flex-col justify-center py-12 max-w-4xl">
            <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10" style={{
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
          }}>
              Join The Gathering.
            </motion.h2>
            
            <motion.div className="max-w-lg mb-10" initial={{
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
              opacity: 0.85
            }}>
                Be there for three days — the kind of weekend people talk about long after it ends.
              </p>
            </motion.div>
            
            <motion.div className="flex flex-col sm:flex-row gap-4" initial={{
            opacity: 0
          }} whileInView={{
            opacity: 1
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.5,
            delay: 0.6
          }}>
              <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button,
              backgroundColor: COLORS.charcoal,
              color: COLORS.mustard,
              borderRadius: '0',
              fontWeight: 500,
              letterSpacing: '0.05em'
            }}>
                <Link to="/tickets">Get Your Tickets</Link>
              </Button>
              <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button,
              backgroundColor: 'transparent',
              color: COLORS.charcoal,
              borderRadius: '0',
              fontWeight: 500,
              letterSpacing: '0.05em',
              border: `1.5px solid ${COLORS.charcoal}`
            }}>
                <Link to="/stay">Book Your Stay</Link>
              </Button>
            </motion.div>
          </div>
          
          <div className="flex justify-between items-end">
            <p style={{
            ...typography.caption,
            color: COLORS.charcoal,
            letterSpacing: '0.1em',
            fontSize: '10px',
            opacity: 0.6
          }}>MAY 14–16, 2027</p>
            <p style={{
            ...typography.caption,
            color: COLORS.charcoal,
            letterSpacing: '0.1em',
            fontSize: '10px',
            opacity: 0.6
          }}>EXAMPLE VALLEY, CA</p>
          </div>
        </div>
      </section>

      {/* ===== TICKET MOMENTUM CTA ===== */}
      <section className="relative min-h-[60vh]" style={{ backgroundColor: COLORS.denim }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 h-full min-h-[60vh] flex flex-col justify-center items-center p-8 md:p-16 lg:p-24 text-center">
          <motion.h2
            className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10"
            style={{
              ...typography.headline,
              color: COLORS.dustySky,
              textTransform: 'uppercase',
            }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Join 700 People<br />Coming Together<br />In Example County This May
          </motion.h2>

          <motion.p
            className="mb-10"
            style={{
              ...typography.body,
              color: COLORS.dustySky,
              fontSize: '16px',
              lineHeight: 1.7,
              opacity: 0.8,
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            Music, river swims, and late nights under the Example Valley sky.
          </motion.p>
          
          <motion.div
            className="flex flex-col sm:flex-row gap-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button,
              backgroundColor: COLORS.clay,
              color: COLORS.charcoal,
              borderRadius: '0',
              fontWeight: 500,
              letterSpacing: '0.05em'
            }}>
              <Link to="/tickets">Get Weekend Pass</Link>
            </Button>
            <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button,
              backgroundColor: 'transparent',
              color: COLORS.dustySky,
              borderRadius: '0',
              fontWeight: 500,
              letterSpacing: '0.05em',
              border: `1.5px solid ${COLORS.dustySky}60`
            }}>
              <Link to="/tickets">Explore Tickets</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-12 md:px-12" style={{ backgroundColor: COLORS.charcoal, color: COLORS.dustySky }}>
        <DemoSiteNotice className="max-w-3xl mx-auto" />
      </section>

      <ScheduleStrip />
      <MayFooter />
    </div>;
};
export default MayIndex;