import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import DemoLegalNotice from "@/components/legal/DemoLegalNotice";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { PRODUCER } from "@/platform/externalLinks";

const Terms = () => {
  useCanonicalUrl('/terms');
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
            Terms & Conditions
          </motion.h1>
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

          {/* Friendly Summary */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="mb-16"
          >
            <h2 
              style={{ 
                ...typography.subhead, 
                color: COLORS.charcoal,
                fontSize: '20px',
                marginBottom: '24px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              A Quick Note Before You Buy
            </h2>
            <div className="space-y-4">
              <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '15px', lineHeight: 1.7 }}>
                Cosmico is an intentionally curated gathering built on respect, care, and shared responsibility.
              </p>
              <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '15px', lineHeight: 1.7 }}>
                All ticket sales are final. The lineup and programming may evolve, and the event takes place outdoors in a natural setting. By attending, you agree to look out for yourself, each other, and the land we're gathering on.
              </p>
              <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '15px', lineHeight: 1.7 }}>
                We ask everyone to come with openness, kindness, and good judgment — and to respect the experience we're creating together.
              </p>
              <p style={{ ...typography.body, color: COLORS.clay, fontSize: '15px', lineHeight: 1.7 }}>
                If that feels aligned, we can't wait to welcome you.
              </p>
            </div>
          </motion.div>

          {/* Divider */}
          <div className="flex justify-center mb-16">
            <div className="w-24 h-px" style={{ backgroundColor: `${COLORS.charcoal}30` }} />
          </div>

          {/* Code of Conduct */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="mb-16"
          >
            <h2 
              style={{ 
                ...typography.subhead, 
                color: COLORS.charcoal,
                fontSize: '20px',
                marginBottom: '24px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              Code of Conduct
            </h2>
            <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '15px', lineHeight: 1.7, marginBottom: '16px' }}>
              Cosmico is a community gathering rooted in respect, creativity, and care — for one another, for the land, and for the experience we are creating together.
            </p>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.7, marginBottom: '32px' }}>
              By attending, you agree to uphold the following principles.
            </p>

            <div className="space-y-8">
              {[
                {
                  title: "Be Present & Respectful",
                  items: [
                    "Treat all attendees, artists, staff, volunteers, and community members with respect.",
                    "Harassment, discrimination, or exclusion of any kind will not be tolerated.",
                    "This includes behavior based on race, ethnicity, gender identity, sexual orientation, age, ability, religion, or background."
                  ]
                },
                {
                  title: "Consent & Personal Boundaries",
                  items: [
                    "Consent is required — always.",
                    "Respect personal space, physical boundaries, and verbal boundaries.",
                    "Any form of unwanted physical contact or persistent unwanted attention is grounds for removal."
                  ]
                },
                {
                  title: "Care for the Land",
                  items: [
                    "The Reunion takes place in a natural environment. Respect the land, the water, and the wildlife.",
                    "Leave no trace. Dispose of waste properly.",
                    "Do not damage natural or built structures."
                  ]
                },
                {
                  title: "Substance Responsibility",
                  items: [
                    "If you choose to consume alcohol or other substances, do so responsibly.",
                    "Unsafe behavior that puts yourself or others at risk will not be tolerated.",
                    "Distribution of illegal substances is prohibited."
                  ]
                },
                {
                  title: "Safety & Staff Authority",
                  items: [
                    "Follow all posted rules and instructions from staff and venue personnel.",
                    "We reserve the right to intervene and take action to maintain a safe and welcoming environment.",
                    "This may include warnings, removal from the event, or revocation of access without refund."
                  ]
                },
                {
                  title: "Photography & Privacy",
                  items: [
                    "Be mindful when photographing or recording others.",
                    "Respect requests for privacy.",
                    "Some spaces or experiences may be designated as device-free."
                  ]
                }
              ].map((section, index) => (
                <div key={index}>
                  <h3 style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', fontWeight: 500, marginBottom: '12px' }}>
                    {section.title}
                  </h3>
                  <ul className="space-y-2 ml-4">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex} style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px', lineHeight: 1.7 }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Divider */}
          <div className="flex justify-center mb-16">
            <div className="w-24 h-px" style={{ backgroundColor: `${COLORS.charcoal}30` }} />
          </div>

          {/* Ticket Terms */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <h2 
              style={{ 
                ...typography.subhead, 
                color: COLORS.charcoal,
                fontSize: '20px',
                marginBottom: '24px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              Ticket Terms & Conditions
            </h2>
            <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '15px', lineHeight: 1.7, marginBottom: '32px' }}>
              By purchasing or using a ticket to Cosmico ("Event"), you agree to the following Terms & Conditions.
            </p>

            <div className="space-y-8">
              {[
                {
                  title: "Ticket Purchases & Entry",
                  items: [
                    "All ticket sales are final. Tickets are non-refundable and non-exchangeable, except where required by law.",
                    "Tickets grant admission for the dates specified.",
                    "We reserve the right to refuse entry or remove attendees whose behavior is disruptive or unsafe, without refund."
                  ]
                },
                {
                  title: "Payment Plans",
                  items: [
                    "Payment plans allow the total ticket price to be split into equal installments charged automatically to the card on file.",
                    "Payment plans carry no interest or additional fees — the total amount is the same as paying in full.",
                    "Your payment card is saved securely and charged automatically on the scheduled dates.",
                    "If a scheduled payment fails, we will retry up to 5 times over a 14-day period.",
                    "If payment is not successfully collected after all retry attempts, the remaining balance becomes due in full immediately.",
                    "Failure to complete all scheduled payments may result in cancellation of your ticket without refund for amounts already paid.",
                    "All payment plan purchases are final and non-refundable. Tickets purchased on a payment plan are transferable under the same terms as full-price tickets."
                  ]
                },
                {
                  title: "Event Changes & Force Majeure",
                  items: [
                    "The Event is subject to change, including location details, schedule, programming, and participants.",
                    "We are not responsible for cancellations or changes due to circumstances beyond our control, including weather, natural events, government action, or public health concerns.",
                    "Refunds are not guaranteed in the event of cancellation."
                  ]
                },
                {
                  title: "Lineup & Programming",
                  items: [
                    "Artists and programming are subject to change without notice.",
                    "No refunds will be issued due to lineup or schedule changes."
                  ]
                },
                {
                  title: "Transfers & Resale",
                  items: [
                    "Tickets may not be resold for profit or commercial use without written permission.",
                    "Unauthorized resale may result in ticket cancellation without refund."
                  ]
                },
                {
                  title: "Assumption of Risk",
                  items: [
                    "This is an outdoor event and involves inherent risks.",
                    "Attendees voluntarily assume all risks associated with attendance."
                  ]
                },
                {
                  title: "Liability Waiver",
                  items: [
                    "Attendees release Cosmico and its partners from liability for injury, loss, or damage to persons or property to the fullest extent permitted by law."
                  ]
                },
                {
                  title: "Photography & Media",
                  items: [
                    "Attendance constitutes consent to photography, video, and audio recording for promotional and archival use."
                  ]
                },
                {
                  title: "Governing Law",
                  items: [
                    "These Terms & Conditions are governed by the laws of the State of California."
                  ]
                }
              ].map((section, index) => (
                <div key={index}>
                  <h3 style={{ ...typography.body, color: COLORS.charcoal, fontSize: '16px', fontWeight: 500, marginBottom: '12px' }}>
                    {section.title}
                  </h3>
                  <ul className="space-y-2 ml-4">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex} style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '14px', lineHeight: 1.7 }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>

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

export default Terms;
