import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography, fadeInUp, heavyGrain, halftonePatternDense } from "@/styles/may-theme";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import ninaEmilyCheers from "@/assets/may/bar/nina-emily-cheers.jpg";
import ninaEmilyRedwoods from "@/assets/may/bar/nina-emily-redwoods.jpg";
import bigWestBarWestLogo from "@/assets/may/bar/big-west-bar-west-logo-v2.png";
import barHero from "@/assets/may/bar/bar-hero.jpg";
import barPour from "@/assets/may/bar/bar-pour.jpg";
import barProprietor from "@/assets/may/bar/bar-pour-tasting.jpg";

const Bar = () => {
  usePageMeta({
    title: "Big West Studio — Cosmico 2026",
    description: "Big West Studio x Cosmico presents two distinct bar environments, Coyote and Raven, where craft meets connection.",
  });
  useCanonicalUrl('/bar');

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader transparentOnTop forceLightText />

      {/* ===== HERO ===== */}
      <section
        className="relative min-h-[85vh] md:min-h-screen flex items-end overflow-hidden"
        style={{ backgroundColor: COLORS.deepWater }}
      >
        {/* Hero photo: Big West bar at Analog 2025 */}
        <img
          src={barHero}
          alt="The bar at Cosmico in the redwoods, bottles lined up at golden hour"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.55) saturate(0.9)', objectPosition: '50% 75%' }}
        />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${COLORS.deepWater}40 0%, transparent 30%, ${COLORS.deepWater}cc 100%)` }} />
        <div className="absolute inset-0 pointer-events-none" style={{ ...heavyGrain, opacity: 0.22, mixBlendMode: 'overlay' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.12 }} />

        <motion.div
          className="relative z-10 w-full px-6 md:px-12 lg:px-16 pb-16 md:pb-24 max-w-3xl"
          initial="hidden"
          animate="visible"
        >
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '24px' }}
          >
            BIG WEST × COSMICO · MAY 14–16
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.headline, color: COLORS.white, fontSize: 'clamp(2rem, 5vw, 4rem)', lineHeight: 0.95, marginBottom: '20px', textTransform: 'uppercase' }}
          >
            Big West Studio<br />x Cosmico
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.subhead, color: COLORS.sage, fontSize: '1.2rem', marginBottom: '20px', lineHeight: 1.4 }}
          >
            Where craft meets connection.
          </motion.p>
          <motion.p
            variants={fadeInUp}
            initial="hidden" animate="visible"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1rem', lineHeight: 1.65, opacity: 0.9, marginBottom: '36px', maxWidth: '34rem' }}
          >
            Big West is a woman-owned creative studio based in Northern California, working with craftspeople, hospitality brands, and cultural institutions to deliver essential expressions of time and place through visual and experiential design.
          </motion.p>
          <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3">
            <a
              href="#bars"
              className="inline-block px-10 py-4 transition-all duration-300 hover:opacity-90 text-center"
              style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, fontSize: '13px', letterSpacing: '0.05em' }}
            >
              Meet Coyote & Raven
            </a>
            <Link
              to="/tickets"
              className="inline-block px-10 py-4 transition-all duration-300 hover:opacity-80 text-center"
              style={{ ...typography.button, backgroundColor: 'transparent', color: COLORS.white, fontSize: '13px', letterSpacing: '0.05em', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              Get Tickets
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ===== PRESENTED BY (condensed) ===== */}
      <section className="relative py-14 md:py-16 px-6" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-5xl mx-auto flex flex-col md:flex-row md:items-center gap-8 md:gap-12">
          <motion.div
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="shrink-0"
          >
            <img
              src={bigWestBarWestLogo}
              alt="Big West Studio"
              className="block w-auto h-auto max-w-[140px] md:max-w-[170px]"
            />
          </motion.div>
          <motion.div
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '10px' }}>
              THE BAR PROGRAM · PRESENTED BY BIG WEST
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1rem', lineHeight: 1.7, opacity: 0.95, maxWidth: '40rem' }}>
              Big West will lead the bar experience at Cosmico, introducing two distinct environments inspired by icons of the bioregion: <em>Coyote</em> and <em>Raven</em>. Each offers a layered, exploratory approach to the weekend — where menu, mood, and moment move together.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== TWO BARS ===== */}
      <section id="bars" className="px-6 py-20 md:py-28" style={{ backgroundColor: COLORS.dustySky }}>
        <div className="max-w-6xl mx-auto">
          <motion.p
            className="text-center"
            style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '14px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            TWO ENVIRONMENTS · ONE WEEKEND
          </motion.p>
          <motion.h2
            className="text-center text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] leading-[1.05] tracking-tight uppercase mb-16"
            style={{ ...typography.headline, color: COLORS.charcoal }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Coyote & Raven
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* COYOTE */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative overflow-hidden"
              style={{ backgroundColor: COLORS.clay, minHeight: '480px' }}
            >
              <FilmGrainOverlay opacity={0.55} />
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '4px 4px', mixBlendMode: 'multiply', opacity: 0.18 }} />
              <div className="relative z-10 h-full flex flex-col justify-between p-8 md:p-10">
                <div>
                  <p style={{ ...typography.caption, color: COLORS.deepWater, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '12px' }}>
                    THE GA BAR
                  </p>
                  <h3
                    className="mb-6"
                    style={{ ...typography.headline, color: COLORS.deepWater, fontSize: 'clamp(2.5rem, 5vw, 3.75rem)', lineHeight: 0.95, textTransform: 'uppercase' }}
                  >
                    Coyote
                  </h3>
                  <p style={{ ...typography.body, color: COLORS.deepWater, fontSize: '15px', lineHeight: 1.7, opacity: 0.9, maxWidth: '24rem', marginBottom: '16px' }}>
                    Slip over to Coyote for a lively lineup of bespoke cocktails, vibrant zero-proof pours, and a roaming selection of local natural wines and beer.
                  </p>
                  <p style={{ ...typography.body, color: COLORS.deepWater, fontSize: '15px', lineHeight: 1.7, opacity: 0.9, maxWidth: '24rem' }}>
                    It is the social bar at the heart of the festival — a place to refuel, flirt, and find your people, with a program designed for discovery and connection all weekend long.
                  </p>
                </div>
                <p style={{ ...typography.caption, color: COLORS.deepWater, letterSpacing: '0.12em', fontSize: '10px', opacity: 0.6 }}>
                  OPEN TO ALL · AVAILABLE FOR PURCHASE
                </p>
              </div>
            </motion.div>

            {/* RAVEN */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative overflow-hidden"
              style={{ backgroundColor: COLORS.deepWater, minHeight: '480px' }}
            >
              <img
                src={barProprietor}
                alt="Hosted tasting pours at Raven"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: 0.18, filter: 'grayscale(100%) contrast(1.05) brightness(0.7)', objectPosition: '55% center' }}
              />
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(180deg, ${COLORS.deepWater}cc 0%, ${COLORS.deepWater}b3 38%, ${COLORS.deepWater}f0 100%)` }}
              />
              <FilmGrainOverlay opacity={0.55} />
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '4px 4px', mixBlendMode: 'multiply', opacity: 0.22 }} />
              <div className="relative z-10 h-full flex flex-col justify-between p-8 md:p-10">
                <div>
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '12px' }}>
                    THE VIP BAR
                  </p>
                  <h3
                    className="mb-6"
                    style={{ ...typography.headline, color: COLORS.dustySky, fontSize: 'clamp(2.5rem, 5vw, 3.75rem)', lineHeight: 0.95, textTransform: 'uppercase' }}
                  >
                    Raven
                  </h3>
                  <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9, maxWidth: '24rem', marginBottom: '16px' }}>
                    Perch at Raven, the VIP bar, for lifted and singular pours served in a tucked-away tent designed for lingering.
                  </p>
                  <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.9, maxWidth: '24rem', marginBottom: '16px' }}>
                    An expressive oasis at the edge of the scene, Raven brings together hosted pours, close-up access, and a slower rhythm for VIP guests all weekend.
                  </p>
                  <p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.12em', fontSize: '10px', lineHeight: 1.7, maxWidth: '24rem', marginBottom: '18px' }}>
                    TUCKED-AWAY TENT · HOSTED POURS · SLOWER PACED · DESIGNED FOR LINGERING
                  </p>
                  <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.1em', fontSize: '11px', lineHeight: 1.5, maxWidth: '24rem' }}>
                    HOSTED · ALL DRINKS INCLUDED WITH VIP
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <p style={{ ...typography.body, color: COLORS.dustySky, fontSize: '14px', lineHeight: 1.5, opacity: 0.9, fontStyle: 'italic' }}>
                    If you're doing the math, VIP already wins.
                  </p>
                  <Link
                    to="/tickets"
                    className="inline-block px-6 py-3 hover:opacity-90 transition-opacity self-start"
                    style={{ ...typography.button, backgroundColor: COLORS.mustard, color: COLORS.deepWater, fontSize: '12px', letterSpacing: '0.05em' }}
                  >
                    Get Your VIP Ticket
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Menu teasers */}
          <motion.div
            className="max-w-3xl mx-auto text-center mt-16 md:mt-20"
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <p style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '14px' }}>
              MENU TEASERS
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1.05rem', lineHeight: 1.7, opacity: 0.88, marginBottom: '14px' }}>
              Expect a playful, expressive menu with a few early reveals already in the mix.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 text-left">
              {[
                { name: 'Demo Cynar Spritz' },
                { name: 'The Hot Marg', detail: 'feat. Ancho Reyes & Espolòn' },
                { name: 'The Campari Collins' },
                { name: 'The Lavender Palmer', detail: 'feat. Hanson’s of Example Valley' },
                { name: 'The River Bird' },
              ].map((item, index) => (
                <div
                  key={item.name}
                  className="relative overflow-hidden px-4 py-4 sm:px-5"
                  style={{
                    backgroundColor: index % 2 === 0 ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.34)',
                    border: `1px solid ${index % 2 === 0 ? `${COLORS.clay}33` : `${COLORS.deepWater}22`}`,
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '4px 4px', mixBlendMode: 'multiply', opacity: 0.06 }} />
                  <div className="relative z-10 flex items-start gap-3">
                    <span style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.16em', paddingTop: '2px', minWidth: '2.25rem' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '1rem', lineHeight: 1.35, fontStyle: 'italic' }}>
                        {item.name}
                      </p>
                      {item.detail && (
                        <p style={{ ...typography.caption, color: COLORS.deepWater, fontSize: '10px', letterSpacing: '0.1em', opacity: 0.7, marginTop: '6px' }}>
                          {item.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== PHOTO DIPTYCH — last year at the bar ===== */}
      <section className="relative px-6 py-20 md:py-24" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.45} />
        <div className="relative z-10 max-w-6xl mx-auto">
          <motion.p
            className="text-center mb-10"
            style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.15em', fontSize: '10px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            MOMENTS FROM THE BAR
          </motion.p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative overflow-hidden aspect-[4/3] md:col-span-2"
            >
              <img src={barProprietor} alt="A proprietor handing a tasting pour across the bar at Cosmico" className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative overflow-hidden aspect-[4/5] md:aspect-auto"
            >
              <img src={barPour} alt="A natural wine pour into a cup at the Big West bar" className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.1 }} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== MEET YOUR HOSTS ===== */}
      <section className="relative py-20 md:py-28 px-6 overflow-hidden" style={{ backgroundColor: COLORS.sage }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '4px 4px', mixBlendMode: 'multiply', opacity: 0.08 }} />
        <div className="relative z-10 max-w-6xl mx-auto">
          <motion.p
            style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '14px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            MEET YOUR HOSTS
          </motion.p>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] lg:text-[3.2rem] leading-[1.05] tracking-tight uppercase mb-12 max-w-3xl"
            style={{ ...typography.headline, color: COLORS.deepWater }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Nina & Emily.<br />Your weekend<br />bar curators.
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative overflow-hidden aspect-[4/5] md:col-span-2"
            >
              <img src={ninaEmilyCheers} alt="Nina Kravetz and Emily Weber, co-producers of Big West Wine Fest, sharing a toast in the redwoods" className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: halftonePatternDense, backgroundSize: '3px 3px', mixBlendMode: 'multiply', opacity: 0.12 }} />
            </motion.div>

            <motion.div
              className="md:col-span-3 md:pt-4"
              variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            >
              <p style={{ ...typography.caption, color: COLORS.clay, letterSpacing: '0.12em', fontSize: '11px', marginBottom: '14px' }}>
                NINA KRAVETZ & EMILY WEBER · CO-PRODUCERS, BIG WEST WINE FEST
              </p>
              <p style={{ ...typography.body, color: COLORS.deepWater, fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '20px' }}>
                Nina and Emily are the co-producers of the Example County–based <em>Big West Wine Fest</em>, an event celebrating West Coast wines. Following the closure of their previous project, Miracle Plum, in 2022, they launched the fair to highlight independent producers — and have been active organizers ever since, often collaborating with the Solar Punk Farms team.
              </p>
              <p style={{ ...typography.body, color: COLORS.deepWater, fontSize: '1.05rem', lineHeight: 1.7, opacity: 0.9 }}>
                At Cosmico, they're our hosts on the ground all weekend — shaping the bar program, pouring alongside the proprietors, and making sure the whole thing feels like it's being thrown by someone who actually wants you there.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== PHILOSOPHY BAND ===== */}
      <section className="relative py-24 md:py-32 px-6" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            style={{ ...typography.caption, color: COLORS.sage, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '24px' }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            THE APPROACH
          </motion.p>
          <motion.h2
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] leading-[1.1] tracking-tight uppercase mb-10"
            style={{ ...typography.headline, color: COLORS.dustySky }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Unexpected.<br />Design-forward.<br />Rooted in community.
          </motion.h2>
          <motion.p
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1.05rem', lineHeight: 1.75, opacity: 0.9 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Analog at the core, with a sense of play and joy. A bar program that earns its place at a festival where people came to put the phone down — and stay a while.
          </motion.p>
        </div>
      </section>

      {/* ===== TICKET CTA ===== */}
      <section className="relative min-h-[50vh] flex items-center justify-center px-6 py-20" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 text-center max-w-2xl">
          <motion.h2
            className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.05] tracking-tight uppercase mb-6"
            style={{ ...typography.headline, color: COLORS.dustySky }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Pull up a stool<br />in May
          </motion.h2>
          <motion.p
            className="mb-10"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: '1rem', lineHeight: 1.65, opacity: 0.85 }}
            variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            Three days. Two bars. The kind of nights you talk about for a year.
          </motion.p>
          <motion.div className="flex flex-col sm:flex-row gap-4 justify-center" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Link
              to="/tickets"
              className="inline-block px-10 py-4 hover:opacity-80 transition-opacity"
              style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, fontSize: '13px', letterSpacing: '0.05em' }}
            >
              Get Tickets
            </Link>
            <Link
              to="/experience"
              className="inline-block px-10 py-4 hover:opacity-80 transition-opacity"
              style={{ ...typography.button, backgroundColor: 'transparent', color: COLORS.dustySky, fontSize: '13px', letterSpacing: '0.05em', border: `1px solid ${COLORS.dustySky}60` }}
            >
              The Experience
            </Link>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Bar;
