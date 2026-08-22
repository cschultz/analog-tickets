import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, ArrowDown } from "lucide-react";
import { COLORS, typography, heavyGrain, halftonePatternDense, fadeInUp, staggerContainer } from "@/styles/may-theme";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import crewHero from "@/assets/crew-hero.webp";
import { getPrimaryEventId } from "@/platform/config/eventIds";

const participationOptions = [
  { value: "volunteer", label: "Volunteer — I want to earn my way in" },
  { value: "partner", label: "Partner or Sponsor" },
  { value: "donate", label: "Donate" },
  { value: "other", label: "Something else" },
];

const referralOptions = [
  { value: "friend", label: "Friend or family" },
  { value: "social_media", label: "Social media" },
  { value: "attended_before", label: "Attended a previous event" },
  { value: "search", label: "Online search" },
  { value: "other", label: "Other" },
];

const helpTypeOptions = [
  { value: "setup", label: "Set Up / Build (Pre-Event)" },
  { value: "shift", label: "Work a 4-Hour Shift (During Event)" },
  { value: "teardown", label: "Tear Down / Strike (Post-Event)" },
  { value: "street_team", label: "Street Team / Posters" },
  { value: "transport", label: "Transport / Logistics" },
  { value: "photo_video", label: "Photography / Videography" },
  { value: "whatever", label: "Whatever You Need" },
];

const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const GetInvolved = () => {
  useCanonicalUrl('/get-involved');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Get Involved",
      item_category: "Festival",
      price: 215,
    });
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [helpType, setHelpType] = useState("");
  const [participationType, setParticipationType] = useState("volunteer");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const inputStyles: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.boulder}40`,
    borderRadius: '2px',
    color: COLORS.charcoal,
    fontSize: '15px',
    fontFamily: typography.body.fontFamily,
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  const selectStyles: React.CSSProperties = {
    ...inputStyles,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%232F2F2F' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 16px center',
    paddingRight: '40px',
    cursor: 'pointer',
  };

  const labelStyles: React.CSSProperties = {
    ...typography.caption,
    color: COLORS.boulder,
    fontSize: '11px',
    marginBottom: '8px',
    display: 'block',
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const scrollToForm = () => {
    document.getElementById('crew-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    
    if (!firstName.trim() || !email.trim()) {
      toast.error("Please enter your name and email");
      return;
    }

    if (!participationType) {
      toast.error("Please select how you're hoping to participate");
      return;
    }

    if (!isValidEmail(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('volunteer_interests')
        .insert({
          name: fullName.slice(0, 100),
          email: email.trim().toLowerCase().slice(0, 255),
          phone: phone.replace(/\D/g, '').slice(0, 20) || null,
          city: city.trim().slice(0, 100) || null,
          referral_source: referralSource || null,
          preferred_contact: helpType || null,
          participation_type: participationType,
          instagram_url: instagramUrl.trim().slice(0, 255) || null,
          contribution_types: [participationType],
          message: message.trim().slice(0, 1000) || null,
        } as any);

      if (error) throw error;

      // Auto-create volunteer pipeline record for volunteer submissions
      if (participationType === 'volunteer') {
        supabase
          .from('volunteers')
          .insert({
            name: fullName.slice(0, 100),
            email: email.trim().toLowerCase().slice(0, 255),
            phone: phone.replace(/\D/g, '').slice(0, 20) || null,
            pipeline_status: 'lead',
            notes: [
              'Source: Get Involved form',
              city.trim() ? `City: ${city.trim()}` : null,
              message.trim() ? `Message: ${message.trim()}` : null,
            ].filter(Boolean).join(' | '),
            event_id: getPrimaryEventId(),
          } as any)
          .then(({ error: volError }) => {
            if (volError) console.error("Failed to create volunteer pipeline record:", volError);
          });
      }

      supabase.functions.invoke('send-volunteer-confirmation', {
        body: {
          name: fullName,
          email: email.trim().toLowerCase(),
          participationType,
          phone: phone.replace(/\D/g, '') || undefined,
          city: city.trim() || undefined,
          message: message.trim() || undefined,
        },
      }).catch((emailError) => {
        console.error("Failed to send confirmation email:", emailError);
      });

      setIsSubmitted(true);
      toast.success("Thanks for your interest! We'll be in touch.");
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <MayHeader />
        
        <section 
          className="relative pt-32 pb-24 md:pt-40 md:pb-32 min-h-[70vh] flex items-center"
          style={{ backgroundColor: COLORS.dustySky }}
        >
          <FilmGrainOverlay opacity={0.5} />
          <div className="relative z-10 max-w-xl mx-auto px-6 text-center">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
            >
              <div 
                className="w-20 h-20 mx-auto mb-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: COLORS.forest }}
              >
                <Check className="w-10 h-10" style={{ color: COLORS.white }} />
              </div>
              <h1 
                style={{ 
                  ...typography.headline, 
                  color: COLORS.charcoal,
                  fontSize: 'clamp(36px, 5vw, 52px)',
                  marginBottom: '20px'
                }}
              >
                You're In
              </h1>
              <p style={{ 
                ...typography.body, 
                color: COLORS.charcoal, 
                opacity: 0.85, 
                fontSize: '17px', 
                lineHeight: 1.7, 
                marginBottom: '40px',
                maxWidth: '400px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}>
                We've got your info and we'll be in touch soon with next steps. Welcome to the crew.
              </p>
              <Link 
                to="/"
                style={{
                  display: 'inline-block',
                  padding: '16px 40px',
                  backgroundColor: COLORS.charcoal,
                  color: COLORS.white,
                  borderRadius: '2px',
                  fontSize: '14px',
                  fontFamily: typography.button.fontFamily,
                  fontWeight: typography.button.fontWeight,
                  letterSpacing: typography.button.letterSpacing,
                  textDecoration: 'none',
                  transition: 'opacity 0.2s ease',
                }}
              >
                Back to Home
              </Link>
            </motion.div>
          </div>
        </section>
        
        <MayFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.charcoal }}>
      <MayHeader transparentOnTop />
      
      {/* HERO — Editorial Split Screen */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          {/* Duotone Image Panel */}
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
            style={{ backgroundColor: COLORS.forest }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="absolute inset-0 pointer-events-none z-10" style={{
              ...heavyGrain,
              opacity: 0.35,
              mixBlendMode: 'overlay',
            }} />
            <img
              src={crewHero}
              alt="Festival crew member pointing at you"
              className="absolute inset-0 w-full h-full object-cover object-[center_20%]"
              style={{
                filter: 'grayscale(40%) contrast(1.05) brightness(0.95)',
                mixBlendMode: 'multiply',
              }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundColor: COLORS.forest,
              mixBlendMode: 'multiply',
              opacity: 0.35,
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `linear-gradient(180deg, ${COLORS.sage}30 0%, transparent 50%, ${COLORS.forest}20 100%)`,
              mixBlendMode: 'overlay',
            }} />
            <div className="absolute inset-0 pointer-events-none z-20" style={{
              backgroundImage: halftonePatternDense,
              backgroundSize: '3px 3px',
              mixBlendMode: 'multiply',
              opacity: 0.35,
            }} />
            <div className="absolute inset-0 pointer-events-none z-20" style={{
              ...heavyGrain,
              opacity: 0.25,
            }} />
          </motion.div>

          {/* Copy Panel */}
          <motion.div
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-between p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.dustySky }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.5} />
            <div className="relative z-10" />
            <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
              <motion.p
                style={{
                  ...typography.caption,
                  color: COLORS.boulder,
                  marginBottom: '20px',
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                JOIN THE CREW
              </motion.p>
              <motion.h1
                className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] leading-[1.05] tracking-tight mb-8"
                style={{
                  ...typography.headline,
                  color: COLORS.charcoal,
                  textTransform: 'uppercase',
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.3 }}
              >
                We Need You
              </motion.h1>
              <motion.p
                style={{
                  ...typography.body,
                  color: COLORS.charcoal,
                  opacity: 0.85,
                  fontSize: '17px',
                  maxWidth: '420px',
                  lineHeight: 1.7,
                  marginBottom: '16px',
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.4 }}
              >
                We build this festival together. Volunteer your time before or during the weekend — help with setup, hospitality, check-in, artist support, or whatever needs doing — and earn your ticket to the Reunion.
              </motion.p>
              <motion.p
                style={{
                  ...typography.body,
                  color: COLORS.charcoal,
                  opacity: 0.55,
                  fontSize: '14px',
                  lineHeight: 1.6,
                  marginBottom: '36px',
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.5 }}
              >
                Spots are limited. If this sounds like you, tell us below.
              </motion.p>
              <motion.button
                onClick={scrollToForm}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 40px',
                  backgroundColor: COLORS.charcoal,
                  color: COLORS.white,
                  border: 'none',
                  borderRadius: '2px',
                  fontSize: '14px',
                  fontFamily: typography.button.fontFamily,
                  fontWeight: typography.button.fontWeight,
                  letterSpacing: typography.button.letterSpacing,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s ease',
                  width: 'fit-content',
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.6 }}
              >
                I'M IN
                <ArrowDown className="w-4 h-4" />
              </motion.button>
            </div>
            <div className="relative z-10" />
          </motion.div>
        </div>
      </section>

      {/* Fully booked notice */}
      <section
        className="relative py-10 md:py-12"
        style={{ backgroundColor: COLORS.charcoal }}
      >
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <motion.p
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            style={{
              ...typography.body,
              color: COLORS.boulder,
              fontSize: '15px',
              lineHeight: 1.7,
            }}
          >
            <span style={{ color: COLORS.mustard, fontWeight: 600 }}>A note on performers & artisans:</span>{' '}
            Our 2026 artist lineup and artisan market are fully locked in. We're not accepting new applications for performers, musicians, or vendors at this time. If you'd like to be considered for future events, you're welcome to drop your info below.
          </motion.p>
        </div>
      </section>

      {/* Form Section */}
      <section 
        id="crew-form"
        className="relative py-16 md:py-24"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <FilmGrainOverlay opacity={0.4} />
        <div className="relative z-10 max-w-lg mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mb-10"
          >
            <h2 style={{ 
              ...typography.subhead, 
              color: COLORS.charcoal, 
              fontSize: 'clamp(24px, 3.5vw, 32px)', 
              marginBottom: '10px' 
            }}>
              Tell Us About Yourself
            </h2>
            <p style={{ 
              ...typography.body, 
              color: COLORS.charcoal, 
              opacity: 0.7, 
              fontSize: '15px',
            }}>
              Quick form — takes less than a minute.
            </p>
          </motion.div>

          <motion.form 
            onSubmit={handleSubmit}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="space-y-5"
            style={{
              backgroundColor: COLORS.white,
              padding: '32px',
              borderRadius: '4px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyles}>FIRST NAME *</label>
                <input
                  type="text"
                  placeholder="First"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={50}
                  autoComplete="given-name"
                  name="firstName"
                  style={inputStyles}
                />
              </div>
              <div>
                <label style={labelStyles}>LAST NAME</label>
                <input
                  type="text"
                  placeholder="Last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={50}
                  autoComplete="family-name"
                  name="lastName"
                  style={inputStyles}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={labelStyles}>EMAIL *</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                autoComplete="email"
                name="email"
                style={inputStyles}
              />
            </div>

            {/* Phone */}
            <div>
              <label style={labelStyles}>PHONE</label>
              <input
                type="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={handlePhoneChange}
                maxLength={14}
                autoComplete="tel"
                name="phone"
                style={inputStyles}
              />
            </div>

            {/* City */}
            <div>
              <label style={labelStyles}>CITY</label>
              <input
                type="text"
                placeholder="Your city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={100}
                autoComplete="address-level2"
                name="city"
                style={inputStyles}
              />
            </div>

            {/* How would you like to participate */}
            <div>
              <label style={labelStyles}>HOW WOULD YOU LIKE TO BE INVOLVED? *</label>
              <select
                value={participationType}
                onChange={(e) => setParticipationType(e.target.value)}
                required
                style={selectStyles}
              >
                {participationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* How did you hear about us */}
            <div>
              <label style={labelStyles}>HOW DID YOU HEAR ABOUT US?</label>
              <select
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                style={selectStyles}
              >
                <option value="">Select one...</option>
                {referralOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* How would you like to help */}
            <div>
              <label style={labelStyles}>HOW WOULD YOU LIKE TO HELP?</label>
              <select
                value={helpType}
                onChange={(e) => setHelpType(e.target.value)}
                style={selectStyles}
              >
                <option value="">Select one...</option>
                {helpTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label style={labelStyles}>ANYTHING ELSE?</label>
              <textarea
                placeholder="Tell us a little about yourself — what you're good at, what excites you, whatever feels right."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={4}
                style={{
                  ...inputStyles,
                  resize: 'none',
                  minHeight: '100px',
                }}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '18px 24px',
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                border: 'none',
                borderRadius: '2px',
                fontSize: '15px',
                fontFamily: typography.button.fontFamily,
                fontWeight: typography.button.fontWeight,
                letterSpacing: typography.button.letterSpacing,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                transition: 'background-color 0.2s ease, opacity 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  (e.target as HTMLButtonElement).style.backgroundColor = COLORS.denim;
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor = COLORS.clay;
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Join the Crew"
              )}
            </button>
          </motion.form>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default GetInvolved;
