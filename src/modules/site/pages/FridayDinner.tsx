import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, staggerContainer, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";

import heroImg from "@/assets/may/dinner-long-table.jpg";
import pouringImg from "@/assets/may/dinner-pouring.jpg";
import tablescapeImg from "@/assets/may/dinner-tablescape.jpg";
import ryanImg from "@/assets/may/dinner-ryan.avif";
import fieldDayLogo from "@/assets/may/field-day-logo.jpg";
import nickNaomi from "@/assets/may/dinner-nick-naomi.png";

const FridayDinner = () => {
  usePageMeta({
    title: "Analog x Field Day Ca Japanese Picnic — Friday night dinner",
    description: "A Japanese picnic under open skies by Field Day Ca. Limited seating at a long table with good wine and the people you'll spend the weekend with.",
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== 1. HERO ===== */}
      <section className="relative min-h-[90vh] md:min-h-screen flex items-end overflow-hidden">
        <img
          src={heroImg}
          alt="Long communal table under trees at golden hour"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 60%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.15, mixBlendMode: 'overlay' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
        <FilmGrainOverlay opacity={0.06} />

        <motion.div
          className="relative z-10 w-full px-6 md:px-12 lg:px-16 pb-16 md:pb-24 max-w-3xl"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.p
            variants={fadeInUp}
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '24px' }}
          >
            COSMICO · FRIDAY EVENING
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.0, marginBottom: '20px' }}
          >
            Analog x<br />Field Day Ca
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            style={{ ...typography.subhead, color: COLORS.boulder, fontSize: '1.15rem', marginBottom: '16px', lineHeight: 1.4 }}
          >
            A Japanese picnic under open skies
          </motion.p>
          <motion.p
            variants={fadeInUp}
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.65, opacity: 0.85, marginBottom: '32px' }}
          >
            A long table, good wine, and the people you'll know by the end of the weekend.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <span
              className="inline-block px-10 py-4"
              style={{
                ...typography.button,
                backgroundColor: 'transparent',
                color: COLORS.white,
                fontSize: '15px',
                letterSpacing: '0.15em',
                border: `1px solid ${COLORS.white}`,
              }}
            >
              Sold Out
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== 2. OPENING ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            THIS IS HOW THE WEEKEND BEGINS
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '42rem', marginLeft: 'auto', marginRight: 'auto' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            A long table set a stone's throw from the stage…<br />
            music in the air, wine being passed, and the weekend just starting to take shape.
          </motion.p>
        </div>
      </section>

      {/* ===== WIDE IMAGE — TABLESCAPE ===== */}
      <div className="px-4 md:px-8" style={{ backgroundColor: COLORS.dustySky }}>
        <motion.div
          className="relative w-full max-w-6xl mx-auto overflow-hidden"
          style={{ aspectRatio: '16/9' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <img
            src={tablescapeImg}
            alt="Table setting with amber bottles, greenery, and vintage glassware"
            className="w-full h-full object-cover"
            style={{ filter: 'contrast(1.05)' }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.12, mixBlendMode: 'overlay' }} />
        </motion.div>
      </div>

      {/* ===== 3. THE EXPERIENCE ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            THE EXPERIENCE
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            A Japanese-inspired picnic—<br />
            a fresh California take on vegetable-forward ramen, served family-style.
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.7, opacity: 0.75, fontStyle: 'italic' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Food meant to be shared.<br />
            Wine passed down the table.<br />
            A slower start to a weekend that won't stay slow for long.
          </motion.p>
        </div>
      </section>

      {/* ===== MENU SECTION ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-2xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            WHAT'S ON THE TABLE
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '40px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            A Japanese-inspired picnic, built around a shared table and seasonal ingredients.
          </motion.p>

          <motion.div
            className="space-y-10"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeInUp}>
              <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '1.05rem', marginBottom: '6px' }}>Smoked onion ramen</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.9rem', lineHeight: 1.6 }}>chickpea miso broth, koji pork belly, shoyu tamago, market vegetables &amp; sprouts</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.8rem', lineHeight: 1.6, fontStyle: 'italic', marginTop: '4px', opacity: 0.7 }}>vegetarian, vegan, and noodle-less versions available</p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '1.05rem', marginBottom: '6px' }}>Gem lettuce</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.9rem', lineHeight: 1.6 }}>tahini, avocado, cucumber, wild nori</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.8rem', lineHeight: 1.6, fontStyle: 'italic', marginTop: '4px', opacity: 0.7 }}>vegan, gluten-free</p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '1.05rem', marginBottom: '6px' }}>Hiyayakko tofu</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.9rem', lineHeight: 1.6 }}>preserved black bean chili, katsuo bushi</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.8rem', lineHeight: 1.6, fontStyle: 'italic', marginTop: '4px', opacity: 0.7 }}>gluten-free, vegan option available</p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '1.05rem', marginBottom: '6px' }}>Japanese sweet potato custard</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.9rem', lineHeight: 1.6 }}>seascape strawberries, kinako</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.8rem', lineHeight: 1.6, fontStyle: 'italic', marginTop: '4px', opacity: 0.7 }}>vegan, gluten-free</p>
            </motion.div>
          </motion.div>

          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.7, marginTop: '40px', fontStyle: 'italic', opacity: 0.75 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            This is a communal dinner with a show—minimal interruption, just food arriving when it's ready and the night unfolding around you.
          </motion.p>
        </div>
      </section>

      {/* ===== SPLIT IMAGE — POURING + SETTING ===== */}
      <div className="px-4 md:px-8 pb-0" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-6xl mx-auto">
          <motion.div
            className="relative overflow-hidden"
            style={{ aspectRatio: '3/4' }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <img
              src={pouringImg}
              alt="Winemaker pouring at golden hour"
              className="w-full h-full object-cover"
              style={{ filter: 'contrast(1.05)' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.12, mixBlendMode: 'overlay' }} />
          </motion.div>
          <motion.div
            className="relative overflow-hidden"
            style={{ aspectRatio: '3/4' }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <img
              src={ryanImg}
              alt="Ryan looking at the camera"
              className="w-full h-full object-cover"
              style={{ filter: 'contrast(1.05)' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.12, mixBlendMode: 'overlay' }} />
          </motion.div>
        </div>
      </div>

      {/* ===== 4. MUSIC CONNECTION ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            THE SOUNDTRACK
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '16px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            The music starts before dinner ends.
          </motion.p>
          <motion.p
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '16px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            You'll hear it as you settle in—<br />
            and by the time the plates are cleared, you're already on your feet.
          </motion.p>
        </div>
      </section>

      {/* ===== 5. ABOUT FIELD DAY CA ===== */}
      <section className="relative" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[70vh]">
          <motion.div
            className="relative overflow-hidden min-h-[50vh] md:min-h-full"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <img
              src={nickNaomi}
              alt="Nicolaus Balla and Naomi of Field Day Ca"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 20%', filter: 'contrast(1.05)' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.15, mixBlendMode: 'overlay' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
          </motion.div>
          <motion.div
            className="relative flex flex-col justify-center px-8 md:px-16 py-16 md:py-24"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10">
              <motion.p
                variants={fadeInUp}
                style={{ ...typography.subhead, color: COLORS.white, fontSize: '1.15rem', lineHeight: 1.4, marginBottom: '8px' }}
              >
                Nicolaus Balla &amp; Naomi McLeod
              </motion.p>
              <motion.p
                variants={fadeInUp}
                style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.12em', fontSize: '10px', marginBottom: '24px' }}
              >
                BAR TARTINE · FIELD DAY CA
              </motion.p>
              <motion.p
                variants={fadeInUp}
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1.02rem', lineHeight: 1.7, marginBottom: '16px' }}
              >
                Field Day Ca is known for intimate, design-forward gatherings rooted in seasonal California cooking.</motion.p>
              <motion.p
                variants={fadeInUp}
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.7, opacity: 0.7, marginBottom: '16px' }}
              >
                These are the kinds of dinners where the setting matters, the food is meant to be shared, and the people around the table become part of the experience.
              </motion.p>
              <motion.p
                variants={fadeInUp}
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: '0.95rem', lineHeight: 1.7, opacity: 0.7, fontStyle: 'italic' }}
              >
                They don't happen often.<br />
                Which is why this one does.
              </motion.p>
              <motion.p
                variants={fadeInUp}
                style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.15em', fontSize: '10px', marginTop: '32px' }}
              >
                Seats are limited—for a reason.
              </motion.p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== 6. TRANSITION MOMENT ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1.15rem', lineHeight: 1.7, fontStyle: 'italic' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Dinner fades into dancing.<br />
            The table turns into the crowd.<br />
            And the weekend officially begins.
          </motion.p>
        </div>
      </section>

      {/* ===== 7. DETAILS ===== */}
      <section className="relative py-16 md:py-20 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '20px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            DINNER DETAILS
          </motion.p>
          <motion.div
            className="space-y-2"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.02rem', lineHeight: 1.7 }}>Friday evening</p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>Doors at 4</p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>Music starts at 5</p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '0.95rem', lineHeight: 1.6 }}>Dinner begins at 6:30</p>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.95rem', lineHeight: 1.6, fontStyle: 'italic' }}>
              A glass of wine will be waiting when you sit down.
            </p>
            <div style={{ marginTop: '24px' }}>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.02rem', lineHeight: 1.7 }}>On site at Cosmico</p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.95rem', lineHeight: 1.7 }}>
                Limited seating — add-on ticket required
              </p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '0.95rem', lineHeight: 1.7 }}>
                First 25 seats include reserved seating at the table
              </p>
            </div>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.1rem', lineHeight: 1.7, marginTop: '24px', fontWeight: 500 }}>
              $85 per person — available for a limited time.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== 8. FINAL CTA ===== */}
      <section className="relative py-20 md:py-28 px-6" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.sage, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            SOLD OUT
          </motion.p>
          <motion.h2
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(1.8rem, 4vw, 3rem)', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Every Seat at the Table is Claimed
          </motion.h2>
          <motion.p
            style={{ ...typography.body, color: COLORS.dustySky, marginBottom: '40px', fontSize: '0.95rem', lineHeight: 1.6, fontStyle: 'italic', opacity: 0.8 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            The Friday-night dinner is fully reserved. Weekend tickets are still available.
          </motion.p>
          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Link
              to="/tickets"
              className="inline-block px-10 py-4 transition-all duration-300 hover:opacity-90"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: '15px',
              }}
            >
              Get Weekend Tickets
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default FridayDinner;
