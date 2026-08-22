import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, ExternalLink, Music, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import { supabase } from "@/integrations/supabase/client";
import { ArtistThumbnail, ArtistDuotoneImage } from "@/components/lineup/ArtistImage";
import ScheduleStrip from "@/components/may/ScheduleStrip";

// Images
import lineupPoster from "@/assets/may/analog-poster-2026-v2.webp";
import cosmicoStageNight from "@/assets/may/cosmico-stage-night.webp";
import stageEnergyMotion from "@/assets/may/stage-energy-motion.webp";
import singerPinkPerforming from "@/assets/may/singer-pink-performing.webp";
import { getPrimaryEventId } from "@/platform/config/eventIds";

// Cosmico 2026 event ID
const ANALOG_2026_EVENT_ID = getPrimaryEventId();

interface Artist {
  id: string | null;
  name: string;
  bio: string | null;
  genre: string | null;
  instagram_url: string | null;
  spotify_url: string | null;
  website_url: string | null;
  performance_date: string | null;
  set_time: string | null;
  stage: string | null;
}

interface LineupByDay {
  [date: string]: Artist[];
}

// Format date for display
const formatDay = (dateStr: string): { day: string; date: string } => {
  if (dateStr === 'unscheduled') return { day: 'TBD', date: 'To Be Announced' };
  // Force PT interpretation so day labels are correct regardless of viewer TZ.
  const date = new Date(dateStr + 'T12:00:00-08:00');
  const dayShort = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).toUpperCase();
  const monthShort = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/Los_Angeles' }).toUpperCase();
  const dayNum = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' });
  return {
    day: dayShort,
    date: `${monthShort} ${dayNum}`
  };
};

// Duotone image panel
const DuotonePanel = ({ image, alt, color, secondaryColor = COLORS.denim, className = "" }: { image: string; alt: string; color: string; secondaryColor?: string; className?: string }) => (
  <motion.div 
    className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`}
    style={{ backgroundColor: color }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8 }}
  >
    <div className="absolute inset-0 pointer-events-none z-10" style={{ ...heavyGrain, opacity: 0.25, mixBlendMode: 'overlay' }} />
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'grayscale(100%) contrast(1.1) brightness(1.1)', mixBlendMode: 'multiply' }} />
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, mixBlendMode: 'multiply', opacity: 0.45 }} />
    <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(180deg, ${secondaryColor}20 0%, transparent 50%, ${color}15 100%)`, mixBlendMode: 'overlay' }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.25 }} />
    <div className="absolute inset-0 pointer-events-none z-20" style={{ ...heavyGrain, opacity: 0.25 }} />
  </motion.div>
);

const MayLineup = () => {
  useCanonicalUrl('/lineup');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Lineup",
      item_category: "Festival",
      price: 215,
    });
  }, []);
  const [expandedArtist, setExpandedArtist] = useState<string | null>(null);
  const [lineupByDay, setLineupByDay] = useState<LineupByDay>({});
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggleArtist = (name: string) => setExpandedArtist(expandedArtist === name ? null : name);

  useEffect(() => {
    const fetchLineup = async () => {
      try {
        setIsLoading(true);
        const { data, error: fnError } = await supabase.functions.invoke('get-lineup', {
          body: { eventId: ANALOG_2026_EVENT_ID }
        });

        if (fnError) {
          console.error('Error fetching lineup:', fnError);
          setError('Unable to load lineup');
          return;
        }

        if (data?.byDay) {
          setLineupByDay(data.byDay);
        }
        if (data?.artists) {
          setAllArtists(data.artists);
        }
      } catch (err) {
        console.error('Lineup fetch error:', err);
        setError('Unable to load lineup');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLineup();
  }, []);

  // Sort days chronologically
  const sortedDays = Object.keys(lineupByDay)
    .filter(d => d !== 'unscheduled')
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Build schedule display data
  const scheduleData = sortedDays.map(dateStr => {
    const { day, date } = formatDay(dateStr);
    const artists = lineupByDay[dateStr] || [];
    return {
      day,
      date,
      artists: artists.map(a => a.name).join(' · ')
    };
  });

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop />
      
      {/* ===== SECTION 1: HERO SPLIT ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          {/* Left: Poster Image */}
          <motion.div 
            className="relative min-h-[60vh] md:min-h-screen flex items-center justify-center p-8 pt-24 md:p-12 md:pt-24 lg:p-16 lg:pt-24"
            style={{ backgroundColor: COLORS.deepWater }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <FilmGrainOverlay opacity={0.15} />
            <motion.img
              src={lineupPoster}
              alt="Cosmico 2026 Lineup Poster"
              className="relative z-10 w-full max-w-md h-auto"
              style={{ 
                boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.08)',
              }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2 }}
            />
          </motion.div>
          
          {/* Right: Typography - Clay to tie with poster border */}
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.clay }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            
            <div className="relative z-10" />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1 
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                Discover<br />Your New<br />Favorite<br />Artists
              </motion.h1>
              
              <motion.div 
                className="space-y-4 max-w-sm"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7 }}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ opacity: 0.9 }}>
                  A curated sonic journey through independent music along the Example River in Example County.
                </p>
                <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.1em', fontSize: '10px', marginTop: '16px' }}>
                  FEATURING THE HEAVY HEAVY AND A LINEUP OF RISING ARTISTS WORTH KNOWING
                </p>
              </motion.div>
              
              <motion.div 
                className="mt-10 flex flex-col sm:flex-row gap-4"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                <Button 
                  asChild
                  className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity"
                  style={{ ...typography.button, backgroundColor: COLORS.charcoal, color: COLORS.clay, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em' }}
                >
                  <Link to="/tickets">Get Tickets</Link>
                </Button>
              </motion.div>
            </div>
            
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.white, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>MAY 14–16, 2027</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== SECTION 2: SCHEDULE SPLIT ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-screen">
          {/* Left: Typography / Schedule - 2/3 width */}
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 md:col-span-2"
            style={{ backgroundColor: COLORS.clay }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            
            <div className="relative z-10" />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                Three<br />Days Of<br />Music.
              </motion.h2>
              
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2" style={{ color: COLORS.charcoal }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span style={{ ...typography.body }}>Loading schedule...</span>
                  </div>
                ) : scheduleData.length > 0 ? (
                  scheduleData.map((item) => (
                    <div key={item.day}>
                      <p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.15em', fontSize: '10px' }}>{item.day} · {item.date}</p>
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', opacity: 0.85, marginTop: '4px' }}>{item.artists}</p>
                    </div>
                  ))
                ) : (
                  <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.7 }}>Schedule coming soon</p>
                )}
              </motion.div>
            </div>
            
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.5 }}>FULL SCHEDULE BELOW</p>
            </div>
          </motion.div>
          
          {/* Right: Duotone Image - 1/3 width */}
          <DuotonePanel image={cosmicoStageNight} alt="Cosmico stage at night" color={COLORS.mustard} secondaryColor={COLORS.clay} />
        </div>
      </section>

      {/* ===== SECTION 3: ENERGY SPLIT ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-screen">
          {/* Left: Duotone Image - 1/3 width */}
          <DuotonePanel image={stageEnergyMotion} alt="Stage energy and motion" color={COLORS.denim} secondaryColor={COLORS.sage} className="order-2 md:order-1" />
          
          {/* Right: Typography - 2/3 width */}
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-1 md:order-2 md:col-span-2"
            style={{ backgroundColor: COLORS.dustySky }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.35} />
            
            <div className="relative z-10" />
            
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                Where<br />Music<br />Becomes<br />Memory.
              </motion.h2>
              
              <motion.div 
                className="space-y-4 max-w-sm"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Acoustic sets over coffee in the morning.
                </p>
                <p style={{ ...typography.body, color: COLORS.denim, fontSize: '15px', lineHeight: 1.7 }}>
                  DJs get the party going down by the river in the afternoon.
                </p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  By evening, everything crescendos at the main stage.
                </p>
              </motion.div>
            </div>
            
            <div className="relative z-10">
              <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>FROM DAWN TO DARK</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FEATURED ARTISTS ===== */}
      <section className="relative py-24 md:py-32" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <p style={{ ...typography.caption, color: COLORS.clay, opacity: 0.8, letterSpacing: '0.15em', fontSize: '11px' }}>DON'T MISS</p>
            <h2 className="text-3xl md:text-4xl mt-4" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}>Featured Artists</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 max-w-5xl mx-auto">
            {['The Heavy Heavy', 'Gilligan Moss', 'Particle Kid', 'Maggie Koerner', 'Alex Amen'].map((name) => (
              <motion.div 
                key={name}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <ArtistDuotoneImage 
                  artistName={name}
                  color={COLORS.artistOverlay}
                  className="w-full aspect-square mb-4"
                />
                <p style={{ ...typography.subhead, color: COLORS.dustySky, fontSize: '16px' }}>{name}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MIXTAPE CALLOUT (Gilligan Moss) ===== */}
      <section className="relative py-12 md:py-16 overflow-hidden" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 max-w-4xl">
          <Link
            to="/mixtape"
            className="group flex flex-col md:flex-row md:items-center md:justify-between gap-5 md:gap-8"
          >
            <div className="flex items-center gap-4">
              <span
                className="inline-flex items-center justify-center w-12 h-12 shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: COLORS.mustard, color: COLORS.charcoal }}
                aria-hidden
              >
                ▶
              </span>
              <div>
                <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '11px' }}>
                  FRIDAY HEADLINER · MIXTAPE
                </p>
                <p
                  className="mt-1 text-xl md:text-3xl"
                  style={{ ...typography.headline, color: COLORS.white, lineHeight: 1.1 }}
                >
                  Hear Gilligan Moss before the set.
                </p>
              </div>
            </div>
            <span
              className="self-start md:self-auto inline-flex items-center gap-2 transition-opacity group-hover:opacity-80"
              style={{ ...typography.caption, color: COLORS.dustySky, letterSpacing: '0.1em', fontSize: '11px' }}
            >
              PRESS PLAY →
            </span>
          </Link>
        </div>
      </section>

      {/* ===== OFFICIAL PLAYLIST (Spotify) ===== */}
      <section className="relative py-20 md:py-28 overflow-hidden" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 max-w-3xl">
          <motion.div
            className="text-center mb-8 md:mb-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '11px' }} className="mb-3">
              THE OFFICIAL PLAYLIST
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl" style={{ ...typography.headline, color: COLORS.white, lineHeight: 1.1 }}>
              A taste of the weekend.
            </h2>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="overflow-hidden"
            style={{ borderRadius: '12px' }}
          >
            <iframe
              title="Cosmico — Official Playlist"
              src="https://open.spotify.com/embed/playlist/50zR0RXvMc2jqHmoqoquuj?utm_source=generator&theme=0"
              frameBorder={0}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="w-full h-[352px] sm:h-[420px] md:h-[480px] lg:h-[520px]"
              style={{ border: 0, display: 'block' }}
            />
          </motion.div>
        </div>
      </section>

      {/* ===== THE SONIC JOURNEY ===== */}
      <section className="relative py-24 md:py-32" style={{ backgroundColor: COLORS.denim }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 container mx-auto px-6 md:px-12 max-w-2xl">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <p style={{ ...typography.caption, color: COLORS.dustySky, opacity: 0.6, letterSpacing: '0.15em', fontSize: '11px' }} className="mb-4">THE EXPERIENCE</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl mb-10" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase', lineHeight: 1.1 }}>
              The Sonic Journey
            </h2>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.9 }}>
              Cosmico isn't just a lineup — it's a musical journey. From soulful rock to late-night grooves, each artist is part of a carefully curated weekend of sound.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== SECTION 4: FULL LINEUP BY DAY ===== */}
      <section className="relative py-24 md:py-32" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.35} />
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="text-center mb-12">
            <p style={{ ...typography.caption, color: COLORS.charcoal, opacity: 0.6, letterSpacing: '0.15em', fontSize: '11px' }}>ALL ARTISTS</p>
            <h2 className="text-3xl md:text-4xl mt-4" style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}>Full Artist Lineup</h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.denim }} />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.7 }}>{error}</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {/* Group by day */}
              {sortedDays.map((dateStr) => {
                const { day, date } = formatDay(dateStr);
                const artists = lineupByDay[dateStr] || [];
                
                // Separate main stage artists from DJ sets
                const mainStageArtists = artists.filter(a => a.genre !== 'DJ Set');
                const djSets = artists.filter(a => a.genre === 'DJ Set');
                
                const renderArtistRow = (artist: Artist) => (
                  <div key={artist.name} className="py-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}20` }}>
                    <button onClick={() => toggleArtist(artist.name)} className="w-full flex items-center justify-between text-left group">
                      <div className="flex items-center gap-3">
                        <ArtistThumbnail artistName={artist.name} size="md" />
                        <span className="text-xl group-hover:opacity-70 transition-opacity" style={{ ...typography.subhead, color: COLORS.charcoal }}>{artist.name}</span>
                        {artist.genre && artist.genre !== 'DJ Set' && (
                          <span className="text-xs px-2 py-0.5" style={{ backgroundColor: `${COLORS.denim}20`, color: COLORS.denim, borderRadius: '2px' }}>{artist.genre}</span>
                        )}
                      </div>
                      {expandedArtist === artist.name ? (
                        <ChevronUp className="w-5 h-5" style={{ color: COLORS.charcoal, opacity: 0.5 }} />
                      ) : (
                        <ChevronDown className="w-5 h-5" style={{ color: COLORS.charcoal, opacity: 0.5 }} />
                      )}
                    </button>
                    
                    {expandedArtist === artist.name && (
                      <motion.div 
                        className="mt-4"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
                          {/* Duotone artist image */}
                          <ArtistDuotoneImage 
                            artistName={artist.name} 
                            color={artist.genre === 'DJ Set' ? COLORS.mustard : COLORS.artistOverlay}
                            className="max-w-[280px]"
                          />
                          
                          {/* Bio and links */}
                          <div>
                            {artist.bio ? (
                              <p className="mb-4" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, fontSize: '15px', whiteSpace: 'pre-line' }}>{artist.bio}</p>
                            ) : (
                              <p className="mb-4 italic" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.5, fontSize: '14px' }}>Bio coming soon</p>
                            )}
                            
                            <div className="flex flex-wrap gap-2">
                              {artist.spotify_url && (
                                <Button 
                                  asChild
                                  className="text-sm"
                                  style={{ backgroundColor: 'transparent', color: COLORS.charcoal, borderRadius: '0', border: `1px solid ${COLORS.charcoal}40`, letterSpacing: '-0.02em' }}
                                >
                                  <a href={artist.spotify_url} target="_blank" rel="noopener noreferrer">
                                    <Music className="w-4 h-4 mr-2" />
                                    Spotify
                                  </a>
                                </Button>
                              )}
                              {artist.instagram_url && (
                                <Button 
                                  asChild
                                  className="text-sm"
                                  style={{ backgroundColor: 'transparent', color: COLORS.charcoal, borderRadius: '0', border: `1px solid ${COLORS.charcoal}40`, letterSpacing: '-0.02em' }}
                                >
                                  <a href={artist.instagram_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Instagram
                                  </a>
                                </Button>
                              )}
                              {artist.website_url && (
                                <Button 
                                  asChild
                                  className="text-sm"
                                  style={{ backgroundColor: 'transparent', color: COLORS.charcoal, borderRadius: '0', border: `1px solid ${COLORS.charcoal}40`, letterSpacing: '-0.02em' }}
                                >
                                  <a href={artist.website_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Website
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
                
                return (
                  <div key={dateStr} className="mb-12">
                    <div className="mb-6 pb-2" style={{ borderBottom: `2px solid ${COLORS.charcoal}30` }}>
                      <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px' }}>{day} · {date}</p>
                    </div>
                    
                    {/* Main Stage Artists */}
                    {mainStageArtists.length > 0 && (
                      <div style={{ borderTop: `1px solid ${COLORS.charcoal}20` }}>
                        {mainStageArtists.map(renderArtistRow)}
                      </div>
                    )}
                    
                    {/* DJ Sets Section */}
                    {djSets.length > 0 && (
                      <div className="mt-8">
                        <div className="mb-4 pb-2" style={{ borderBottom: `1px solid ${COLORS.charcoal}20` }}>
                          <p style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: '0.12em', fontSize: '10px', opacity: 0.6 }}>DJ SETS</p>
                        </div>
                        <div style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
                          {djSets.map(renderArtistRow)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Unscheduled artists */}
              {lineupByDay['unscheduled']?.length > 0 && (
                <div className="mb-12">
                  <div className="mb-6 pb-2" style={{ borderBottom: `2px solid ${COLORS.charcoal}30` }}>
                    <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px' }}>MORE ARTISTS</p>
                  </div>
                  
                  <div style={{ borderTop: `1px solid ${COLORS.charcoal}20` }}>
                    {lineupByDay['unscheduled'].map((artist) => (
                      <div key={artist.name} className="py-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}20` }}>
                        <button onClick={() => toggleArtist(artist.name)} className="w-full flex items-center justify-between text-left group">
                          <span className="text-xl group-hover:opacity-70 transition-opacity" style={{ ...typography.subhead, color: COLORS.charcoal }}>{artist.name}</span>
                          {expandedArtist === artist.name ? (
                            <ChevronUp className="w-5 h-5" style={{ color: COLORS.charcoal, opacity: 0.5 }} />
                          ) : (
                            <ChevronDown className="w-5 h-5" style={{ color: COLORS.charcoal, opacity: 0.5 }} />
                          )}
                        </button>
                        
                        {expandedArtist === artist.name && (
                          <motion.div 
                            className="mt-4 pl-0 md:pl-6"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3 }}
                          >
                            {artist.bio ? (
                              <p className="mb-4" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, fontSize: '15px' }}>{artist.bio}</p>
                            ) : (
                              <p className="mb-4 italic" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.5, fontSize: '14px' }}>Bio coming soon</p>
                            )}
                          </motion.div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===== TICKET CTA ===== */}
      <section className="relative min-h-[60vh]" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 h-full min-h-[60vh] flex flex-col justify-center items-center p-8 md:p-16 lg:p-24 text-center">
          <motion.h2
            className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-6"
            style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Join The Gathering
          </motion.h2>
          
          <motion.p
            className="mb-10 max-w-lg"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '16px', lineHeight: 1.7, opacity: 0.85 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            Three days of music, nature, and community along the Example River in Example County.
          </motion.p>
          
          <motion.div
            className="flex flex-col sm:flex-row gap-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button, backgroundColor: COLORS.clay, color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em'
            }}>
              <Link to="/tickets">Get Weekend Pass</Link>
            </Button>
            <Button asChild className="px-8 py-4 text-sm uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em', border: `1.5px solid ${COLORS.dustySky}60`
            }}>
              <Link to="/tickets">Explore Tickets</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <ScheduleStrip />
      <MayFooter />
    </div>
  );
};

export default MayLineup;
