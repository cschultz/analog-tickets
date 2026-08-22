import { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Star } from "lucide-react";
import { useUTMCapture } from "@/hooks/useUTMTracking";
import { COLORS, typography, heavyGrain, halftonePatternDense, halftonePattern } from "@/styles/may-theme";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { addPreloadHint } from "@/lib/preload";
import { getTrackingConfig } from "@/platform/config/tracking";

import OptimizedLandingImage from "@/components/may/OptimizedLandingImage";
import StickyTicketCTA from "@/components/may/StickyTicketCTA";
import LazyFilmGrain from "@/components/may/LazyFilmGrain";

// Hero image loaded eagerly for LCP
import heroCoupleStage from "@/assets/may/hero-couple-stage.webp";
import analogLogoWordmark from "@/assets/analog-logo-wordmark.webp";

// Footer loaded lazily
const MayFooter = lazy(() => import("@/components/may/MayFooter"));

// Images loaded lazily
const crowdGolden = () => import("@/assets/may/crowd-golden.webp").then(m => m.default);
const foundersRitual = () => import("@/assets/may/founders-ritual.webp").then(m => m.default);
const dockHangout = () => import("@/assets/may/dock-hangout-river.webp").then(m => m.default);
const nightStage = () => import("@/assets/may/night-stage.webp").then(m => m.default);
const kidsSprinkler = () => import("@/assets/may/kids-sprinkler.webp").then(m => m.default);
const holdingHands = () => import("@/assets/may/holding-hands-wristband.webp").then(m => m.default);
const lineupPoster = () => import("@/assets/may/analog-poster-2026-v2.webp").then(m => m.default);
const coupleRiver = () => import("@/assets/wildhaven/couple-river.webp").then(m => m.default);

// Simple fade animation (reduced complexity)
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } }
};

const LandingPage = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Lazy-loaded image sources
  const [lazyImages, setLazyImages] = useState<Record<string, string>>({});

  // Capture UTM parameters from URL on landing
  useUTMCapture();

  // Preload hero image for LCP optimization
  useEffect(() => {
    const cleanup = addPreloadHint({
      href: heroCoupleStage,
      as: 'image',
      fetchPriority: 'high',
    });
    return cleanup;
  }, []);

  // Load the optional third-party content/personalisation script.
  // Nothing loads unless the operator configured VITE_CONTENT_SCRIPT_URL.
  useEffect(() => {
    const src = getTrackingConfig().contentScriptUrl;
    if (!src) return;

    const timer = setTimeout(() => {
      const script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.defer = true;
      script.dataset.tracking = 'content';
      document.head.appendChild(script);
    }, 2000); // Defer 2 seconds to prioritize content

    return () => {
      clearTimeout(timer);
      const existingScript = document.querySelector('script[data-tracking="content"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);


  // Load below-fold images lazily
  useEffect(() => {
    const loadImages = async () => {
      const [crowd, founders, dock, night, kids, hands, lineup, river] = await Promise.all([
        crowdGolden(),
        foundersRitual(),
        dockHangout(),
        nightStage(),
        kidsSprinkler(),
        holdingHands(),
        lineupPoster(),
        coupleRiver(),
      ]);
      setLazyImages({
        crowdGolden: crowd,
        foundersRitual: founders,
        dockHangout: dock,
        nightStage: night,
        kidsSprinkler: kids,
        holdingHands: hands,
        lineupPoster: lineup,
        coupleRiver: river,
      });
    };
    
    // Start loading after a small delay to prioritize hero
    const timer = setTimeout(loadImages, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsSubmitting(true);
    
    const { error } = await supabase
      .from('preview_signups')
      .insert({ email: email.trim().toLowerCase() });
    
    if (error) {
      if (error.code === '23505') {
        toast.success("You're already on the list!");
      } else {
        toast.error("Something went wrong. Please try again.");
        setIsSubmitting(false);
        return;
      }
    } else {
      toast.success("You're in! We'll be in touch soon.");
    }
    
    // Sync to Flodesk (fire and forget)
    supabase.functions.invoke('sync-flodesk', {
      body: { email: email.trim().toLowerCase() }
    });
    
    setEmail("");
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      
      {/* ===== 1. HERO: Split Panel Layout ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          {/* LEFT PANEL: Hero Image */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
            style={{ backgroundColor: COLORS.forest }}
          >
            {/* Grain overlay - deferred */}
            <div 
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                ...heavyGrain,
                opacity: 0.25,
                mixBlendMode: 'overlay',
              }}
            />
            
            {/* Hero image - priority loading */}
            <img 
              src={heroCoupleStage} 
              alt="Festival moment at Cosmico" 
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              style={{
                filter: 'grayscale(100%) contrast(1.1) brightness(1.1)',
                mixBlendMode: 'multiply',
              }}
            />
            
            {/* Mustard duotone overlay */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundColor: COLORS.mustard,
                mixBlendMode: 'multiply',
                opacity: 0.45,
              }}
            />
            
            {/* Halftone pattern */}
            <div 
              className="absolute inset-0 pointer-events-none z-20"
              style={{
                backgroundImage: halftonePatternDense,
                backgroundSize: '3px 3px',
                mixBlendMode: 'multiply',
                opacity: 0.25,
              }}
            />
            
            {/* ANALOG Logo */}
            <div className="absolute bottom-8 md:bottom-12 left-6 md:left-8 right-6 md:right-8 z-30">
              <img 
                src={analogLogoWordmark} 
                alt="Analog" 
                className="h-20 sm:h-24 md:h-32 lg:h-40 xl:h-44 w-auto"
                loading="eager"
                style={{ filter: 'brightness(0) invert(0.95) sepia(0.1) saturate(0.8)' }}
              />
            </div>
          </div>
          
          {/* RIGHT PANEL: Typography */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.clay }}
          >
            <LazyFilmGrain opacity={0.5} />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <h1 
                id="groas-headline"
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight"
                style={{
                  ...typography.headline,
                  color: COLORS.charcoal,
                  textTransform: 'uppercase',
                }}
              >
                Not a festival.<br />A reunion.
              </h1>
              
              <div className="mt-8 md:mt-10 max-w-md">
                <p 
                  id="groas-subheadline"
                  className="text-base md:text-lg mb-3"
                  style={{
                    ...typography.body,
                    color: COLORS.charcoal,
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  700 people. Example River. 3 days off the grid.
                </p>
                <p 
                  className="text-sm md:text-base"
                  style={{
                    ...typography.body,
                    color: COLORS.charcoal,
                    opacity: 0.85,
                    lineHeight: 1.6,
                  }}
                >
                  Music, wine, river mornings, and the kind of crowd you don't find twice.
                </p>
              </div>

              {/* Context info — visible above the fold */}
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
                {['Example County, CA', '3-day music + community gathering', 'Summer 2026'].map((info) => (
                  <p 
                    key={info}
                    className="text-[10px] uppercase"
                    style={{
                      ...typography.caption,
                      color: COLORS.charcoal,
                      letterSpacing: '0.12em',
                      opacity: 0.55,
                    }}
                  >
                    {info}
                  </p>
                ))}
              </div>
              
              <div className="mt-8 flex flex-wrap gap-3">
                <Button 
                  asChild 
                  id="groas-cta-primary"
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.charcoal,
                    color: COLORS.clay,
                    borderRadius: '0',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                  }}
                >
                  <Link to="/tickets">Get Tickets</Link>
                </Button>
                <Button 
                  asChild 
                  id="groas-cta-secondary"
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
                  style={{
                    ...typography.button,
                    backgroundColor: 'transparent',
                    color: COLORS.charcoal,
                    borderRadius: '0',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    border: `1.5px solid ${COLORS.charcoal}`,
                  }}
                >
                  <Link to="/">Learn More</Link>
                </Button>
              </div>

              {/* Urgency line */}
              <p 
                className="mt-4 text-xs"
                style={{
                  ...typography.caption,
                  color: COLORS.charcoal,
                  letterSpacing: '0.06em',
                  opacity: 0.6,
                }}
              >
                Limited to 700. When it's gone, it's gone.
              </p>
            </div>
            
            <div className="relative z-10">
              <p style={{
                ...typography.caption,
                color: COLORS.charcoal,
                letterSpacing: '0.12em',
                fontSize: '13px',
                fontWeight: 500,
              }}>
                MAY 14–16, 2027 · EXAMPLE VALLEY, CA
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 2. WHAT IS THIS ===== */}
      <section className="relative min-h-[70vh]" style={{ backgroundColor: COLORS.dustySky }}>
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            ...heavyGrain,
            opacity: 0.2,
            mixBlendMode: 'overlay',
          }}
        />
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: halftonePattern,
            backgroundSize: '4px 4px',
            mixBlendMode: 'multiply',
            opacity: 0.08,
          }}
        />
        
        <div className="relative z-10 container mx-auto px-6 md:px-12 py-20 md:py-32">
          <div className="max-w-3xl">
            <p 
              style={{
                ...typography.caption,
                color: COLORS.forest,
                letterSpacing: '0.15em',
                fontSize: '11px',
              }}
            >
              WHAT IS THIS
            </p>
            
            <h2 
              id="groas-section-1-headline"
              className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mt-6 mb-12"
              style={{
                ...typography.headline,
                color: COLORS.charcoal,
                textTransform: 'uppercase',
              }}
            >
              A Three-Day Music + Community Gathering.
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  label: 'WHAT',
                  text: 'Music discovery. Artists on the rise. WineCamp with Example County\'s finest winemakers. Late-night dancing. Morning rituals.',
                  id: 'groas-feature-1'
                },
                {
                  label: 'WHEN',
                  text: 'May 14–16, 2027. Friday and Saturday for all. Sunday reserved for VIP guests.',
                  id: 'groas-feature-2'
                },
                {
                  label: 'WHERE',
                  text: 'Example Valley, CA. Set on the Example River, surrounded by the vineyards of Example County.',
                  id: 'groas-feature-3'
                },
              ].map((item) => (
                <div key={item.label}>
                  <p 
                    className="text-xs mb-2"
                    style={{
                      ...typography.caption,
                      color: COLORS.denim,
                      letterSpacing: '0.15em',
                    }}
                  >
                    {item.label}
                  </p>
                  <p 
                    id={item.id}
                    style={{
                      ...typography.body,
                      color: COLORS.charcoal,
                      fontSize: '15px',
                      lineHeight: 1.5,
                    }}
                  >
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            {/* Relocated poetic paragraph from hero */}
            <div className="mt-16 max-w-lg">
              <p 
                style={{
                  ...typography.body,
                  color: COLORS.charcoal,
                  opacity: 0.8,
                  fontSize: '15px',
                  lineHeight: 1.7,
                  fontStyle: 'italic',
                }}
              >
                Three days of live music, communal dining, and deep connection — a reunion with each other, with nature, with ourselves.
              </p>
            </div>
            
            <p 
              className="mt-12"
              style={{
                ...typography.caption,
                color: COLORS.boulder,
                letterSpacing: '0.1em',
                fontSize: '10px',
              }}
            >
              COSMICO · FICTIONAL DEMO EVENT
            </p>
          </div>
        </div>
      </section>

      {/* ===== 3. WHY WE GATHER ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          {/* Image Panel */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden order-2 md:order-1"
            style={{ backgroundColor: COLORS.deepWater }}
          >
            {lazyImages.foundersRitual && (
              <OptimizedLandingImage 
                src={lazyImages.foundersRitual} 
                alt="Community ritual at Cosmico" 
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </div>
          
          {/* Text Panel */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-1 md:order-2"
            style={{ backgroundColor: COLORS.forest }}
          >
            <LazyFilmGrain opacity={0.5} />
            
            <div className="relative z-10" />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <h2 
                id="groas-section-2-headline"
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10"
                style={{
                  ...typography.headline,
                  color: COLORS.white,
                  textTransform: 'uppercase',
                }}
              >
                Why<br />We<br />Gather
              </h2>
              
              <div className="max-w-md space-y-6">
                <p 
                  id="groas-value-prop"
                  style={{
                    ...typography.body,
                    color: COLORS.white,
                    opacity: 0.9,
                    fontSize: '16px',
                    lineHeight: 1.7,
                  }}
                >
                  Cosmico isn't about rushing from one thing to the next — it's about being present for what's happening right in front of you.
                </p>
                <p 
                  style={{
                    ...typography.body,
                    color: COLORS.white,
                    opacity: 0.85,
                    fontSize: '16px',
                    lineHeight: 1.7,
                  }}
                >
                  Days are for discovery. Nights are for music, movement, and connection.
                </p>
                <p 
                  style={{
                    ...typography.body,
                    color: COLORS.white,
                    opacity: 0.85,
                    fontSize: '16px',
                    lineHeight: 1.7,
                  }}
                >
                  Whether you've been with us before or you're finding your way here for the first time — this is an invitation to reconnect.
                </p>
              </div>
            </div>
            
            <div className="relative z-10" />
          </div>
        </div>
      </section>

      {/* ===== 4. PROOF OF ENERGY: Image Grid ===== */}
      <section style={{ backgroundColor: COLORS.charcoal }} className="py-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { key: 'crowdGolden', alt: "Golden hour crowd at Cosmico" },
            { key: 'dockHangout', alt: "Friends on the dock by the river" },
            { key: 'nightStage', alt: "Night stage performance", duotone: true },
            { key: 'holdingHands', alt: "Connection at the festival" },
          ].map((img, i) => (
            <div 
              key={i}
              className="aspect-square overflow-hidden relative"
              style={{ backgroundColor: COLORS.charcoal }}
            >
              {lazyImages[img.key] && (
                <>
                  <OptimizedLandingImage 
                    src={lazyImages[img.key]} 
                    alt={img.alt}
                    className="w-full h-full object-cover"
                    style={img.duotone ? {
                      filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
                      mixBlendMode: 'multiply',
                    } : {
                      filter: 'grayscale(20%) contrast(1.05)',
                    }}
                  />
                  {img.duotone && (
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundColor: COLORS.electricLavender,
                        mixBlendMode: 'multiply',
                        opacity: 0.4,
                      }}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== MID-PAGE CONVERSION TOUCHPOINT ===== */}
      <section 
        className="relative py-20 md:py-28 px-6"
        style={{ backgroundColor: COLORS.forest }}
      >
        <LazyFilmGrain opacity={0.5} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 
            className="text-[1.75rem] sm:text-[2rem] md:text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight mb-6"
            style={{
              ...typography.headline,
              color: COLORS.white,
              textTransform: 'uppercase',
            }}
          >
            You'll either be here,<br />or hear about it later.
          </h2>
          
          <p 
            style={{
              ...typography.body,
              color: COLORS.white,
              opacity: 0.8,
              fontSize: '16px',
              lineHeight: 1.6,
              marginBottom: '32px',
            }}
          >
            700 people. No replays. No livestream.
          </p>
          
          <Button 
            asChild
            className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity"
            style={{
              ...typography.button,
              backgroundColor: COLORS.clay,
              color: COLORS.charcoal,
              borderRadius: '0',
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            <Link to="/tickets">
              Get Tickets
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </Button>
          
          <p 
            className="mt-5"
            style={{
              ...typography.body,
              color: COLORS.white,
              opacity: 0.5,
              fontSize: '13px',
              fontStyle: 'italic',
            }}
          >
            If it feels like your kind of thing, it probably is.
          </p>
        </div>
      </section>

      {/* ===== 5. SOCIAL PROOF ===== */}
      <section
        className="relative py-20 md:py-28 px-6"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <LazyFilmGrain opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="flex justify-center gap-1 mb-8">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5" style={{ color: COLORS.mustard, fill: COLORS.mustard }} />
            ))}
          </div>
          
          <blockquote 
            id="groas-testimonial"
            style={{ 
              ...typography.headline,
              color: COLORS.charcoal,
              fontSize: 'clamp(22px, 3.5vw, 32px)',
              fontStyle: 'italic',
              lineHeight: 1.4,
              marginBottom: '24px',
            }}
          >
            "The Monday after, I didn't know what had just happened — only that I felt changed. Cosmico was the most immersive, beautiful, magical weekend my family had all year."
          </blockquote>
          
          <p style={{ 
            ...typography.caption,
            color: COLORS.boulder,
          }}>
            — Past Guest
          </p>
        </div>
      </section>

      {/* ===== 6. THE VENUE ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          {/* Text Panel */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.denim }}
          >
            <LazyFilmGrain opacity={0.5} />
            
            <div className="relative z-10" />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <p 
                style={{
                  ...typography.caption,
                  color: COLORS.mustard,
                  letterSpacing: '0.15em',
                  fontSize: '11px',
                  marginBottom: '24px',
                }}
              >
                THE VENUE
              </p>
              
              <h2 
                id="groas-section-3-headline"
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10"
                style={{
                  ...typography.headline,
                  color: COLORS.white,
                  textTransform: 'uppercase',
                }}
              >
                Our New<br />Home
              </h2>
              
              <div className="max-w-md space-y-6">
                <p 
                  style={{
                    ...typography.body,
                    color: COLORS.white,
                    opacity: 0.9,
                    fontSize: '16px',
                    lineHeight: 1.7,
                  }}
                >
                  Set along the Example River in Example Valley, California — a nature-forward glamping retreat that invites a more intimate way of gathering.
                </p>
                <p 
                  style={{
                    ...typography.body,
                    color: COLORS.white,
                    opacity: 0.85,
                    fontSize: '16px',
                    lineHeight: 1.7,
                  }}
                >
                  Wake to birdsong. Float the river. Dine under the stars. Dance until dawn.
                </p>
              </div>
              
              <div className="mt-10">
                <Button 
                  asChild 
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.white,
                    color: COLORS.denim,
                    borderRadius: '0',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                  }}
                >
                  <Link to="/stay">Explore Lodging</Link>
                </Button>
              </div>
            </div>
            
            <div className="relative z-10" />
          </div>
          
          {/* Image Panel with Duotone */}
          <div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
            style={{ backgroundColor: COLORS.denim }}
          >
            {lazyImages.coupleRiver && (
              <OptimizedLandingImage 
                src={lazyImages.coupleRiver} 
                alt="River at Example Meadow" 
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: 'grayscale(100%) contrast(1.1) brightness(1.1)',
                  mixBlendMode: 'multiply',
                }}
              />
            )}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundColor: COLORS.sage,
                mixBlendMode: 'multiply',
                opacity: 0.35,
              }}
            />
            <div 
              className="absolute inset-0 pointer-events-none z-20"
              style={{
                backgroundImage: halftonePatternDense,
                backgroundSize: '3px 3px',
                mixBlendMode: 'multiply',
                opacity: 0.2,
              }}
            />
          </div>
        </div>
      </section>

      {/* ===== 7. FOR FAMILIES ===== */}
      <section className="relative min-h-[80vh]" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[80vh]">
          
          {/* Image Panel */}
          <div 
            className="relative min-h-[40vh] md:min-h-[80vh] overflow-hidden order-2 md:order-1"
          >
            {lazyImages.kidsSprinkler && (
              <OptimizedLandingImage 
                src={lazyImages.kidsSprinkler} 
                alt="Kids playing at the festival" 
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </div>
          
          {/* Text Panel */}
          <div 
            className="relative min-h-[40vh] md:min-h-[80vh] flex flex-col justify-center p-8 md:p-12 lg:p-16 order-1 md:order-2"
            style={{ backgroundColor: COLORS.mustard }}
          >
            <LazyFilmGrain opacity={0.5} />
            
            <div className="relative z-10 max-w-md">
              <p 
                style={{
                  ...typography.caption,
                  color: COLORS.charcoal,
                  letterSpacing: '0.15em',
                  fontSize: '11px',
                  marginBottom: '24px',
                  opacity: 0.7,
                }}
              >
                BRING THE FAMILY
              </p>
              
              <h2 
                className="text-[1.75rem] sm:text-[2rem] md:text-[2.5rem] leading-[1.1] tracking-tight mb-8"
                style={{
                  ...typography.headline,
                  color: COLORS.charcoal,
                  textTransform: 'uppercase',
                }}
              >
                Kid-Friendly.<br />Family-Forward.
              </h2>
              
              <p 
                style={{
                  ...typography.body,
                  color: COLORS.charcoal,
                  opacity: 0.9,
                  fontSize: '15px',
                  lineHeight: 1.7,
                }}
              >
                Cosmico Kids offers guided activities and nature play for the little ones — so parents can be present for themselves while their kids are engaged.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== LINEUP POSTER ===== */}
      <section className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.deepWater }}>
        <LazyFilmGrain opacity={0.15} />
        
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="flex justify-center">
            {lazyImages.lineupPoster && (
              <OptimizedLandingImage
                src={lazyImages.lineupPoster}
                alt="Cosmico 2026 lineup poster"
                className="w-full max-w-md h-auto"
                style={{ 
                  boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.08)',
                }}
              />
            )}
          </div>
        </div>
      </section>

      {/* ===== 8. FINAL CTA ===== */}
      <section 
        className="relative py-20 md:py-32 px-6"
        style={{ backgroundColor: COLORS.charcoal }}
      >
        <LazyFilmGrain opacity={0.3} />
        <motion.div 
          className="relative z-10 max-w-2xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
        >
          <h2 
            style={{ 
              ...typography.headline,
              color: COLORS.white,
              fontSize: 'clamp(32px, 5vw, 52px)',
              textTransform: 'uppercase',
              marginBottom: '24px',
            }}
          >
            Join the Gathering
          </h2>
          <p 
            style={{ 
              ...typography.body,
              color: COLORS.boulder,
              fontSize: '17px',
              marginBottom: '40px',
              lineHeight: 1.7,
            }}
          >
            Early bird tickets are available now — lock in the lowest price before they're gone.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button 
              asChild
              className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.charcoal,
                borderRadius: '0',
                fontWeight: 500,
                letterSpacing: '0.05em',
              }}
            >
              <Link to="/tickets">
                Get Early Bird Tickets
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
            <Button 
              asChild
              className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.white,
                borderRadius: '0',
                fontWeight: 500,
                letterSpacing: '0.05em',
                border: `1.5px solid ${COLORS.white}40`,
              }}
            >
              <Link to="/">Learn More</Link>
            </Button>
          </div>
          
          {/* Email Signup */}
          <div 
            className="pt-12"
            style={{ borderTop: `1px solid ${COLORS.white}15` }}
          >
            <p style={{ 
              ...typography.body,
              color: COLORS.boulder,
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              Not ready to commit? Join our list to stay in the loop.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  backgroundColor: `${COLORS.white}15`,
                  border: `1px solid ${COLORS.white}30`,
                  borderRadius: '0',
                  color: COLORS.white,
                  fontSize: '15px',
                  fontFamily: typography.body.fontFamily,
                  outline: 'none',
                }}
                required
              />
              <button 
                type="submit"
                disabled={isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '14px 24px',
                  backgroundColor: 'transparent',
                  color: COLORS.white,
                  border: `1px solid ${COLORS.white}40`,
                  borderRadius: '0',
                  fontSize: '13px',
                  fontFamily: typography.button.fontFamily,
                  fontWeight: typography.button.fontWeight,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {isSubmitting ? "..." : "Join List"}
              </button>
            </form>
          </div>
        </motion.div>
      </section>

      {/* ===== FOOTER ===== */}
      <Suspense fallback={<div style={{ height: '200px', backgroundColor: COLORS.charcoal }} />}>
        <MayFooter />
      </Suspense>

      {/* Sticky mobile CTA */}
      <StickyTicketCTA 
        buttonText="Get Tickets" 
        contextText="Starting at $99 · Tier 1 pricing ends April 1" 
      />
    </div>
  );
};

export default LandingPage;
