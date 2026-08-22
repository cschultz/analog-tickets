import MayHeader from "@/components/may/MayHeader";
import DemoLegalNotice from "@/components/legal/DemoLegalNotice";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { COLORS, typography } from "@/styles/may-theme";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { Link } from "react-router-dom";
import { PRODUCER, PRODUCER_PLACEHOLDER } from "@/platform/externalLinks";
import { PRODUCER_DISPLAY_NAME } from "@/platform/externalLinks";

const GiveawayRules = () => {
  useCanonicalUrl("/giveaway-rules");

  const sectionTitle = (text: string) => (
    <h3 className="text-base md:text-lg mb-3 mt-10" style={{ ...typography.subhead, color: COLORS.charcoal }}>
      {text}
    </h3>
  );

  const bodyText = (children: React.ReactNode) => (
    <p className="text-sm mb-4" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
      {children}
    </p>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader />

      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28">
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 md:px-12">
          <DemoLegalNotice />

          <p style={{ ...typography.caption, color: COLORS.denim, letterSpacing: '0.15em', fontSize: '11px', marginBottom: '16px' }}>
            OFFICIAL RULES
          </p>
          <h1
            className="text-[1.8rem] sm:text-[2.2rem] md:text-[2.8rem] leading-[1.1] tracking-tight mb-6"
            style={{ ...typography.headline, color: COLORS.charcoal, textTransform: 'uppercase' }}
          >
            Cosmico VIP Ticket Giveaway
          </h1>

          <div className="p-5 mb-10" style={{ backgroundColor: COLORS.white }}>
            <p className="text-xs uppercase tracking-widest" style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', lineHeight: 1.6 }}>
              NO PURCHASE NECESSARY TO ENTER OR WIN. A PURCHASE OR DONATION WILL NOT INCREASE YOUR CHANCES OF WINNING.
            </p>
          </div>

          {sectionTitle("1. Sponsor")}
          {bodyText(<>This demonstration giveaway is sponsored by <strong>{PRODUCER.name ?? PRODUCER_PLACEHOLDER}</strong> ("Sponsor").{PRODUCER.description ? ` ${PRODUCER.description}` : ""}</>)}
          {bodyText(<><strong>Sponsor address:</strong> {PRODUCER.legalAddress ?? "[sponsor postal address — configure src/platform/externalLinks.ts]"}</>)}
          {PRODUCER.url
            ? bodyText(<><strong>Website:</strong> <a href={PRODUCER.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: COLORS.denim }}>{PRODUCER.url}</a></>)
            : null}

          {sectionTitle("2. Eligibility")}
          {bodyText(<>Open to legal residents of the <strong>State of California</strong> who are <strong>18 years of age or older</strong> at the time of entry. Void where prohibited by law.</>)}
          {bodyText(<>Employees, directors, and immediate family members of the Sponsor are not eligible to participate.</>)}

          {sectionTitle("3. Giveaway Period")}
          {bodyText(<>The giveaway begins on <strong>April 1, 2026</strong> and ends on <strong>May 8, 2026 at 11:59 PM PT</strong> ("Giveaway Period").</>)}

          {sectionTitle("4. How to Enter")}
          {bodyText(<>Participants may enter in one of the following ways:</>)}
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              <strong>Free Entry:</strong> Submit the free entry form available at <Link to="/win" className="underline" style={{ color: COLORS.denim }}>example.org/win</Link>. Limit one (1) entry per person.
            </li>
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              <strong>Optional Donation:</strong> Participants may make a voluntary donation to {PRODUCER_DISPLAY_NAME}. <strong>A donation is NOT required to enter and does NOT increase the chance of winning.</strong> Donors still receive only one (1) entry — identical to free entrants.
            </li>
          </ul>
          {bodyText(<><strong>NO PURCHASE OR DONATION NECESSARY TO ENTER OR WIN. A PURCHASE OR DONATION WILL NOT INCREASE YOUR CHANCES OF WINNING.</strong> All entrants — free or donating — receive exactly one (1) entry and have equal odds.</>)}

          {sectionTitle("5. Prize")}
          {bodyText(<>One (1) winner will receive the following grand prize package:</>)}
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              <strong>Two (2) Crew (2-Day) Passes</strong> to <strong>Cosmico 2026</strong> (May 14–16, 2027 at Example Meadow, Example Valley, CA). Retail value: $99 each ($198 total).
            </li>
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              <strong>Two (2) nights of on-site glamping tent lodging</strong> at Example Meadow during the festival weekend (subject to availability). Retail value of one (1) night: $275. The second night is provided at no additional retail value pursuant to Example Meadow's "buy-one-night-get-one-night" promotional offer; accordingly, the second night carries no independent retail value and is excluded from the ARV calculation below.
            </li>
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              <strong>Sunhouse Sauna ritual experience</strong> for two, redeemable at Sunhouse's the demo wellness outpost location (not on-site at Cosmico). Subject to availability and Sunhouse's scheduling. Provided as a courtesy of Sunhouse Sauna; <strong>no cash value</strong> and not included in the ARV calculation.
            </li>
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              <strong>72-hour Demo Adventure Vehicle weekend getaway</strong> (R1T or R1S), bookable on a date that works for the winner — does not need to coincide with the festival weekend. Driver must be 21+. Two (2) weeks' notice required. Provided as a courtesy of Demo Adventure Vehicle; <strong>no cash value</strong> and not included in the ARV calculation.
            </li>
          </ul>
          {bodyText(<><strong>Approximate Retail Value (ARV): $473</strong> (two Crew passes at $198 + one night Example Meadow lodging at $275). The second night of Example Meadow lodging, the Sunhouse Sauna ritual, and the Demo Adventure Vehicle weekend getaway are partner-provided experiences with no independent cash or retail value and are excluded from the ARV.</>)}
          {bodyText(<><strong>Travel to and from the festival, lodging beyond the included on-site tent stay, meals, and incidentals are NOT included.</strong> Prize is non-transferable, non-refundable, and has no cash value. Partner experiences are subject to availability, scheduling coordination, applicable waivers, and the partner's terms.</>)}

          {sectionTitle("6. Winner Selection & Notification")}
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              Winner will be selected via <strong>random drawing within three (3) days</strong> after the Giveaway Period ends
            </li>
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              Winner will be notified via <strong>email</strong> from <a href="mailto:hello@example.org" className="underline" style={{ color: COLORS.denim }}>hello@example.org</a>
            </li>
            <li className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.7 }}>
              Winner must respond within <strong>48 hours</strong> of notification or an alternate winner may be selected
            </li>
          </ul>

          {sectionTitle("7. Odds")}
          {bodyText(<>Odds of winning depend on the total number of eligible entries received.</>)}

          {sectionTitle("8. Publicity")}
          {bodyText(<>By entering, participants agree to allow Sponsor to use their name and likeness for promotional purposes without additional compensation, unless prohibited by law.</>)}

          {sectionTitle("9. General Conditions")}
          {bodyText(<>Sponsor reserves the right to cancel, suspend, or modify the giveaway if fraud, technical failures, or other factors impair the integrity of the giveaway.</>)}
          {bodyText(<>Sponsor may disqualify any individual found tampering with the entry process or acting in violation of these rules.</>)}

          {sectionTitle("10. Limitation of Liability")}
          {bodyText(<>By entering, participants agree to release and hold harmless {PRODUCER_DISPLAY_NAME} and its affiliates from any liability arising from participation in the giveaway or use of the prize.</>)}

          {sectionTitle("11. Taxes")}
          {bodyText(<>Winner is solely responsible for all applicable federal, state, and local taxes associated with the prize, if any.</>)}

          {sectionTitle("12. Governing Law")}
          {bodyText(<>This giveaway is governed by the laws of the United States and the State of California.</>)}

          {sectionTitle("13. No Affiliation with Meta / Social Platforms")}
          {bodyText(<>This promotion is in no way sponsored, endorsed, administered by, or associated with Facebook, Instagram, or Meta Platforms, Inc., or any other social media platform. Entrants release Meta and any other social media platforms from all liability related to this giveaway.</>)}

          {sectionTitle("14. Contact")}
          {bodyText(<>For questions, contact: <a href="mailto:hello@example.org" className="underline" style={{ color: COLORS.denim }}>hello@example.org</a></>)}

          {/* Back link */}
          <div className="mt-12 pt-8" style={{ borderTop: `1px solid ${COLORS.boulder}30` }}>
            <Link to="/win" className="inline-block px-6 py-3 text-xs uppercase hover:opacity-80 transition-opacity" style={{
              ...typography.button, backgroundColor: COLORS.charcoal, color: COLORS.dustySky, fontWeight: 500, letterSpacing: '0.05em'
            }}>
              ← Back to Giveaway
            </Link>
          </div>
        </div>
      </section>

      <MayFooter />
    </div>
  );
};

export default GiveawayRules;
