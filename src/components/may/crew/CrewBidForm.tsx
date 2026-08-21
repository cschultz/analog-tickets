import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography, fadeInUp, staggerContainer } from "@/styles/may-theme";
import { toast } from "sonner";
import CrewBidConfirmation from "./CrewBidConfirmation";
import { trackLead, generateEventId, getMetaClientData } from "@/components/AnalyticsTracking";

type RequestType = "crew_bid" | "community_request" | null;

const TICKET_TYPES = [
  { value: "2day_ga", label: "2-Day GA", retail: 215, low: 170, high: 200 },
  { value: "saturday_ga", label: "Saturday GA", retail: 159, low: 120, high: 150 },
  { value: "friday_ga", label: "Friday GA", retail: 99, low: 80, high: 95 },
];

const CREW_SIZES = Array.from({ length: 7 }, (_, i) => i + 4);

const inputStyle: React.CSSProperties = {
  ...typography.body,
  fontSize: '15px',
  backgroundColor: COLORS.white,
  border: `1.5px solid ${COLORS.boulder}`,
  borderRadius: '8px',
  padding: '12px 16px',
  width: '100%',
  color: COLORS.charcoal,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  ...typography.caption,
  color: COLORS.charcoal,
  fontSize: '11px',
  display: 'block',
  marginBottom: '6px',
};

const CrewBidForm = () => {
  const [requestType, setRequestType] = useState<RequestType>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Crew bid fields
  const [captainName, setCaptainName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [crewSize, setCrewSize] = useState(4);
  const [ticketType, setTicketType] = useState("2day_ga");
  const [bidPrice, setBidPrice] = useState("");
  const [pitch, setPitch] = useState("");

  // Community request fields
  const [orgName, setOrgName] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [description, setDescription] = useState("");

  const selectedTicket = TICKET_TYPES.find(t => t.value === ticketType);
  const estimatedTotal = useMemo(() => {
    const price = parseInt(bidPrice) || 0;
    return price * crewSize;
  }, [bidPrice, crewSize]);

  const handleCrewBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captainName || !email || !bidPrice) {
      toast.error("Please fill in all required fields");
      return;
    }
    setLoading(true);
    const bidData = {
      captain_name: captainName,
      email,
      phone: phone || null,
      crew_size: crewSize,
      ticket_type: ticketType,
      bid_price: parseInt(bidPrice),
      pitch: pitch.trim() || null,
    };
    const { error } = await (supabase as any).from("crew_bids").insert(bidData);
    if (error) {
      setLoading(false);
      toast.error("Something went wrong. Please try again.");
      return;
    }
    // Send confirmation email (fire and forget)
    supabase.functions.invoke("send-crew-confirmation", {
      body: { type: "crew_bid", data: { ...bidData, captain_name: captainName } },
    }).catch(() => {});
    // Server-side CAPI Lead + browser pixel with shared event_id
    const leadEventId = generateEventId("Lead");
    trackLead("Crew Bid Submission", email.trim().toLowerCase(), leadEventId);
    getMetaClientData().then((metaData) => {
      supabase.functions.invoke("meta-capi", {
        body: {
          event_name: "Lead",
          event_id: leadEventId,
          event_source_url: metaData.event_source_url,
          content_name: "Crew Bid Submission",
          user_email: email.trim().toLowerCase(),
          user_phone: phone?.trim() || undefined,
          user_first_name: captainName?.trim() || undefined,
          external_id: email.trim().toLowerCase(),
          fbp: metaData.fbp, fbc: metaData.fbc,
          client_ip: metaData.client_ip,
          client_user_agent: metaData.client_user_agent,
        },
      }).catch(() => {});
    });
    setLoading(false);
    setSubmitted(true);
  };

  const handleCommunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captainName || !email || !orgName || !description) {
      toast.error("Please fill in all required fields");
      return;
    }
    setLoading(true);
    const crData = {
      organizer_name: captainName,
      email,
      phone: phone || null,
      organization_name: orgName,
      group_size: parseInt(groupSize) || 0,
      description,
    };
    const { error } = await (supabase as any).from("community_requests").insert(crData);
    if (error) {
      setLoading(false);
      toast.error("Something went wrong. Please try again.");
      return;
    }
    // Send confirmation email (fire and forget)
    supabase.functions.invoke("send-crew-confirmation", {
      body: { type: "community_request", data: { ...crData, organizer_name: captainName } },
    }).catch(() => {});
    // Server-side CAPI Lead + browser pixel with shared event_id
    const leadEventId = generateEventId("Lead");
    trackLead("Community Request Submission", email.trim().toLowerCase(), leadEventId);
    getMetaClientData().then((metaData) => {
      supabase.functions.invoke("meta-capi", {
        body: {
          event_name: "Lead",
          event_id: leadEventId,
          event_source_url: metaData.event_source_url,
          content_name: "Community Request Submission",
          user_email: email.trim().toLowerCase(),
          user_phone: phone?.trim() || undefined,
          user_first_name: captainName?.trim() || undefined,
          external_id: email.trim().toLowerCase(),
          fbp: metaData.fbp, fbc: metaData.fbc,
          client_ip: metaData.client_ip,
          client_user_agent: metaData.client_user_agent,
        },
      }).catch(() => {});
    });
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted && requestType === "crew_bid") {
    return <CrewBidConfirmation />;
  }

  if (submitted && requestType === "community_request") {
    return (
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="text-center py-12">
        <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl mb-6" style={{ ...typography.headline, color: COLORS.charcoal }}>
          Request Received
        </motion.h2>
        <motion.p variants={fadeInUp} style={{ ...typography.body, color: COLORS.charcoal }}>
          Thank you for reaching out. We'll review your community request and be in touch soon.
        </motion.p>
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}>
      <motion.h2 variants={fadeInUp} className="text-3xl md:text-4xl text-center mb-10" style={{ ...typography.headline, color: COLORS.charcoal }}>
        How Would You Like to Join the Reunion?
      </motion.h2>

      {/* Request type selection */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 mb-10">
        {[
          { type: "crew_bid" as const, label: "Bring My Crew", sub: "Crew Bid" },
          { type: "community_request" as const, label: "Community Request", sub: "students, artists, organizations" },
        ].map(opt => (
          <button
            key={opt.type}
            onClick={() => setRequestType(opt.type)}
            className="flex-1 p-5 text-left transition-all duration-300"
            style={{
              backgroundColor: requestType === opt.type ? COLORS.charcoal : COLORS.white,
              border: `2px solid ${requestType === opt.type ? COLORS.charcoal : COLORS.boulder}`,
              borderRadius: 0,
            }}
          >
            <span className="block text-base" style={{ ...typography.subhead, color: requestType === opt.type ? COLORS.white : COLORS.charcoal }}>
              {opt.label}
            </span>
            <span className="block text-xs mt-1" style={{ ...typography.body, color: COLORS.boulder }}>
              {opt.sub}
            </span>
          </button>
        ))}
      </motion.div>

      {/* CREW BID FORM */}
      {requestType === "crew_bid" && (
        <motion.form onSubmit={handleCrewBidSubmit} initial="hidden" animate="visible" variants={staggerContainer} className="space-y-5">
          <motion.div variants={fadeInUp}>
            <span style={labelStyle}>CREW CAPTAIN NAME *</span>
            <input type="text" name="name" autoComplete="name" value={captainName} onChange={e => setCaptainName(e.target.value)} style={inputStyle} required />
          </motion.div>
          <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <span style={labelStyle}>EMAIL *</span>
              <input type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <span style={labelStyle}>PHONE</span>
              <input type="tel" name="phone" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </div>
          </motion.div>
          <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <span style={labelStyle}>CREW SIZE *</span>
              <select value={crewSize} onChange={e => setCrewSize(parseInt(e.target.value))} style={inputStyle}>
                {CREW_SIZES.map(n => <option key={n} value={n}>{n} people</option>)}
              </select>
            </div>
            <div>
              <span style={labelStyle}>TICKET TYPE *</span>
              <select value={ticketType} onChange={e => setTicketType(e.target.value)} style={inputStyle}>
                {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} (${t.retail})</option>)}
              </select>
            </div>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <span style={labelStyle}>BID PRICE PER TICKET ($) *</span>
            <input
              type="number"
              min="1"
              value={bidPrice}
              onChange={e => setBidPrice(e.target.value)}
              style={inputStyle}
              placeholder={selectedTicket ? `Suggested: $${selectedTicket.low}–$${selectedTicket.high}` : ""}
              required
            />
            {selectedTicket && (
              <p className="text-xs mt-2" style={{ ...typography.body, color: COLORS.denim }}>
                {selectedTicket.label} retail: ${selectedTicket.retail} · Likely accepted: ${selectedTicket.low}–${selectedTicket.high}
              </p>
           )}
          </motion.div>

          <motion.div variants={fadeInUp}>
            <span style={labelStyle}>TELL US WHY YOU WANT TO COME</span>
            <textarea
              value={pitch}
              onChange={e => setPitch(e.target.value)}
              style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
              placeholder="Make your pitch — why should we save spots for your crew?"
              maxLength={500}
            />
            <p className="text-xs mt-1" style={{ ...typography.body, color: COLORS.boulder }}>
              Optional, but crews with a good story have a better shot.
            </p>
          </motion.div>

          {/* Estimated total */}
          {parseInt(bidPrice) > 0 && (
            <motion.div variants={fadeInUp} className="rounded-xl p-5" style={{ backgroundColor: COLORS.charcoal }}>
              <p className="text-sm mb-1" style={{ ...typography.caption, color: COLORS.mustard }}>ESTIMATED TOTAL IF ACCEPTED</p>
              <p className="text-3xl" style={{ ...typography.headline, color: COLORS.white }}>
                ${estimatedTotal.toLocaleString()}
              </p>
              <p className="text-xs mt-1" style={{ ...typography.body, color: COLORS.boulder }}>
                {crewSize} tickets × ${bidPrice} each
              </p>
            </motion.div>
          )}

          <motion.div variants={fadeInUp} className="text-xs space-y-2" style={{ ...typography.body, color: COLORS.boulder }}>
            <p>Submitting a bid doesn't commit you to anything yet.</p>
            <p>If your crew is accepted, the Crew Captain will have 24 hours to complete the purchase for the group.</p>
            <p>After purchase, tickets can be assigned to each crew member by name and email, so everyone receives their own ticket and can arrive independently.</p>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-xs uppercase hover:opacity-80 transition-opacity disabled:opacity-60"
              style={{ ...typography.button, backgroundColor: COLORS.clay, color: COLORS.white, borderRadius: 0, fontWeight: 500, letterSpacing: '0.05em' }}
            >
              {loading ? "Submitting..." : "Submit Crew Bid"}
            </button>
          </motion.div>
        </motion.form>
      )}

      {/* COMMUNITY REQUEST FORM */}
      {requestType === "community_request" && (
        <motion.form onSubmit={handleCommunitySubmit} initial="hidden" animate="visible" variants={staggerContainer} className="space-y-5">
          <motion.div variants={fadeInUp} className="rounded-xl p-5 mb-2" style={{ backgroundColor: 'rgba(54,97,41,0.08)', border: `1px solid rgba(54,97,41,0.15)` }}>
            <p className="text-sm mb-2" style={{ ...typography.subhead, color: COLORS.forest }}>
              Who is this for?
            </p>
            <p className="text-sm" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.85, lineHeight: 1.6 }}>
              Community Requests are for groups that contribute something meaningful — student organizations, artist collectives, cultural nonprofits, music communities, youth programs, or any group that adds to the spirit of what Analog is about. Tell us who you are, and we'll work with you on pricing and access.
            </p>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <span style={labelStyle}>ORGANIZER NAME *</span>
            <input type="text" name="name" autoComplete="name" value={captainName} onChange={e => setCaptainName(e.target.value)} style={inputStyle} required />
          </motion.div>
          <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <span style={labelStyle}>EMAIL *</span>
              <input type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <span style={labelStyle}>PHONE</span>
              <input type="tel" name="phone" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </div>
          </motion.div>
          <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <span style={labelStyle}>GROUP / ORGANIZATION NAME *</span>
              <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <span style={labelStyle}>GROUP SIZE</span>
              <input type="number" min="1" value={groupSize} onChange={e => setGroupSize(e.target.value)} style={inputStyle} />
            </div>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <span style={labelStyle}>TELL US ABOUT YOUR GROUP *</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Tell us about your group and why you would like to bring them to Cosmico."
              required
            />
          </motion.div>
          <motion.div variants={fadeInUp}>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-xs uppercase hover:opacity-80 transition-opacity disabled:opacity-60"
              style={{ ...typography.button, backgroundColor: COLORS.forest, color: COLORS.white, borderRadius: 0, fontWeight: 500, letterSpacing: '0.05em' }}
            >
              {loading ? "Submitting..." : "Submit Community Request"}
            </button>
          </motion.div>
        </motion.form>
      )}
    </motion.div>
  );
};

export default CrewBidForm;
