import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import DemoLegalNotice from "@/components/legal/DemoLegalNotice";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { PRODUCER, PRODUCER_DISPLAY_NAME } from "@/platform/externalLinks";

const Privacy = () => {
  useCanonicalUrl('/privacy');
  const sections = [
    {
      title: "1. Introduction",
      content: [
        `Cosmico is a demonstration site produced by ${PRODUCER_DISPLAY_NAME}. We are committed to protecting your privacy and ensuring that your personal information is handled securely and responsibly.`,
        "This Privacy Policy outlines how we collect, use, and protect your information when you visit our website and use our services."
      ]
    },
    {
      title: "2. Information We Collect",
      content: [
        "We may collect the following types of information:"
      ],
      list: [
        { label: "Personal Information", text: "When you sign up for our newsletter, purchase tickets, or contact us, we may collect your name, email address, phone number, payment details, and other relevant details." },
        { label: "Non-Personal Information", text: "We may collect data such as your IP address, browser type, operating system, and browsing behavior through cookies and analytics tools." },
        { label: "User-Generated Content", text: "If you post comments, feedback, or reviews on our website or social media, we may collect and display this content." }
      ]
    },
    {
      title: "3. How We Use Your Information",
      content: [
        "We use the collected information for the following purposes:"
      ],
      bullets: [
        "To process transactions and ticket purchases",
        "To send you event updates, promotional emails, and newsletters (you can opt out at any time)",
        "To improve our website and user experience through analytics and feedback",
        "To respond to inquiries, provide customer support, and enforce our terms and policies",
        "To comply with legal obligations and prevent fraudulent activities"
      ]
    },
    {
      title: "4. How We Share Your Information",
      content: [
        "We do not sell your personal information. However, we may share your data in the following cases:"
      ],
      list: [
        { label: "Service Providers", text: "We may share information with third-party vendors who assist with payment processing (Stripe), email distribution, analytics, and event management." },
        { label: "Legal Compliance", text: "If required by law, we may disclose information to government authorities or in response to legal processes." },
        { label: "Business Transfers", text: "If Cosmico is involved in a merger, acquisition, or asset sale, your information may be transferred to the new entity." }
      ]
    },
    {
      title: "5. Cookies and Tracking Technologies",
      content: [
        "Our website uses cookies and similar technologies to enhance your experience. These technologies allow us to analyze site traffic, remember user preferences, and deliver personalized content. You can manage cookie preferences through your browser settings."
      ]
    },
    {
      title: "6. Data Security",
      content: [
        "We implement reasonable security measures to protect your data from unauthorized access, alteration, or destruction. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security."
      ]
    },
    {
      title: "7. Your Rights and Choices",
      content: [
        "Depending on your location, you may have the following rights regarding your personal data:"
      ],
      bullets: [
        "The right to access, update, or delete your information",
        "The right to opt out of marketing communications",
        "The right to restrict or object to certain types of data processing",
        "The right to request data portability"
      ],
      footer: "To exercise these rights, please contact us at hello@example.org."
    },
    {
      title: "8. Third-Party Links",
      content: [
        "Our website may contain links to third-party websites. We are not responsible for their privacy practices and encourage you to review their policies before providing any information."
      ]
    },
    {
      title: "9. Children's Privacy",
      content: [
        "Our services are not intended for individuals under the age of 13. We do not knowingly collect personal information from children. If we learn that we have collected data from a minor, we will take appropriate action to remove it."
      ]
    },
    {
      title: "10. Legal Jurisdiction",
      content: [
        "This Privacy Policy is governed by the laws of the State of California, and any disputes will be subject to the jurisdiction of its courts."
      ]
    },
    {
      title: "11. Changes to This Privacy Policy",
      content: [
        "We may update this Privacy Policy from time to time. Any changes will be posted on this page with the updated effective date. Your continued use of our website after changes take effect constitutes acceptance of the revised policy."
      ]
    },
    {
      title: "12. Contact Us",
      content: [
        "If you have any questions or concerns about this Privacy Policy, please contact us:"
      ]
    }
  ];

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
            LEGAL
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
            Privacy Policy
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{ 
              ...typography.body, 
              color: COLORS.boulder,
              fontSize: '14px',
              marginTop: '16px'
            }}
          >
            Effective Date: January 1, 2025
          </motion.p>
        </div>
      </section>

      {/* Content */}
      <section 
        className="relative py-16 md:py-24"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <DemoLegalNotice />
          <div className="space-y-12">
            {sections.map((section, index) => (
              <motion.div 
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeInUp}
              >
                <h2 
                  style={{ 
                    ...typography.subhead, 
                    color: COLORS.charcoal,
                    fontSize: '18px',
                    marginBottom: '16px'
                  }}
                >
                  {section.title}
                </h2>
                
                {section.content.map((paragraph, pIndex) => (
                  <p 
                    key={pIndex}
                    style={{ 
                      ...typography.body, 
                      color: COLORS.charcoal,
                      opacity: 0.8,
                      fontSize: '15px',
                      lineHeight: 1.7,
                      marginBottom: '12px'
                    }}
                  >
                    {paragraph}
                  </p>
                ))}

                {section.list && (
                  <ul className="space-y-3 mt-4">
                    {section.list.map((item, listIndex) => (
                      <li key={listIndex} style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px', lineHeight: 1.7 }}>
                        <span style={{ color: COLORS.charcoal, opacity: 1 }}>{item.label}:</span> {item.text}
                      </li>
                    ))}
                  </ul>
                )}

                {section.bullets && (
                  <ul className="space-y-2 mt-4 ml-4">
                    {section.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex} style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px', lineHeight: 1.7 }}>
                        • {bullet}
                      </li>
                    ))}
                  </ul>
                )}

                {section.footer && (
                  <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px', lineHeight: 1.7, marginTop: '12px' }}>
                    {section.footer}
                  </p>
                )}

                {section.title === "12. Contact Us" && (
                  <div 
                    className="mt-6 p-6 rounded-lg"
                    style={{ backgroundColor: `${COLORS.charcoal}08`, border: `1px solid ${COLORS.charcoal}20` }}
                  >
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>
                      Cosmico
                    </p>
                    <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px' }}>
                      Email:{" "}
                      <a 
                        href="mailto:hello@example.org" 
                        className="transition-opacity hover:opacity-70"
                        style={{ color: COLORS.clay }}
                      >
                        hello@example.org
                      </a>
                    </p>
                    <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px' }}>
                      Website:{" "}
                      <a 
                        href="https://www.example.org" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="transition-opacity hover:opacity-70"
                        style={{ color: COLORS.clay }}
                      >
                        example.org
                      </a>
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-16 pt-8 text-center" style={{ borderTop: `1px solid ${COLORS.charcoal}20` }}>
            <p style={{ ...typography.caption, color: COLORS.charcoal, opacity: 0.6, fontSize: '10px' }}>
              © {new Date().getFullYear()} COSMICO.
              {PRODUCER.name ? (
                <>
                  {" "}A PRODUCTION OF{" "}
                  {PRODUCER.url ? (
                    <a
                      href={PRODUCER.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:opacity-70 transition-opacity"
                    >
                      {PRODUCER.name.toUpperCase()}
                    </a>
                  ) : (
                    PRODUCER.name.toUpperCase()
                  )}
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default Privacy;
