import { useState, useEffect } from "react";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";

const Contact = () => {
  useCanonicalUrl('/contact');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – Contact",
      item_category: "Festival",
      price: 215,
    });
  }, []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke("send-contact-email", {
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          message: message.trim(),
        },
      });

      if (error) {
        console.error("Contact form error:", error);
        toast.error("Something went wrong. Please try again.");
      } else {
        toast.success("Message sent! We'll be in touch soon.");
        setName("");
        setEmail("");
        setMessage("");
      }
    } catch (err) {
      console.error("Contact form error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyles = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: `${COLORS.charcoal}08`,
    border: `1px solid ${COLORS.charcoal}20`,
    borderRadius: '4px',
    color: COLORS.charcoal,
    fontSize: '15px',
    fontFamily: typography.body.fontFamily,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  };

  const labelStyles = {
    ...typography.caption,
    color: COLORS.charcoal,
    opacity: 0.6,
    fontSize: '11px',
    marginBottom: '8px',
    display: 'block',
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.charcoal }}>
      <MayHeader />
      
      {/* Hero Section */}
      <section 
        className="relative pt-32 pb-16 md:pt-40 md:pb-24"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <FilmGrainOverlay opacity={0.5} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{ 
              ...typography.caption, 
              color: COLORS.boulder,
              marginBottom: '16px'
            }}
          >
            GET IN TOUCH
          </motion.p>
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{ 
              ...typography.headline, 
              color: COLORS.charcoal,
              fontSize: 'clamp(36px, 6vw, 56px)'
            }}
          >
            Contact Us
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{ 
              ...typography.body, 
              color: COLORS.charcoal,
              opacity: 0.8,
              fontSize: '16px',
              marginTop: '16px',
              maxWidth: '400px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}
          >
            Have a question or just want to say hello? We'd love to hear from you.
          </motion.p>
        </div>
      </section>

      {/* Form Section */}
      <section 
        className="relative py-16 md:py-24"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-md mx-auto px-6">
          <motion.form 
            onSubmit={handleSubmit}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="space-y-6"
          >
            <div>
              <label style={labelStyles}>NAME</label>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                style={inputStyles}
                onFocus={(e) => e.target.style.borderColor = COLORS.clay}
                onBlur={(e) => e.target.style.borderColor = `${COLORS.charcoal}20`}
              />
            </div>

            <div>
              <label style={labelStyles}>EMAIL</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                style={inputStyles}
                onFocus={(e) => e.target.style.borderColor = COLORS.clay}
                onBlur={(e) => e.target.style.borderColor = `${COLORS.charcoal}20`}
              />
            </div>

            <div>
              <label style={labelStyles}>MESSAGE</label>
              <textarea
                placeholder="How can we help?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={1000}
                rows={5}
                style={{
                  ...inputStyles,
                  resize: 'none',
                  minHeight: '140px',
                }}
                onFocus={(e) => e.target.style.borderColor = COLORS.clay}
                onBlur={(e) => e.target.style.borderColor = `${COLORS.charcoal}20`}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '16px 24px',
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                border: 'none',
                borderRadius: '4px',
                fontSize: '15px',
                fontFamily: typography.button.fontFamily,
                fontWeight: 500,
                letterSpacing: typography.button.letterSpacing,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                transition: 'opacity 0.2s ease, transform 0.2s ease',
              }}
              onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.opacity = '1')}
            >
              {isSubmitting ? "Sending..." : "Send Message"}
            </button>
          </motion.form>

          {/* Direct Contact */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="mt-12 pt-8 text-center"
            style={{ borderTop: `1px solid ${COLORS.charcoal}20` }}
          >
            <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px', marginBottom: '8px' }}>
              Or reach us directly at
            </p>
            <a 
              href="mailto:hello@example.org" 
              className="transition-opacity hover:opacity-70"
              style={{ ...typography.body, color: COLORS.clay, fontSize: '16px' }}
            >
              hello@example.org
            </a>
          </motion.div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Contact;
