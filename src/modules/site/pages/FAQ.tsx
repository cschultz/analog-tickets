import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion } from "framer-motion";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import ScheduleStrip from "@/components/may/ScheduleStrip";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import festivalMap from "@/assets/analog-reunion-map.png";

const FAQ = () => {
  useCanonicalUrl('/faq');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico – FAQ",
      item_category: "Festival",
      price: 215,
    });
  }, []);
  const faqs = [
    {
      question: "How many days is Cosmico?",
      answer: [
        "The main Cosmico takes place over two days — Friday and Saturday — at Example Meadow.",
        "VIP ticket holders receive access to an additional Sunday afternoon show at an intimate offsite location. This bonus day is inspired by the original backyard Cosmico gatherings — a smaller, more personal experience to close out the weekend.",
        "GA tickets include Friday and Saturday at Example Meadow. VIP tickets include all three days."
      ]
    },
    {
      question: "What is a Crew ticket and how do I get one?",
      answer: [
        "Crew tickets are a special ticket tier with very limited public availability. Most are reserved for the people who help create the Reunion — our volunteers, builders, artists, donors, and contributors.",
        "If you'd like to be considered for a Crew ticket in the future, the best path is to get involved. Volunteer at this year's event, contribute to the build, support our nonprofit mission, or reach out to learn about other ways to participate.",
        "Crew tickets include all VIP benefits plus exclusive Crew-only gatherings and founders recognition."
      ]
    },
    {
      question: "What's included in my ticket?",
      answer: [
        "All tickets include access to live music, the artisan market, and wellness experiences.",
        "Wine Camp is included with VIP tickets and 2-day GA passes only. It is not included with Saturday-only passes.",
        "VIP and Crew tickets include additional perks like early entry, exclusive areas, and dedicated concierge service."
      ]
    },
    {
      question: "Are children welcome?",
      answer: [
        "Yes! Cosmico is a family-friendly gathering. Children 12 and under are free with a ticketed adult. We have dedicated kids' activities and family-friendly spaces throughout the weekend."
      ]
    },
    {
      question: "What is the refund policy?",
      answer: [
        "Tickets are non-refundable but fully transferable. If you can no longer attend, you may transfer your ticket to another person at no charge. Contact us at hello@example.org to arrange a transfer."
      ]
    },
    {
      question: "What about accommodations?",
      answer: [
        "On-site glamping is available exclusively to VIP 3-day ticket holders. GA ticket holders do not have access to on-site lodging.",
        { text: "If you already have a VIP ticket, you can manage lodging and add-ons at ", link: { href: "/my-tickets", text: "example.org/my-tickets" }, suffix: " using the email you registered with." },
        "Off-site hotels and vacation rentals are available in nearby Example Valley for those who prefer to stay off-property."
      ]
    },
    {
      question: "Can I bring an RV or sprinter van?",
      answer: [
        "Yes! We have limited on-site camping available for RVs and sprinter vans. A VIP ticket is required to stay on-site.",
        "Availability is very limited. To reserve a spot, contact us directly at hello@example.org."
      ]
    },
    {
      question: "Is there parking?",
      answer: [
        "On-site parking is limited to 1 car per tent or cabin. Off-site paid parking options with shuttle service will be available. Uber and carpooling are encouraged. Details on parking and directions will be sent before the event."
      ]
    },
    {
      question: "Can I bring outside food or drinks?",
      answer: [
        "Outside alcohol is not permitted. Small snacks and water are welcome. A variety of food vendors and the wine village will be available throughout the event."
      ]
    },
    {
      question: "Can I bring my dog?",
      answer: [
        "While Example Meadow is normally a dog-friendly property, we're unable to accommodate dogs during the Reunion. Large crowds, amplified music, and the unpredictable nature of festivals can be stressful and unsafe for our four-legged friends.",
        "We know leaving your pup at home isn't easy, but it's the best decision for their wellbeing — and for all our guests. Service animals are of course welcome with proper documentation."
      ]
    },
    {
      question: "How do I get to the venue?",
      answer: [
        "We'll have two offsite parking locations near the venue, with continuous shuttle loops running to and from Example Meadow throughout the evening. It's designed to be easy and flowing — no long waits, just hop on and go.",
        "Uber and carpooling are also encouraged. Detailed directions and parking information will be sent before the event."
      ]
    },
    {
      question: "What's the Friday schedule?",
      answer: [
        "Doors open at 4:00 PM and music begins at 5:00 PM. Friday is a beautiful ramp-up into the weekend — come early, settle in, and enjoy the full arc of the evening."
      ]
    },
    {
      question: "What food options are available?",
      answer: [
        "A curated lineup of food vendors will be onsite throughout the weekend, plus a special Friday Long Table Dinner with Ramen experience (advance signup required).",
        { text: "See the full food lineup at ", link: { href: "/eat", text: "example.org/eat" }, suffix: ". Vendors will do their best to accommodate dietary restrictions, and you're welcome to bring your own food. Outside alcohol is not permitted." }
      ]
    },
    {
      question: "Is there a sauna?",
      answer: [
        "Yes — Sauna Village runs all weekend with hot/cold ritual stations between sets. Hot, cold, repeat — before dinner, between music, under the stars.",
        { text: "Meet the sauna partners at ", link: { href: "/sauna", text: "example.org/sauna" }, suffix: "." }
      ]
    },
    {
      question: "Which wineries are pouring?",
      answer: [
        "WineCamp brings together a curated group of independent Example County winemakers — pouring what they're excited about right now, in conversation, without the pretense.",
        "Access to WineCamp is included with VIP tickets and 2-day GA passes only. Saturday-only passes do not include WineCamp.",
        { text: "See the full WineCamp lineup at ", link: { href: "/winecamp", text: "example.org/winecamp" }, suffix: "." }
      ]
    },
    {
      question: "I'm staying on-site — can I bring a cooler?",
      answer: [
        "Yes — on-site guests are welcome to bring a cooler. There is no refrigerator in the tents or cabins, so a cooler with ice is the easiest way to keep drinks and snacks cold for the weekend.",
        "Please remember outside alcohol is not permitted into the festival grounds — coolers are for use at your tent or cabin only."
      ]
    },
    {
      question: "Do the tents and cabins lock?",
      answer: [
        "No — the on-site tents and cabins do not lock. Please do not bring valuables you can't afford to lose. Leave jewelry, extra cash, and irreplaceable items at home, and keep wallets, phones, keys, and IDs on you.",
        "If you need to secure something, bring a small personal lockbox or use your vehicle."
      ]
    },
    {
      question: "How many vehicles can I bring if I'm staying on-site?",
      answer: [
        "One vehicle per tent or cabin — no exceptions. On-site space is extremely limited and this rule keeps the property safe and walkable for everyone.",
        "Additional guests in your party should carpool, use the shuttle from off-site parking, or take a rideshare. Off-site parking and shuttle details will be sent before the event."
      ]
    },
    {
      question: "Is there power in the tents and cabins?",
      answer: [
        "Yes — the on-site tents and cabins have power. You'll be able to charge phones and run small essentials. There is no refrigerator in the rooms, so plan to use a cooler for anything that needs to stay cold."
      ]
    },
    {
      question: "What about showers and restrooms?",
      answer: [
        "On-site guests have access to shared showers and shared restrooms throughout the property.",
        "For day guests, clean porta-johns will be available throughout the festival grounds."
      ]
    },
    {
      question: "Can I leave the festival and come back?",
      answer: [
        "Yes — re-entry is allowed. If you need to step out to check on kids, grab something from your car, or handle anything offsite, just keep your wristband on and you're welcome back through the gates."
      ]
    },
    {
      question: "Is the festival cashless?",
      answer: [
        "Yes — Cosmico is a cashless event. Please bring a card; we accept Apple Pay and all major credit cards at our points of sale.",
        "Independent food vendors set their own payment policies, but most are card and mobile-pay friendly. Bring a small amount of cash if you'd like to tip."
      ]
    },
    {
      question: "Where is medical / first aid?",
      answer: [
        "On-site medical is available at the Medic tent, located right inside the gates as you enter. If you or someone near you needs help, find any staff member or head straight to the Medic tent — we'll take care of you."
      ]
    },
    {
      question: "Is the festival ADA accessible?",
      answer: [
        "Yes — there is wheelchair accessibility throughout the campground, and we're happy to set up a dedicated viewing area for any guest with ADA needs.",
        "If you have specific accessibility requests, please reach out in advance at hello@example.org so we can make sure everything is ready when you arrive."
      ]
    },
    {
      question: "Can we swim in the river?",
      answer: [
        "The river is one of the most beautiful parts of Example Meadow — but river entry and swimming are strictly at your own risk. There are no lifeguards on site.",
        "Children must be supervised at all times by the river. Please look after your family and your friends with great care — currents, depth, and footing change with conditions, and we cannot take any risk on your behalf."
      ]
    },
    {
      answer: [
        "Yes — both high-back and low-back chairs are welcome. They must be set up in the designated chair area so sightlines stay clear in the main standing and dance zones near the stage."
      ]
    },
    {
      question: "Can I bring a camera?",
      answer: [
        "Yes — you're more than welcome to bring a camera. We love seeing the Reunion through our guests' eyes."
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
            QUESTIONS & ANSWERS
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
            Frequently Asked Questions
          </motion.h1>
        </div>
      </section>

      {/* FAQ Content */}
      <section 
        className="relative py-16 md:py-24"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6">
          <div className="space-y-8">
            {faqs.map((faq, index) => (
              <motion.div 
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeInUp}
                className="pb-8"
                id={faq.question === "Which wineries are pouring?" ? "wine-camp-eligibility" : undefined}
                style={{ borderBottom: `1px solid ${COLORS.charcoal}20` }}
              >
                <h3 
                  style={{ 
                    ...typography.subhead, 
                    color: COLORS.charcoal,
                    fontSize: '18px',
                    marginBottom: '12px'
                  }}
                >
                  {faq.question}
                </h3>
                <div className="space-y-3">
                  {faq.answer.map((paragraph, pIndex) => (
                    <p 
                      key={pIndex}
                      style={{ 
                        ...typography.body, 
                        color: COLORS.charcoal,
                        opacity: 0.8,
                        fontSize: '15px',
                        lineHeight: 1.7
                      }}
                    >
                      {typeof paragraph === 'string' ? paragraph : (
                        <>
                          {paragraph.text}
                          <Link 
                            to={paragraph.link.href}
                            className="underline hover:opacity-70 transition-opacity"
                            style={{ color: COLORS.clay }}
                          >
                            {paragraph.link.text}
                          </Link>
                          {paragraph.suffix}
                        </>
                      )}
                    </p>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={fadeInUp}
            className="mt-16"
            id="venue-map"
          >
            <div
              className="overflow-hidden rounded-xl"
              style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.charcoal}14` }}
            >
              <div className="px-5 pt-5 md:px-6 md:pt-6">
                <p style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.14em' }}>
                  VENUE MAP
                </p>
                <h2 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '22px', marginTop: '10px' }}>
                  Need a lay of the land?
                </h2>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', marginTop: '8px', lineHeight: 1.6 }}>
                  Here&apos;s the Example Meadow festival map with stages, Wine Camp, Sauna Village, parking, shuttle drop, and river access.
                </p>
              </div>
              <a href={festivalMap} target="_blank" rel="noreferrer" className="block hover:opacity-95 transition-opacity">
                <img src={festivalMap} alt="Cosmico festival map showing stages, camping loops, vendors, Wine Camp, and river access at Example Meadow" loading="lazy" className="mt-5 w-full" />
              </a>
              <div className="px-5 pb-5 pt-4 md:px-6 md:pb-6">
                <a href={festivalMap} target="_blank" rel="noreferrer" className="underline hover:opacity-70 transition-opacity" style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em' }}>
                  OPEN FULL MAP
                </a>
              </div>
            </div>
          </motion.div>

          {/* Contact CTA */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="mt-16 pt-8 text-center"
            style={{ borderTop: `1px solid ${COLORS.charcoal}20` }}
          >
            <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: '15px' }}>
              Have another question?{" "}
              <a 
                href="mailto:hello@example.org" 
                className="transition-opacity hover:opacity-70"
                style={{ color: COLORS.clay }}
              >
                Contact us
              </a>
            </p>
          </motion.div>
        </div>
      </section>

      <ScheduleStrip />
      <MayFooter />
    </div>
  );
};

export default FAQ;
