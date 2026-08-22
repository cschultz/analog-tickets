import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import { Tent, ArrowRight, ChevronRight, Bed, Zap, Droplets, ShowerHead, Trees, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StickyTicketCTA from "@/components/may/StickyTicketCTA";
import ScheduleStrip from "@/components/may/ScheduleStrip";
// Images
import heroImage from "@/assets/stay/couple-hammock.webp";
import tentInteriorDay from "@/assets/stay/tent-interior-day.webp";
import coupleRiver from "@/assets/stay/couple-river.webp";
import marshmallowsFire from "@/assets/stay/marshmallows-fire.webp";
import tentUnderStars from "@/assets/stay/tent-under-stars.webp";
import swimmingHole from "@/assets/stay/swimming-hole.webp";

// Clear image panel - no duotone overlay for room/accommodation images
const ClearImagePanel = ({ image, alt, className = "" }: { image: string; alt: string; className?: string }) => (
  <motion.div className={`relative min-h-[50vh] md:min-h-screen overflow-hidden ${className}`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
    <img src={image} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.15) 100%)' }} />
  </motion.div>
);

// Lodging CTA component with explanation
const LodgingCTA = ({ variant = "hero" }: { variant?: "hero" | "section" }) => (
  <motion.div 
    className={`${variant === "hero" ? "mt-10" : "mt-8"} max-w-md`}
    initial={{ opacity: 0 }} 
    whileInView={{ opacity: 1 }} 
    viewport={{ once: true }} 
    transition={{ duration: 0.5, delay: 0.6 }}
  >
    <div 
      className="p-4 mb-4 rounded-sm"
      style={{ 
        backgroundColor: variant === "hero" ? `${COLORS.charcoal}20` : `${COLORS.dustySky}15`,
        border: `1px solid ${variant === "hero" ? COLORS.dustySky : COLORS.charcoal}20`
      }}
    >
      <div className="flex items-start gap-3">
        <Tent className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: variant === "hero" ? COLORS.clay : COLORS.charcoal }} />
        <div>
          <p style={{ 
            ...typography.body, 
            color: variant === "hero" ? COLORS.dustySky : COLORS.charcoal, 
            fontSize: '14px', 
            lineHeight: 1.6,
            marginBottom: '8px'
          }}>
            <strong>On-site lodging is available exclusively with VIP 3-day tickets.</strong>
          </p>
          <p style={{ 
            ...typography.body, 
            color: variant === "hero" ? COLORS.dustySky : COLORS.charcoal, 
            fontSize: '13px', 
            lineHeight: 1.5,
            opacity: 0.85
          }}>
            Already have tickets? <Link to="/my-tickets" className="underline hover:opacity-80" style={{ color: COLORS.clay }}>Manage your booking →</Link>
          </p>
        </div>
      </div>
    </div>
    
    <Button 
      asChild 
      className="w-full sm:w-auto px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity font-serialb flex items-center gap-2" 
      style={{ backgroundColor: COLORS.clay, color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '-0.02em' }}
    >
      <Link to="/tickets">
        Get VIP Tickets
        <ArrowRight className="w-4 h-4" />
      </Link>
    </Button>
  </motion.div>
);

// Zone display config
const ZONE_DETAILS: Record<string, { tagline: string; image: string; features: string[] }> = {
  grove_tents: {
    tagline: "Cozy retreat for couples",
    image: tentUnderStars,
    features: ["Canvas glamping tent", "One queen bed", "Nestled in the grove"],
  },
  grove_tents_2q: {
    tagline: "Room to spread out",
    image: tentUnderStars,
    features: ["Spacious canvas tent", "Two queen beds", "Ideal for friends or small groups"],
  },
  front_row_tents: {
    tagline: "Steps from the stage",
    image: tentInteriorDay,
    features: ["Premium canvas tent", "Queen bed + cots available", "Front-row festival access"],
  },
  front_row_cabins: {
    tagline: "Solid walls, prime location",
    image: marshmallowsFire,
    features: ["Solid-wall cabin", "Most spacious option", "Front-row positioning"],
  },
};

const MayStay = () => {
  useCanonicalUrl('/stay');
  const [zones, setZones] = useState<{ zone_key: string; zone_name: string; night_price: number; sleeps_min: number; sleeps_max: number; description: string | null }[]>([]);

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_lodging",
      item_name: "Cosmico – Stay",
      item_category: "Lodging",
      price: 215,
    });
    
    const fetchZones = async () => {
      const { data } = await supabase
        .from("accommodation_zones")
        .select("zone_key, zone_name, night_price, sleeps_min, sleeps_max, description")
        .eq("is_publicly_available", true)
        .order("night_price", { ascending: true });
      if (data) setZones(data);
    };
    fetchZones();
  }, []);

  return (
    <>
      <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop />
      {/* HERO */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <ClearImagePanel image={heroImage} alt="Couple in hammock at glamping site" />
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16" style={{ backgroundColor: COLORS.denim }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h1 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-6" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>Stay For<br />The Weekend</motion.h1>
              <motion.div className="space-y-4 max-w-sm" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>
                  Example Valley and the Example River offer beautiful places to rest, gather, and recharge between sets.
                </p>
              </motion.div>
              <LodgingCTA variant="hero" />
            </div>
            <div className="relative z-10"><p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>EXAMPLE MEADOW · EXAMPLE VALLEY, CA</p></div>
          </motion.div>
        </div>
      </section>

      {/* EXAMPLE MEADOW INTRO */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-screen">
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 md:col-span-2" style={{ backgroundColor: COLORS.clay }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10" style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>Example Meadow</motion.h2>
              <motion.div className="space-y-4 max-w-sm" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>Just minutes from the gathering, Example Meadow offers a riverside glamping experience designed for slowing down and reconnecting with nature.</p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>Guests enjoy comfortable canvas tents, access to the Example River, and a peaceful retreat between the music and community of the weekend.</p>
              </motion.div>
              <motion.div className="mt-8" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.6 }}>
                <Button asChild className="px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{ ...typography.button, backgroundColor: COLORS.charcoal, color: COLORS.clay, borderRadius: '0', fontWeight: 500, letterSpacing: '0.05em' }}>
                  <a href="#pricing">View Glamping Options</a>
                </Button>
              </motion.div>
            </div>
            <div className="relative z-10" />
          </motion.div>
          <ClearImagePanel image={tentInteriorDay} alt="Luxurious tent interior with natural light" />
        </div>
      </section>

      {/* PHOTO GALLERY STRIP */}
      <section className="relative" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {[
            { img: tentInteriorDay, alt: "Tent interior" },
            { img: marshmallowsFire, alt: "Campfire gathering" },
            { img: coupleRiver, alt: "River" },
            { img: tentUnderStars, alt: "Tent at night" },
          ].map((photo, i) => (
            <motion.div 
              key={i} 
              className="relative aspect-square overflow-hidden"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <img src={photo.img} alt={photo.alt} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.2) 100%)' }} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ACCOMMODATIONS PRICING */}
      <section className="relative" style={{ backgroundColor: COLORS.dustySky }} id="pricing">
        <FilmGrainOverlay opacity={0.35} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-12 py-20 md:py-28">
          <motion.div 
            className="mb-14 max-w-lg"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <p style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '12px' }}>
              ON-SITE AT EXAMPLE MEADOW
            </p>
            <h2 
              className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] leading-[1.05] tracking-tight mb-5" 
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
            >
              Glamping Options
            </h2>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>
              Three accommodation types, all riverside at Example Meadow. Pricing is for the full weekend (2 nights).
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5">
            {zones.map((zone, i) => {
              const details = ZONE_DETAILS[zone.zone_key];
              const weekendPrice = zone.night_price * 2;
              return (
                <motion.div
                  key={zone.zone_key}
                  className="relative overflow-hidden"
                  style={{ 
                    backgroundColor: COLORS.white || '#FFFFFF',
                    border: `1.5px solid ${COLORS.charcoal}15`,
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  {details && (
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img 
                        src={details.image} 
                        alt={zone.zone_name} 
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.15) 100%)' }} />
                    </div>
                  )}
                  
                  <div className="p-5 md:p-6">
                    <h3 
                      className="text-lg mb-1"
                      style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase', fontSize: '16px', letterSpacing: '0.02em' }}
                    >
                      {zone.zone_name}
                    </h3>
                    {details && (
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginBottom: '12px' }}>
                        {details.tagline}
                      </p>
                    )}
                    
                    <div className="mb-4 pb-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                      <span style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '28px' }}>
                        ${(zone.night_price / 100).toLocaleString()}
                      </span>
                      <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginLeft: '4px' }}>
                        / night
                      </span>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', marginTop: '2px' }}>
                        ${(weekendPrice / 100).toLocaleString()} for the weekend · Sleeps {zone.sleeps_min}–{zone.sleeps_max}
                      </p>
                    </div>

                    {details && (
                      <ul className="space-y-2">
                        {details.features.map((feature, fi) => (
                          <li key={fi} className="flex items-start gap-2">
                            <ChevronRight className="w-3 h-3 flex-shrink-0 mt-1" style={{ color: COLORS.clay }} />
                            <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div 
            className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5"
            style={{ 
              backgroundColor: `${COLORS.charcoal}06`,
              border: `1px solid ${COLORS.charcoal}12`,
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className="flex items-start gap-3 flex-1">
              <Tent className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.clay }} />
              <div>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                  On-site glamping requires a VIP 3-day ticket
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.5 }}>
                  Already have tickets?{" "}
                  <Link to="/my-tickets" className="underline hover:opacity-80" style={{ color: COLORS.clay }}>
                    Manage your booking →
                  </Link>
                </p>
              </div>
            </div>
            <Button 
              asChild 
              className="px-5 py-2.5 text-xs uppercase hover:opacity-80 transition-opacity flex-shrink-0 flex items-center gap-2" 
              style={{ backgroundColor: COLORS.clay, color: COLORS.charcoal, borderRadius: '0', fontWeight: 500, letterSpacing: '0.03em' }}
            >
              <Link to="/tickets">
                Get Tickets
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </motion.div>
          {/* What's Included */}
          <motion.div 
            className="mt-16 pt-14"
            style={{ borderTop: `1px solid ${COLORS.charcoal}12` }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 
              className="text-[1.3rem] sm:text-[1.5rem] mb-8"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
            >
              What's Included
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
              {[
                { icon: <Bed className="w-5 h-5" />, label: "Real beds with heated mattress pads & linens" },
                { icon: <Zap className="w-5 h-5" />, label: "Electricity, lighting & heaters in every unit" },
                { icon: <ShowerHead className="w-5 h-5" />, label: "Clean bathrooms & hot showers on-site" },
                { icon: <Droplets className="w-5 h-5" />, label: "Private river access steps from your door" },
                { icon: <Trees className="w-5 h-5" />, label: "Communal fire pits & gathering spaces" },
                { icon: <Wifi className="w-5 h-5" />, label: "WiFi available throughout the property" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5" style={{ color: COLORS.clay }}>{item.icon}</div>
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', lineHeight: 1.5 }}>{item.label}</span>
                </div>
              ))}
            </div>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '16px', lineHeight: 1.5 }}>
              This is glamping — not roughing it. Think hotel comfort with the sound of the river outside your door.
            </p>
          </motion.div>

          {/* How to Book */}
          <motion.div 
            className="mt-14 pt-14"
            style={{ borderTop: `1px solid ${COLORS.charcoal}12` }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 
              className="text-[1.3rem] sm:text-[1.5rem] mb-8"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
            >
              How to Book
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Get your VIP ticket", desc: "On-site glamping is available exclusively with a VIP 3-day pass." },
                { step: "2", title: "Browse accommodations", desc: "After purchasing, you'll be able to view available tents and cabins." },
                { step: "3", title: "Add lodging to your order", desc: "Select your accommodation and check out — it's added to your existing ticket." },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div 
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
                    style={{ backgroundColor: COLORS.clay, color: COLORS.charcoal }}
                  >
                    <span style={{ ...typography.headline, fontSize: '14px' }}>{item.step}</span>
                  </div>
                  <div>
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                      {item.title}
                    </p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.5 }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '16px', lineHeight: 1.5 }}>
              Already have a VIP ticket?{" "}
              <Link to="/my-tickets" className="underline hover:opacity-80" style={{ color: COLORS.clay }}>
                Manage your booking →
              </Link>
            </p>
          </motion.div>

          {/* Mini FAQ */}
          <motion.div 
            className="mt-14 pt-14"
            style={{ borderTop: `1px solid ${COLORS.charcoal}12` }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 
              className="text-[1.3rem] sm:text-[1.5rem] mb-8"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
            >
              Common Questions
            </h3>
            <div className="space-y-6">
              {[
                { q: "What are the bathrooms like?", a: "Example Meadow has dedicated, extra-clean shared bathrooms and hot showers located throughout the property. They're maintained throughout the day." },
                { q: "Is it actually comfortable?", a: "Yes. Every tent and cabin has real beds with heated mattress pads, linens, pillows, electricity, and heaters. It's hotel-level comfort in a nature setting." },
                { q: "What should I bring?", a: "Example Meadow provides bedding, linens, and towels. Bring layers for cooler evenings, swimwear for the river, and a flashlight for nighttime walks." },
                { q: "Where do I park?", a: "Each tent or cabin includes on-site parking for one vehicle. Guests who are not staying on site may park in the designated lots and take the continuous shuttle loops running from near Example Valley directly to the venue." },
                { q: "Can I check in early or leave late?", a: "Check-in and access details will be sent to all glamping guests prior to the event. The property is yours for the full weekend." },
                { q: "Do I need a VIP ticket?", a: "Yes. On-site glamping at Example Meadow is available exclusively to VIP 3-day ticket holders. Off-site hotels and vacation rentals are available to all attendees." },
              ].map((item, i) => (
                <div key={i} className="pb-5" style={{ borderBottom: i < 5 ? `1px solid ${COLORS.charcoal}08` : 'none' }}>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                    {item.q}
                  </p>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.6 }}>
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '12px', lineHeight: 1.5 }}>
              More questions? Check our{" "}
              <Link to="/faq" className="underline hover:opacity-80" style={{ color: COLORS.clay }}>full FAQ</Link>
              {" "}or{" "}
              <Link to="/contact" className="underline hover:opacity-80" style={{ color: COLORS.clay }}>reach out directly</Link>.
            </p>
          </motion.div>
        </div>
      </section>

      {/* RIVER MOMENTS */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <ClearImagePanel image={coupleRiver} alt="Couple relaxing by the river" className="order-2 md:order-1" />
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16 order-1 md:order-2" style={{ backgroundColor: COLORS.forest }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}>
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>Moments<br />Along<br />The River.</motion.h2>
              <motion.div className="space-y-4 max-w-sm" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>You've crossed the Alexander Valley Bridge a hundred times. This is what's underneath.</p>
                <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>Five minutes north of Example Valley, the river curves through oak shade and quiet paths — a place that feels far away without being far at all.</p>
              </motion.div>
            </div>
            <div className="relative z-10"><p style={{ ...typography.caption, color: COLORS.sage, letterSpacing: '0.1em', fontSize: '10px', opacity: 0.6 }}>EXAMPLE RIVER</p></div>
          </motion.div>
        </div>
      </section>

      {/* STAY IN EXAMPLE VALLEY */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          <motion.div className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16" style={{ backgroundColor: COLORS.dustySky }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <FilmGrainOverlay opacity={0.35} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight mb-10" style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>Stay In<br />Example Valley</motion.h2>
              <motion.div className="space-y-4 max-w-sm" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.9 }}>Example Valley and the surrounding Example River area offer a wide range of hotels, inns, and vacation rentals for every style of traveler.</p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}>From boutique hotels to riverside cabins, there are many ways to make a weekend of the gathering.</p>
                <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.1em', fontSize: '10px', marginTop: '16px' }}>WE RECOMMEND BOOKING EARLY AS ACCOMMODATIONS FILL QUICKLY IN WINE COUNTRY</p>
              </motion.div>
            </div>
            <div className="relative z-10" />
          </motion.div>
          <ClearImagePanel image={swimmingHole} alt="Swimming hole along the Example River" />
        </div>
      </section>

      {/* MAKE A WEEKEND OF IT */}
      <section className="relative min-h-[60vh]" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 h-full min-h-[60vh] flex flex-col justify-center p-8 md:p-16 lg:p-24 max-w-2xl">
          <motion.h2 className="text-2xl sm:text-3xl md:text-4xl mb-10" style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase', lineHeight: 1.1 }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            Make A Weekend<br />Of It
          </motion.h2>
          <motion.div className="space-y-5" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.95 }}>Cosmico is designed to unfold slowly over the course of the weekend.</p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '17px', lineHeight: 1.8, opacity: 0.85 }}>Staying nearby allows you to experience the full rhythm of the gathering — from afternoon sets and river swims to late-night music and Sunday morning conversations.</p>
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
            Three days of music, nature, and community in Example County.
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

      {/* Sticky mobile CTA */}
      <StickyTicketCTA 
        buttonText="Get VIP Tickets" 
        contextText="On-site glamping from $275/night · VIP required" 
      />
      </div>
    </>
  );
};

export default MayStay;