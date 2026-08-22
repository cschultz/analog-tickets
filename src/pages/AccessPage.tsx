import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, ChevronDown } from "lucide-react";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import { COLORS, typography, heavyGrain, halftonePatternDense, halftonePattern, fadeInUp } from "@/styles/may-theme";
import { useUTMCapture } from "@/hooks/useUTMTracking";
import { trackViewLeadForm, trackGenerateLead } from "@/components/AnalyticsTracking";

// Images
import heroCoupleStage from "@/assets/may/hero-couple-stage.webp";
import crowdGolden from "@/assets/may/crowd-golden.webp";
import lineupPoster from "@/assets/may/analog-poster-2026-v2.webp";

// ===== TYPES =====
type PageState = "capture" | "confirmation";

interface DynamicContent {
  headline: string;
  subhead: string;
  whyLine: string;
}

// ===== UTILITIES =====
const sanitizeParam = (value: string | null, maxLength = 100): string => {
  if (!value) return "";
  // Strip HTML, limit length, allow basic punctuation only
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s\-.,!?']/g, "")
    .trim()
    .slice(0, maxLength);
};

const getDynamicContent = (params: URLSearchParams): DynamicContent => {
  const keyword = sanitizeParam(params.get("keyword"), 80);
  const city = sanitizeParam(params.get("city"), 50);
  const intent = sanitizeParam(params.get("intent"), 30);

  // Default content
  let headline = "Cosmico — May 14–16, 2027";
  let subhead = "A curated wine-country gathering of music, wine, art, and community at Example Meadow.";
  let whyLine = "Get first access to tickets, accommodations, secret shows, artist meet & greets, and giveaways.";

  // Dynamic headline with keyword
  if (keyword) {
    headline = `${keyword} — Cosmico (May 14–16, 2027)`;
  }

  // Dynamic subhead with city
  if (city) {
    subhead = `A curated wine-country gathering of music, wine, art, and community. Easy from ${city}.`;
  }

  // Dynamic why line with intent
  if (intent === "tickets") {
    whyLine = "Get first access to tickets and early alerts before they sell out.";
  }

  return { headline, subhead, whyLine };
};

// ===== FAQ DATA =====
const faqItems = [
  {
    q: "What is Cosmico?",
    a: "Cosmico was a three-day music and community gathering in Example Valley wine country. It is no longer produced as an active event — this site is a demonstration of the Analog Tickets platform.",
  },
  {
    q: "Is this a festival?",
    a: "Yes, but intimate. Think curated music discovery, winemaker dinners, morning rituals, and late-night dancing — all in one beautiful setting.",
  },
  {
    q: "When and where is it?",
    a: "May 14–16, 2027 at Example Meadow in Example Valley / Example County, CA. Right on the Example River.",
  },
  {
    q: "What do I get by joining the access list?",
    a: "First access to tickets before public sale, early accommodation booking, secret show invites, artist meet & greets, and ticket giveaways.",
  },
  {
    q: "How often will you email or text?",
    a: "We only send what matters — ticket drops, important updates, and exclusive opportunities. No spam, ever.",
  },
  {
    q: "Do I have to buy tickets to join?",
    a: "No. Joining the access list is completely free. You'll just be first in line when we release tickets and accommodations.",
  },
];

// ===== COMPONENTS =====
const FAQItem = ({ q, a }: { q: string; a: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className="border-b py-5 cursor-pointer"
      style={{ borderColor: `${COLORS.charcoal}20` }}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="flex justify-between items-center">
        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "15px" }}>
          {q}
        </p>
        <ChevronDown 
          className={`w-5 h-5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          style={{ color: COLORS.boulder }}
        />
      </div>
      {isOpen && (
        <motion.p 
          className="mt-3"
          style={{ ...typography.body, color: COLORS.boulder, fontSize: "14px", lineHeight: 1.6 }}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          {a}
        </motion.p>
      )}
    </div>
  );
};

// ===== MAIN COMPONENT =====
const AccessPage = () => {
  const [searchParams] = useSearchParams();
  const [pageState, setPageState] = useState<PageState>("capture");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  // Capture UTM parameters
  useUTMCapture();

  // Track view_lead_form on page load (fires once)
  useEffect(() => {
    trackViewLeadForm();
  }, []);

  // Get dynamic content based on URL params
  const dynamicContent = useMemo(() => getDynamicContent(searchParams), [searchParams]);

  // Emit custom events for tracking
  const emitEvent = (eventName: string, data?: Record<string, unknown>) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
      // Also push to dataLayer if available (Google Tag Manager)
      if ((window as unknown as { dataLayer?: unknown[] }).dataLayer) {
        (window as unknown as { dataLayer: unknown[] }).dataLayer.push({
          event: eventName,
          ...data,
        });
      }
    }
  };

  // Handle email submission
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Please enter your email");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    const insertData: { email: string; first_name?: string } = {
      email: trimmedEmail,
    };

    if (firstName.trim()) {
      insertData.first_name = firstName.trim();
    }

    const { error } = await supabase
      .from("preview_signups")
      .insert(insertData);

    if (error) {
      if (error.code === "23505") {
        toast.success("You're already on the list!");
      } else {
        toast.error("Something went wrong. Please try again.");
        setIsSubmitting(false);
        return;
      }
    } else {
      toast.success("You're in!");
    }

    // Emit tracking events
    emitEvent("lead_email_submit", { email: trimmedEmail });
    
    // GA4 generate_lead event
    trackGenerateLead({
      method: "onsite_form",
      user_email: trimmedEmail,
      content_name: "Cosmico Access List",
    });

    // Sync to Flodesk
    supabase.functions.invoke("sync-flodesk", {
      body: { email: trimmedEmail, firstName: firstName.trim() || undefined },
    });

    // Sync to ConvertKit
    supabase.functions.invoke("sync-convertkit", {
      body: { email: trimmedEmail, firstName: firstName.trim() || undefined },
    });

    setSubmittedEmail(trimmedEmail);
    setIsSubmitting(false);
    setPageState("confirmation");
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle SMS submission
  const handleSMSSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }

    if (!smsConsent) {
      toast.error("Please confirm you want to receive SMS updates");
      return;
    }

    setIsSubmitting(true);

    // Update the signup with phone
    const { error } = await supabase
      .from("preview_signups")
      .update({ phone: phone.trim() })
      .eq("email", submittedEmail);

    if (error) {
      toast.error("Something went wrong. Please try again.");
      setIsSubmitting(false);
      return;
    }

    // Emit tracking event
    emitEvent("lead_sms_submit", { email: submittedEmail, phone: phone.trim() });

    // Sync to SimpleTexting
    supabase.functions.invoke("sync-simpletexting", {
      body: {
        phone: phone.trim(),
        email: submittedEmail,
        firstName: firstName.trim() || undefined,
        listName: "Cosmico Full List",
      },
    });

    toast.success("SMS access enabled!");
    setIsSubmitting(false);
  };

  const handleSkipSMS = () => {
    toast.success("You're all set!");
  };

  // ===== CONFIRMATION STATE =====
  if (pageState === "confirmation") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        {/* Meta Pixel / GTM placeholder hooks */}
        <div id="tracking-placeholder" className="hidden" />

        <section className="min-h-screen flex items-center justify-center px-6 py-20">
          <motion.div 
            className="max-w-md w-full text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-8"
              style={{ backgroundColor: COLORS.forest }}
            >
              <Check className="w-8 h-8" style={{ color: COLORS.white }} />
            </div>

            <h1 
              className="text-3xl md:text-4xl mb-4"
              style={{ ...typography.headline, color: COLORS.white, textTransform: "uppercase" }}
            >
              You're on the list.
            </h1>

            <p 
              className="mb-12"
              style={{ ...typography.body, color: COLORS.dustySky, fontSize: "16px", opacity: 0.9 }}
            >
              Want first alerts by text?
            </p>

            <div 
              className="p-6 text-left"
              style={{ backgroundColor: `${COLORS.dustySky}10` }}
            >
              <p 
                className="mb-6"
                style={{ ...typography.body, color: COLORS.dustySky, fontSize: "14px", lineHeight: 1.6, opacity: 0.85 }}
              >
                SMS gets first access to ticket drops, accommodation openings, secret shows, and giveaways.
              </p>

              <form onSubmit={handleSMSSubmit} className="space-y-4">
                <Input
                  type="tel"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  name="phone"
                  className="h-12 text-sm placeholder:text-gray-500"
                  style={{
                    backgroundColor: COLORS.charcoal,
                    borderColor: `${COLORS.dustySky}30`,
                    color: COLORS.dustySky,
                    borderRadius: "0",
                  }}
                />

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="sms-consent"
                    checked={smsConsent}
                    onCheckedChange={(checked) => setSmsConsent(checked as boolean)}
                    className="mt-1"
                    style={{ borderColor: COLORS.dustySky }}
                  />
                  <label 
                    htmlFor="sms-consent"
                    className="cursor-pointer"
                    style={{ ...typography.body, color: COLORS.dustySky, fontSize: "12px", opacity: 0.7 }}
                  >
                    I agree to receive SMS updates about Cosmico. Message & data rates may apply. Reply STOP to unsubscribe.
                  </label>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 text-xs uppercase"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.charcoal,
                      borderRadius: "0",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable SMS Access"}
                  </Button>

                  <button
                    type="button"
                    onClick={handleSkipSMS}
                    className="text-xs uppercase py-2"
                    style={{ ...typography.button, color: COLORS.dustySky, opacity: 0.6, letterSpacing: "0.05em" }}
                  >
                    Skip for now
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </section>
      </div>
    );
  }

  // ===== MAIN CAPTURE STATE =====
  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.dustySky }}>
      {/* Minimal header with logo only - matches main site behavior */}
      <MayHeader transparentOnTop minimal />
      
      {/* Meta Pixel / GTM placeholder hooks */}
      <div id="tracking-placeholder" className="hidden" />

      {/* ===== A) HERO SECTION ===== */}
      <section className="relative min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          
          {/* LEFT: Duotone Image */}
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen overflow-hidden"
            style={{ backgroundColor: COLORS.forest }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div 
              className="absolute inset-0 pointer-events-none z-10"
              style={{ ...heavyGrain, opacity: 0.25, mixBlendMode: "overlay" }}
            />
            
            <img 
              src={heroCoupleStage} 
              alt="Festival moment" 
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "grayscale(100%) contrast(1.1) brightness(1.1)", mixBlendMode: "multiply" }}
            />
            
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundColor: COLORS.mustard, mixBlendMode: "multiply", opacity: 0.45 }}
            />
            
            <div 
              className="absolute inset-0 pointer-events-none z-20"
              style={{ backgroundImage: halftonePatternDense, backgroundSize: "3px 3px", mixBlendMode: "multiply", opacity: 0.25 }}
            />
            
            <div 
              className="absolute inset-0 pointer-events-none z-20"
              style={{ ...heavyGrain, opacity: 0.2 }}
            />

          </motion.div>

          {/* RIGHT: Content + Form */}
          <motion.div 
            className="relative min-h-[50vh] md:min-h-screen flex flex-col justify-center p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.clay }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <FilmGrainOverlay opacity={0.5} />

            <div className="relative z-10 max-w-md">
              {/* Dynamic H1 */}
              <motion.h1 
                id="d-h1"
                className="access-headline text-2xl sm:text-3xl md:text-4xl leading-[1.1] tracking-tight mb-4"
                style={{ ...typography.headline, color: COLORS.charcoal, textTransform: "uppercase" }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                {dynamicContent.headline}
              </motion.h1>

              {/* Dynamic Subhead */}
              <motion.p 
                id="d-subhead"
                className="access-subhead mb-4"
                style={{ ...typography.body, color: COLORS.charcoal, fontSize: "15px", lineHeight: 1.6, opacity: 0.9 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                {dynamicContent.subhead}
              </motion.p>

              {/* Static Clarity Line */}
              <motion.p 
                className="mb-8"
                style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: "0.1em", fontSize: "11px", opacity: 0.7 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                MAY 14–16, 2027 • EXAMPLE MEADOW • EXAMPLE VALLEY, CA
              </motion.p>

              {/* B) EMAIL CAPTURE FORM */}
              <motion.form 
                onSubmit={handleEmailSubmit}
                className="space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    name="firstName"
                    className="w-1/3 h-12 text-sm placeholder:text-gray-500"
                    style={{
                      backgroundColor: COLORS.white,
                      borderColor: `${COLORS.charcoal}20`,
                      color: COLORS.charcoal,
                      borderRadius: "0",
                    }}
                  />
                  <Input
                    type="email"
                    placeholder="Email address *"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    name="email"
                    className="flex-1 h-12 text-sm placeholder:text-gray-500"
                    style={{
                      backgroundColor: COLORS.white,
                      borderColor: `${COLORS.charcoal}20`,
                      color: COLORS.charcoal,
                      borderRadius: "0",
                    }}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 text-xs uppercase hover:opacity-90 transition-opacity"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.charcoal,
                    color: COLORS.clay,
                    borderRadius: "0",
                    letterSpacing: "0.05em",
                  }}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get Access"}
                </Button>

                {/* Dynamic Why Line */}
                <p 
                  id="d-why"
                  className="access-why text-center pt-2"
                  style={{ ...typography.caption, color: COLORS.charcoal, fontSize: "10px", letterSpacing: "0.08em", opacity: 0.6 }}
                >
                  {dynamicContent.whyLine}
                </p>
              </motion.form>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== C) WHAT IS COSMICO ===== */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.dustySky }}>
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ ...heavyGrain, opacity: 0.15, mixBlendMode: "overlay" }}
        />
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: halftonePattern, backgroundSize: "4px 4px", mixBlendMode: "multiply", opacity: 0.06 }}
        />

        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="max-w-2xl">
            <motion.p 
              style={{ ...typography.caption, color: COLORS.forest, letterSpacing: "0.15em", fontSize: "11px" }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              WHAT IS COSMICO
            </motion.p>

            <motion.h2 
              className="text-2xl md:text-3xl lg:text-4xl leading-[1.1] mt-4 mb-8"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: "uppercase" }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              A curated gathering at the intersection of music, wine, and human connection.
            </motion.h2>

            <motion.p 
              className="mb-8"
              style={{ ...typography.body, color: COLORS.charcoal, fontSize: "15px", lineHeight: 1.7, opacity: 0.85 }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Cosmico was three days of discovering artists on the rise, sharing meals with strangers who become friends, and stepping away from screens to be fully present. It is no longer an active event — what remains here is a demonstration of the Analog Tickets platform.
            </motion.p>

            <motion.ul 
              className="space-y-3"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {[
                "3-day in-person gathering (May 14–16, 2027)",
                "Music, wine, art, and community",
                "Set in Example County at Example Meadow",
                "a fictional demo gathering",
              ].map((item, i) => (
                <li 
                  key={i}
                  className="flex items-start gap-3"
                  style={{ ...typography.body, color: COLORS.charcoal, fontSize: "14px" }}
                >
                  <span style={{ color: COLORS.clay }}>•</span>
                  {item}
                </li>
              ))}
            </motion.ul>
          </div>
        </div>
      </section>

      {/* ===== D) WHY YOU'LL WANT TO BE THERE ===== */}
      <section className="relative min-h-[70vh]" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[70vh]">
          
          {/* Image */}
          <div className="relative min-h-[40vh] md:min-h-full overflow-hidden">
            <img 
              src={crowdGolden} 
              alt="Festival crowd" 
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* Content */}
          <motion.div 
            className="relative flex flex-col justify-center p-8 md:p-12 lg:p-16"
            style={{ backgroundColor: COLORS.forest }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <FilmGrainOverlay opacity={0.4} />

            <div className="relative z-10 max-w-md">
              <p style={{ ...typography.caption, color: COLORS.sage, letterSpacing: "0.15em", fontSize: "11px" }}>
                WHY YOU'LL WANT TO BE THERE
              </p>

              <h2 
                className="text-2xl md:text-3xl leading-[1.1] mt-4 mb-10"
                style={{ ...typography.headline, color: COLORS.white, textTransform: "uppercase" }}
              >
                Not just a festival.<br />A feeling.
              </h2>

              <ul className="space-y-4">
                {[
                  "Curated and intimate — less than 1,000 people",
                  "Set in wine country, along the Example River",
                  "Real connection, not endless screens",
                  "Artist moments you don't get on YouTube",
                  "Morning rituals and late-night dancing",
                  "WineCamp with Example Valley's best winemakers",
                ].map((item, i) => (
                  <li 
                    key={i}
                    className="flex items-start gap-3"
                    style={{ ...typography.body, color: COLORS.white, fontSize: "14px", opacity: 0.9 }}
                  >
                    <span style={{ color: COLORS.clay }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== E) WHY JOIN THE ACCESS LIST ===== */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.clay }}>
        <FilmGrainOverlay opacity={0.5} />

        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="max-w-2xl mx-auto text-center">
            <motion.p 
              style={{ ...typography.caption, color: COLORS.charcoal, letterSpacing: "0.15em", fontSize: "11px", opacity: 0.7 }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              WHY JOIN THE ACCESS LIST
            </motion.p>

            <motion.h2 
              className="text-2xl md:text-3xl lg:text-4xl leading-[1.1] mt-4 mb-10"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: "uppercase" }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Be first. Get more.
            </motion.h2>

            <motion.ul 
              className="space-y-4 text-left max-w-md mx-auto mb-10"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {[
                "First access to tickets before public sale",
                "First access to on-site accommodations",
                "Secret show invitations",
                "Artist meet & greet opportunities",
                "Ticket giveaways",
              ].map((item, i) => (
                <li 
                  key={i}
                  className="flex items-start gap-3"
                  style={{ ...typography.body, color: COLORS.charcoal, fontSize: "15px" }}
                >
                  <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: COLORS.forest }} />
                  {item}
                </li>
              ))}
            </motion.ul>

            <motion.p 
              style={{ ...typography.caption, color: COLORS.charcoal, fontSize: "11px", letterSpacing: "0.1em", opacity: 0.6 }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              WE ONLY SEND WHAT MATTERS.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ===== LINEUP POSTER (Editorial Art Block) ===== */}
      <section className="relative py-16 md:py-24" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.15} />
        
        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <motion.div 
            className="flex justify-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <img
              src={lineupPoster}
              alt="Cosmico 2026 lineup poster"
              className="w-full max-w-md h-auto"
              style={{ 
                boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.08)',
              }}
            />
          </motion.div>
        </div>
      </section>

      {/* ===== F) FESTIVAL INFO STRIP ===== */}
      <section className="relative py-16" style={{ backgroundColor: COLORS.deepWater }}>
        <FilmGrainOverlay opacity={0.3} />

        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: "DATES", value: "May 14–16, 2027" },
              { label: "LOCATION", value: "Example Valley, CA" },
              { label: "VENUE", value: "Example Meadow" },
              { label: "EXPERIENCE", value: "Music • Wine • Art • Community" },
            ].map((item, i) => (
              <div key={i}>
                <p style={{ ...typography.caption, color: COLORS.dustySky, letterSpacing: "0.15em", fontSize: "10px", opacity: 0.6 }}>
                  {item.label}
                </p>
                <p 
                  className="mt-2"
                  style={{ ...typography.body, color: COLORS.white, fontSize: "14px" }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== G) FAQ ===== */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.dustySky }}>
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ ...heavyGrain, opacity: 0.1, mixBlendMode: "overlay" }}
        />

        <div className="relative z-10 container mx-auto px-6 md:px-12">
          <div className="max-w-2xl mx-auto">
            <motion.p 
              className="text-center"
              style={{ ...typography.caption, color: COLORS.forest, letterSpacing: "0.15em", fontSize: "11px" }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              QUESTIONS
            </motion.p>

            <motion.h2 
              className="text-2xl md:text-3xl leading-[1.1] mt-4 mb-12 text-center"
              style={{ ...typography.headline, color: COLORS.charcoal, textTransform: "uppercase" }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Frequently Asked
            </motion.h2>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {faqItems.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} />
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative py-20 md:py-28" style={{ backgroundColor: COLORS.charcoal }}>
        <div className="relative z-10 container mx-auto px-6 md:px-12 text-center">
          <motion.h2 
            className="text-2xl md:text-3xl lg:text-4xl leading-[1.1] mb-6"
            style={{ ...typography.headline, color: COLORS.white, textTransform: "uppercase" }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Don't miss this.
          </motion.h2>

          <motion.p 
            className="mb-10 max-w-md mx-auto"
            style={{ ...typography.body, color: COLORS.dustySky, fontSize: "15px", lineHeight: 1.6, opacity: 0.85 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Join the access list for first dibs on tickets, accommodations, and experiences you won't find anywhere else.
          </motion.p>

          <motion.form 
            onSubmit={handleEmailSubmit}
            className="max-w-md mx-auto flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 h-12 text-sm placeholder:text-gray-500"
              style={{
                backgroundColor: COLORS.charcoal,
                borderColor: `${COLORS.dustySky}30`,
                color: COLORS.dustySky,
                borderRadius: "0",
              }}
            />
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 px-8 text-xs uppercase"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.charcoal,
                borderRadius: "0",
                letterSpacing: "0.05em",
              }}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get Access"}
            </Button>
          </motion.form>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default AccessPage;
