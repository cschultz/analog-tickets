import { useState } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { motion } from "framer-motion";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { trackGenerateLead } from "@/components/AnalyticsTracking";
import { COLORS, typography, filmGrain, duotoneImageStyle, fadeInUp, staggerContainer } from "@/styles/may-theme";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";

import heroImg from "@/assets/sessions/hero-h2hotel.webp";
import melissaYanc from "@/assets/sessions/melissa-yanc.webp";
import jessicaMartin from "@/assets/sessions/jessica-martin.webp";
import circeSher from "@/assets/sessions/circe-sher.webp";
import anneDriscoll from "@/assets/sessions/anne-driscoll.webp";
import chrisSchultz from "@/assets/sessions/chris-schultz.webp";
import timoteoGigante from "@/assets/sessions/timoteo-gigante.webp";
import stayHealdsburgLogo from "@/assets/sessions/stay-healdsburg-logo.svg";
import { getSessionsEventId } from "@/platform/config/eventIds";
import { SESSIONS_LODGING_PARTNERS, SESSIONS_LODGING_PROMO_CODE } from "@/platform/externalLinks";

// Event ID for Analog Sessions x h2hotel
const EVENT_ID = getSessionsEventId();

const rsvpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255).transform(e => e.toLowerCase()),
});

type RsvpForm = z.infer<typeof rsvpSchema>;

const panelists = [
  { name: "Timoteo Giganté", role: "DJ & Laguna Labs", img: timoteoGigante },
  { name: "Melissa Yanc", role: "Quail & Condor", img: melissaYanc },
  { name: "Jessica Martin", role: "Peptoc", img: jessicaMartin },
  { name: "Demo Organizer Two", role: "Demo Organization", img: anneDriscoll },
  { name: "Demo Organizer", role: "Author, Analog", img: chrisSchultz },
  { name: "Circe Sher", role: "H2 Hotel", img: circeSher },
];

export default function AnalogXH2Hotel() {
  usePageMeta({
    title: "Analog Sessions x h2hotel — March 6 & 7, 2026",
    description: "On March 6–7, we're gathering in Example Valley for Analog Sessions x h2hotel — a small, intentional cultural weekend centered on ideas, music, and insider access to the people who help shape the town year-round.",
    ogImage: "https://example.org/og-sessions-h2hotel.png",
    ogUrl: "https://example.org/sessions/analogxh2hotel",
  });

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RsvpForm>({
    resolver: zodResolver(rsvpSchema),
  });

  const onSubmit = async (data: RsvpForm) => {
    setIsSubmitting(true);
    try {
      const { error: rsvpError } = await supabase
        .from("session_rsvps" as any)
        .insert({
          event_id: EVENT_ID,
          name: data.name,
          email: data.email,
        } as any);

      if (rsvpError) {
        if (rsvpError.code === "23505") {
          toast.info("You're already on the list! We'll see you there.");
          setSubmitted(true);
          return;
        }
        throw rsvpError;
      }

      try {
        await supabase.functions.invoke("send-session-rsvp-confirmation", {
          body: { name: data.name, email: data.email },
        });
      } catch (emailErr) {
        console.warn("Confirmation email failed, but RSVP saved:", emailErr);
      }

      // Fire Facebook Pixel Lead + Meta CAPI (deduplicated)
      trackGenerateLead({
        method: "session_rsvp",
        user_email: data.email,
        content_name: "Analog Sessions x h2hotel RSVP",
      });

      setSubmitted(true);
      toast.success("You're in! Check your inbox for confirmation.");
    } catch (err) {
      console.error("RSVP error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      {/* Hero: Split Panel */}
      <section className="relative" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-5">
          {/* Image — 3/5 */}
          <motion.div
            className="relative min-h-[45vh] md:min-h-[75vh] overflow-hidden md:col-span-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <img
              src={heroImg}
              alt="Analog Sessions x h2hotel — Example Valley"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </motion.div>

          {/* Text Panel — 2/5 */}
          <motion.div
            className="relative md:col-span-2 min-h-[40vh] md:min-h-[70vh] flex flex-col justify-center p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.denim }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10">
              <p
                className="tracking-[0.2em] uppercase text-xs mb-6"
                style={{ ...typography.caption, color: COLORS.boulder }}
              >
                March 6 & 7 · Example Valley
              </p>
              <h1
                className="text-[2rem] sm:text-[2.5rem] md:text-[2.8rem] leading-[1.05] tracking-tight mb-6"
                style={{ ...typography.headline, color: COLORS.dustySky, textTransform: 'uppercase' }}
              >
                Come<br />Curious.<br />Stay<br />Awhile.
              </h1>
              <p
                className="max-w-xs"
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: '15px', lineHeight: 1.7, opacity: 0.85 }}
              >
                A small, intentional cultural weekend centered on ideas, music, and insider access.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Intro — with film grain for texture */}
      <section className="relative">
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-20 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeInUp}
            className="space-y-4"
            style={{ ...typography.body, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.7 }}
          >
            <p style={{ opacity: 0.9 }}>
              This isn't a conference, a tasting, or a traditional book event. It's a gathering for
              people curious about how culture is built, how places keep their soul, and what it looks
              like to slow down and spend time together.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mustard accent divider */}
      <div className="flex justify-center">
        <div style={{ width: 60, height: 3, backgroundColor: COLORS.mustard }} />
      </div>

      {/* Schedule */}
      <section className="py-20" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 space-y-16">
          {/* Friday */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={fadeInUp}
          >
            <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.2em' }} className="mb-2">
              Friday, March 6
            </p>
            <h2 style={{ ...typography.headline, color: COLORS.dustySky }} className="text-3xl mb-1">5:30 pm</h2>
            <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.4, fontSize: '14px' }} className="mb-5">
              h2hotel Lounge
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.85, fontSize: '15px', lineHeight: 1.7 }}>
              A relaxed welcome evening featuring a DJ set by Timoteo Giganté.
              Arrive early, settle in, and ease into the weekend with music, conversation, and good energy.
            </p>
          </motion.div>

          {/* Thin divider */}
          <div style={{ height: 1, backgroundColor: `${COLORS.denim}30` }} />

          {/* Saturday */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={fadeInUp}
          >
            <p style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.2em' }} className="mb-2">
              Saturday, March 7
            </p>
            <h2 style={{ ...typography.headline, color: COLORS.dustySky }} className="text-3xl mb-1">10:30 – 11:45 am</h2>
            <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.4, fontSize: '14px' }} className="mb-5">
              h2hotel Green Room
            </p>
            <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.85, fontSize: '15px', lineHeight: 1.7 }} className="mb-8">
              Coffee, conversation, and two intimate sessions designed for people who want more than surface-level access.
            </p>

            <div className="space-y-8 pl-5" style={{ borderLeft: `2px solid ${COLORS.mustard}50` }}>
              <div>
                <h3 style={{ ...typography.subhead, color: COLORS.dustySky }} className="text-xl mb-2">
                  Analog Reading + Conversation
                </h3>
                <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.75, fontSize: '14px', lineHeight: 1.7 }}>
                  A short reading from <em>Analog</em> by Demo Organizer, followed by a Q&A exploring
                  agency, meaning, and joy — and how we live and work more intentionally.
                </p>
              </div>
              <div>
                <h3 style={{ ...typography.subhead, color: COLORS.dustySky }} className="text-xl mb-2">
                  Example Valley Community Panel
                </h3>
                <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.75, fontSize: '14px', lineHeight: 1.7 }}>
                  A candid conversation with locally based culture bearers whose work extends far beyond
                  the region. Insider access for visitors curious about how Example Valley's creative and
                  cultural life is actually built, protected, and passed forward.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Panelists */}
      <section className="relative py-20 px-6" style={{ backgroundColor: COLORS.dustySky }}>
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.p
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            style={{ ...typography.caption, color: COLORS.charcoal, opacity: 0.5, letterSpacing: '0.2em' }}
            className="text-center mb-12"
          >
            Featured Voices
          </motion.p>
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {panelists.map((p) => (
              <motion.div
                key={p.name}
                variants={fadeInUp}
                className="text-center"
              >
                <div className="relative overflow-hidden rounded-sm mb-3">
                  <img
                    src={p.img}
                    alt={`${p.name} — ${p.role}`}
                    className="w-full aspect-[4/5] object-cover"
                  />
                </div>
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>{p.name}</p>
                <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.55, fontSize: '12px' }} className="mt-0.5">{p.role}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* RSVP Form */}
      <section id="rsvp" className="relative py-20" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-md mx-auto px-6 text-center">
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <h2 style={{ ...typography.headline, color: COLORS.dustySky }} className="text-3xl">You're in.</h2>
              <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.75 }}>
                We'll send you details as we get closer. See you in Example Valley.
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <h2 style={{ ...typography.headline, color: COLORS.dustySky }} className="text-3xl mb-2">
                Save Your Spot
              </h2>
              <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.55, fontSize: '14px' }} className="mb-10">
                Registration is free. Space is limited.
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <input
                    {...register("name")}
                    placeholder="Your name"
                    autoComplete="name"
                    name="name"
                    className="w-full px-4 py-3.5 rounded-sm focus:outline-none transition-all"
                    style={{
                      ...typography.body,
                      backgroundColor: `${COLORS.dustySky}10`,
                      border: `1px solid ${COLORS.dustySky}20`,
                      color: COLORS.dustySky,
                      fontSize: '15px',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${COLORS.mustard}80`;
                      e.currentTarget.style.backgroundColor = `${COLORS.dustySky}18`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = `${COLORS.dustySky}20`;
                      e.currentTarget.style.backgroundColor = `${COLORS.dustySky}10`;
                    }}
                  />
                  {errors.name && (
                    <p style={{ ...typography.body, color: COLORS.clay, fontSize: '12px' }} className="mt-1 text-left">{errors.name.message}</p>
                  )}
                </div>
                <div>
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="Email address"
                    autoComplete="email"
                    name="email"
                    className="w-full px-4 py-3.5 rounded-sm focus:outline-none transition-all"
                    style={{
                      ...typography.body,
                      backgroundColor: `${COLORS.dustySky}10`,
                      border: `1px solid ${COLORS.dustySky}20`,
                      color: COLORS.dustySky,
                      fontSize: '15px',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${COLORS.mustard}80`;
                      e.currentTarget.style.backgroundColor = `${COLORS.dustySky}18`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = `${COLORS.dustySky}20`;
                      e.currentTarget.style.backgroundColor = `${COLORS.dustySky}10`;
                    }}
                  />
                  {errors.email && (
                    <p style={{ ...typography.body, color: COLORS.clay, fontSize: '12px' }} className="mt-1 text-left">{errors.email.message}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-sm transition-all disabled:opacity-50 mt-2"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.clay,
                    color: COLORS.white,
                    letterSpacing: '0.05em',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#d6764f';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = COLORS.clay;
                  }}
                >
                  {isSubmitting ? "Saving your spot..." : "RSVP — It's Free"}
                </button>
              </form>
            </motion.div>
          )}
        </div>
      </section>

      {/* Stay — upgraded with color panel */}
      <section className="relative" style={{ backgroundColor: COLORS.forest }}>
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 py-20 px-6 text-center">
          <motion.div
            className="max-w-lg mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <p style={{ ...typography.caption, color: COLORS.sage, letterSpacing: '0.2em', opacity: 0.7 }} className="mb-4">
              While You're Here
            </p>
            <h2 style={{ ...typography.headline, color: COLORS.dustySky }} className="text-2xl mb-4">
              Make a Weekend of It
            </h2>
            <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.75, fontSize: '15px', lineHeight: 1.7 }} className="mb-3">
              Registration is free for both events, but space is limited. We recommend staying close and making a weekend of it.
            </p>
            {SESSIONS_LODGING_PARTNERS.some((p) => p.bookingUrl) && (
              <p style={{ ...typography.body, color: COLORS.dustySky, opacity: 0.75, fontSize: '15px', lineHeight: 1.7 }} className="mb-4">
                Partner hotels are offering discounted rates for attendees.
              </p>
            )}
            {SESSIONS_LODGING_PROMO_CODE && (
              <p style={{ ...typography.body, color: COLORS.mustard, fontSize: '14px', letterSpacing: '0.05em' }} className="mb-10">
                Use code <span style={{ fontWeight: 600 }}>{SESSIONS_LODGING_PROMO_CODE}</span> when booking.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {SESSIONS_LODGING_PARTNERS.filter((partner) => partner.bookingUrl).map((partner) => (
                <a
                  key={partner.name}
                  href={partner.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-8 py-3 rounded-sm transition-all text-sm"
                  style={{
                    ...typography.button,
                    border: `1px solid ${COLORS.dustySky}40`,
                    color: COLORS.dustySky,
                  }}
                >
                  {partner.name} →
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Supported By */}
      <section className="relative py-12 px-6 text-center" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-md mx-auto">
          <p style={{ ...typography.caption, color: COLORS.dustySky, opacity: 0.45, letterSpacing: '0.15em', fontSize: '11px' }} className="mb-5">
            Supported by a grant from the District Development Fund of
          </p>
          <a
            href="https://example.org/places-to-stay"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={stayHealdsburgLogo}
              alt="Stay Example Valley"
              className="h-10 mx-auto opacity-90 hover:opacity-100 transition-opacity"
            />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-8 px-6 text-center" style={{ backgroundColor: COLORS.charcoal }}>
        <FilmGrainOverlay opacity={0.3} />
        <p className="relative z-10" style={{ ...typography.caption, color: COLORS.dustySky, opacity: 0.35, fontSize: '11px', letterSpacing: '0.15em' }}>
          Analog Sessions × h2hotel · March 6–7 · Example Valley, CA
        </p>
      </footer>
    </div>
  );
}
