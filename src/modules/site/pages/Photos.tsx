import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import MayHeader from "@/components/may/MayHeader";
import MayFooter from "@/components/may/MayFooter";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { toast } from "sonner";
import { configuredSocialLinks } from "@/platform/externalLinks";

type PhotoLink = {
  id: string;
  photographer_name: string;
  instagram_handle: string | null;
  description: string | null;
  url: string;
  cover_images: string[];
  sort_order: number;
};

type Step = "email" | "reflection" | "gallery";

const REFLECTION_MIN = 25;
const STORAGE_KEY = "photo_gallery_email";

const inputStyles: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  backgroundColor: `${COLORS.charcoal}08`,
  border: `1px solid ${COLORS.charcoal}20`,
  borderRadius: "4px",
  color: COLORS.charcoal,
  fontSize: "15px",
  fontFamily: typography.body.fontFamily,
  outline: "none",
  transition: "border-color 0.2s ease",
};

const labelStyles: React.CSSProperties = {
  ...typography.caption,
  color: COLORS.charcoal,
  opacity: 0.6,
  fontSize: "11px",
  marginBottom: "8px",
  display: "block",
};

const primaryBtnStyles = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "16px 24px",
  backgroundColor: COLORS.clay,
  color: COLORS.white,
  border: "none",
  borderRadius: "4px",
  fontSize: "15px",
  fontFamily: typography.button.fontFamily,
  fontWeight: 500,
  letterSpacing: typography.button.letterSpacing,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  transition: "opacity 0.2s ease",
});

export default function Photos() {
  useCanonicalUrl("/photos");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [savedReflection, setSavedReflection] = useState<string | null>(null);
  const [links, setLinks] = useState<PhotoLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [editingReflection, setEditingReflection] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteSubmitted, setInviteSubmitted] = useState(false);
  const [fbCategory, setFbCategory] = useState("feedback");
  const [fbMessage, setFbMessage] = useState("");
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbSubmitted, setFbSubmitted] = useState(false);

  const fbCategories = [
    { value: "feedback", label: "Feedback" },
    { value: "support_our_work", label: "Support our work" },
    { value: "participation", label: "Participation" },
    { value: "other", label: "Other" },
  ];

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fbMessage.trim().length < 5) {
      toast.error("Please share at least a few words.");
      return;
    }
    setFbSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-attendee-feedback", {
        body: {
          email: verifiedEmail,
          name: name || null,
          category: fbCategory,
          message: fbMessage.trim(),
        },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message || "Could not send.");
      }
      setFbSubmitted(true);
      setFbMessage("");
      toast.success("Thank you — we received your note.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setFbSubmitting(false);
    }
  };

  const callFn = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("photo-gallery", { body });
    if (error) {
      const msg = (data as { error?: string } | null)?.error || error.message || "Something went wrong.";
      throw new Error(msg);
    }
    // Verify can legitimately return { valid: false, error: "..." } — let the caller handle it
    const d = data as { valid?: boolean; error?: string };
    if (d?.error && d.valid === undefined) throw new Error(d.error);
    return data as Record<string, unknown>;
  }, []);

  const enterGallery = useCallback(async (emailValue: string, reflectionText: string) => {
    const data = await callFn({ action: "get_links", email: emailValue });
    setLinks((data.links as PhotoLink[]) || []);
    setSavedReflection((data.reflection as string) ?? reflectionText);
    setReflection((data.reflection as string) ?? reflectionText);
    setStep("gallery");
  }, [callFn]);

  // Auto-resume from localStorage, or auto-verify from ?email= (Flodesk link)
  useEffect(() => {
    if (typeof window === "undefined") {
      setBootstrapping(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get("email")?.trim().toLowerCase() || null;
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = urlEmail || stored;
    if (!initial) {
      setBootstrapping(false);
      return;
    }
    if (urlEmail) setEmail(urlEmail);
    (async () => {
      try {
        const data = await callFn({ action: "verify", email: initial });
        if (!data.valid) {
          if (!urlEmail) localStorage.removeItem(STORAGE_KEY);
          return;
        }
        localStorage.setItem(STORAGE_KEY, initial);
        setVerifiedEmail(initial);
        setEmail(initial);
        setName((data.name as string) ?? null);
        const existing = (data.reflection as string) ?? null;
        if (existing && existing.trim().length >= REFLECTION_MIN) {
          await enterGallery(initial, existing);
        } else {
          setReflection(existing ?? "");
          setStep("reflection");
        }
      } catch {
        if (!urlEmail) localStorage.removeItem(STORAGE_KEY);
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [callFn, enterGallery]);

  const handleRequestInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v) {
      toast.error("Enter your email first.");
      return;
    }
    setInviteSubmitting(true);
    try {
      await callFn({
        action: "request_invite",
        email: v,
        name: inviteName.trim() || null,
        note: inviteNote.trim() || null,
      });
      setInviteSubmitted(true);
      toast.success("Request received — we'll be in touch.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v) return;
    setLoading(true);
    setNotFound(false);
    try {
      const data = await callFn({ action: "verify", email: v });
      if (!data.valid) {
        setNotFound(true);
        toast.error((data.error as string) || "We couldn't find that email.");
        return;
      }
      localStorage.setItem(STORAGE_KEY, v);
      setVerifiedEmail(v);
      setName((data.name as string) ?? null);
      const existing = (data.reflection as string) ?? null;
      if (existing && existing.trim().length >= REFLECTION_MIN) {
        await enterGallery(v, existing);
      } else {
        setReflection(existing ?? "");
        setStep("reflection");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reflection.trim().length < REFLECTION_MIN) {
      toast.error(`A few more words — at least ${REFLECTION_MIN} characters.`);
      return;
    }
    setLoading(true);
    try {
      const data = await callFn({
        action: "submit_reflection",
        email: verifiedEmail,
        reflection: reflection.trim(),
      });
      setLinks((data.links as PhotoLink[]) || []);
      setSavedReflection((data.reflection as string) ?? reflection.trim());
      setEditingReflection(false);
      setStep("gallery");
      toast.success("Thank you for sharing.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStep("email");
    setEmail("");
    setVerifiedEmail("");
    setReflection("");
    setSavedReflection(null);
    setLinks([]);
    setName(null);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      <MayHeader minimal />

      <section className="relative pt-24 pb-4 md:pt-28 md:pb-6">
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6">
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{
              ...typography.caption,
              color: COLORS.boulder,
              fontSize: "10px",
              letterSpacing: "0.14em",
              marginBottom: "10px",
            }}
          >
            COSMICO 2026 · PHOTOS
          </motion.p>
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{
              ...typography.headline,
              color: COLORS.charcoal,
              fontSize: "clamp(26px, 3.6vw, 36px)",
              lineHeight: 1.1,
            }}
          >
            The Weekend, In Pictures
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            style={{
              ...typography.body,
              color: COLORS.charcoal,
              opacity: 0.7,
              fontSize: "14px",
              marginTop: "8px",
            }}
          >
            Many of you kept your phones put away, so we wanted to share all the
            photography with you in full — as a thank you, enjoy. Feel free to share
            and download.
          </motion.p>
        </div>
      </section>


      <section className="relative pb-24">
        <FilmGrainOverlay opacity={0.3} />
        <div className="relative z-10 max-w-2xl mx-auto px-6">
          {bootstrapping ? (
            <div className="text-center py-16" style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.6 }}>
              Loading…
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {step === "email" && (
                <motion.form
                  key="email"
                  onSubmit={handleVerify}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="max-w-md mx-auto space-y-6"
                >
                  <div>
                    <label style={labelStyles}>EMAIL USED AT CHECKOUT</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      required
                      maxLength={255}
                      autoFocus
                      style={inputStyles}
                      onFocus={(ev) => (ev.target.style.borderColor = COLORS.clay)}
                      onBlur={(ev) => (ev.target.style.borderColor = `${COLORS.charcoal}20`)}
                    />
                  </div>
                  <button type="submit" disabled={loading} style={primaryBtnStyles(loading)}>
                    {loading ? "Checking…" : "Continue"}
                  </button>
                  <p
                    style={{
                      ...typography.body,
                      color: COLORS.charcoal,
                      opacity: 0.6,
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    Only attendees can see the photos.
                  </p>

                  {notFound && !inviteSubmitted && (
                    <div
                      style={{
                        marginTop: "24px",
                        padding: "20px",
                        backgroundColor: `${COLORS.charcoal}06`,
                        border: `1px solid ${COLORS.charcoal}15`,
                        borderRadius: "6px",
                      }}
                    >
                      <p
                        style={{
                          ...typography.caption,
                          color: COLORS.boulder,
                          fontSize: "10px",
                          marginBottom: "8px",
                        }}
                      >
                        DON'T SEE YOURSELF?
                      </p>
                      <p
                        style={{
                          ...typography.body,
                          color: COLORS.charcoal,
                          opacity: 0.8,
                          fontSize: "13px",
                          marginBottom: "14px",
                          lineHeight: 1.5,
                        }}
                      >
                        If you were there and we don't have your email yet, request an invite and we'll add you.
                      </p>
                      <div style={{ marginBottom: "10px" }}>
                        <input
                          type="text"
                          placeholder="Your name (optional)"
                          value={inviteName}
                          onChange={(ev) => setInviteName(ev.target.value)}
                          maxLength={200}
                          style={inputStyles}
                        />
                      </div>
                      <div style={{ marginBottom: "12px" }}>
                        <textarea
                          placeholder="A quick note — who invited you, what nights you were there, etc. (optional)"
                          value={inviteNote}
                          onChange={(ev) => setInviteNote(ev.target.value)}
                          maxLength={1000}
                          rows={3}
                          style={{ ...inputStyles, resize: "vertical", minHeight: "80px", lineHeight: 1.5 }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRequestInvite}
                        disabled={inviteSubmitting}
                        style={{
                          ...primaryBtnStyles(inviteSubmitting),
                          padding: "12px 20px",
                          fontSize: "14px",
                        }}
                      >
                        {inviteSubmitting ? "Sending…" : "Request invite"}
                      </button>
                    </div>
                  )}

                  {inviteSubmitted && (
                    <div
                      style={{
                        marginTop: "24px",
                        padding: "20px",
                        backgroundColor: `${COLORS.charcoal}06`,
                        border: `1px solid ${COLORS.charcoal}15`,
                        borderRadius: "6px",
                        textAlign: "center",
                      }}
                    >
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "14px" }}>
                        You're in. Check your email for a link to the gallery — we just need a short reflection from you first.
                      </p>
                    </div>
                  )}
                </motion.form>
              )}

              {step === "reflection" && (
                <motion.form
                  key="reflection"
                  onSubmit={handleSubmitReflection}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <p style={{ ...typography.caption, color: COLORS.boulder, marginBottom: "12px" }}>
                      ONE LAST THING{name ? `, ${name.split(" ")[0].toUpperCase()}` : ""}
                    </p>
                    <h2
                      style={{
                        ...typography.subhead,
                        color: COLORS.charcoal,
                        fontSize: "clamp(24px, 4vw, 32px)",
                        marginBottom: "12px",
                      }}
                    >
                      Before we share the photos…
                    </h2>
                    <p style={{ ...typography.body, color: COLORS.charcoal, opacity: 0.8, fontSize: "15px" }}>
                      Share a reflection — a favorite memory, a moment, a story from the weekend. We may use
                      it in our marketing, but only ever anonymously.
                    </p>
                  </div>

                  <div>
                    <label style={labelStyles}>YOUR REFLECTION</label>
                    <textarea
                      placeholder="The thing I'll remember most…"
                      value={reflection}
                      onChange={(ev) => setReflection(ev.target.value)}
                      required
                      maxLength={5000}
                      rows={8}
                      style={{ ...inputStyles, resize: "vertical", minHeight: "200px", lineHeight: 1.6 }}
                      onFocus={(ev) => (ev.target.style.borderColor = COLORS.clay)}
                      onBlur={(ev) => (ev.target.style.borderColor = `${COLORS.charcoal}20`)}
                    />
                    <div
                      style={{
                        ...typography.body,
                        fontSize: "12px",
                        color: COLORS.charcoal,
                        opacity: 0.5,
                        marginTop: "6px",
                        textAlign: "right",
                      }}
                    >
                      {reflection.trim().length} / 25 char min
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || reflection.trim().length < REFLECTION_MIN}
                    style={primaryBtnStyles(loading || reflection.trim().length < REFLECTION_MIN)}
                  >
                    {loading ? "Saving…" : "Share & See the Photos"}
                  </button>
                </motion.form>
              )}

              {step === "gallery" && (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-10"
                >
                  {/* Reflection display / edit */}
                  <div
                    style={{
                      backgroundColor: `${COLORS.charcoal}06`,
                      border: `1px solid ${COLORS.charcoal}15`,
                      borderRadius: "6px",
                      padding: "24px",
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: "10px" }}>
                        YOUR REFLECTION
                      </p>
                      {!editingReflection && (
                        <button
                          type="button"
                          onClick={() => setEditingReflection(true)}
                          style={{
                            background: "none",
                            border: "none",
                            color: COLORS.clay,
                            fontSize: "12px",
                            fontFamily: typography.button.fontFamily,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingReflection ? (
                      <form onSubmit={handleSubmitReflection} className="space-y-3">
                        <textarea
                          value={reflection}
                          onChange={(ev) => setReflection(ev.target.value)}
                          maxLength={5000}
                          rows={6}
                          style={{ ...inputStyles, resize: "vertical", minHeight: "160px", lineHeight: 1.6 }}
                          onFocus={(ev) => (ev.target.style.borderColor = COLORS.clay)}
                          onBlur={(ev) => (ev.target.style.borderColor = `${COLORS.charcoal}20`)}
                        />
                        <div
                          style={{
                            ...typography.body,
                            fontSize: "12px",
                            color: COLORS.charcoal,
                            opacity: 0.5,
                            textAlign: "right",
                          }}
                        >
                          {reflection.trim().length} / {REFLECTION_MIN} min — reflection can be updated but
                          not removed.
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setReflection(savedReflection ?? "");
                              setEditingReflection(false);
                            }}
                            style={{
                              flex: 1,
                              padding: "12px 20px",
                              backgroundColor: "transparent",
                              color: COLORS.charcoal,
                              border: `1px solid ${COLORS.charcoal}30`,
                              borderRadius: "4px",
                              fontSize: "14px",
                              fontFamily: typography.button.fontFamily,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={loading || reflection.trim().length < REFLECTION_MIN}
                            style={{
                              ...primaryBtnStyles(loading || reflection.trim().length < REFLECTION_MIN),
                              flex: 1,
                              padding: "12px 20px",
                              fontSize: "14px",
                            }}
                          >
                            {loading ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p
                        style={{
                          ...typography.body,
                          color: COLORS.charcoal,
                          fontSize: "15px",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {savedReflection}
                      </p>
                    )}
                    {!editingReflection && (
                      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
                        <button
                          type="button"
                          onClick={() => {
                            document.getElementById("share-more")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: COLORS.clay,
                            fontSize: "13px",
                            fontFamily: typography.button.fontFamily,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                          }}
                        >
                          Have more to share with us? →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Invitation to share reflection with photos */}
                  <div
                    style={{
                      textAlign: "center",
                      padding: "8px 0 4px",
                    }}
                  >
                    <p
                      style={{
                        ...typography.body,
                        color: COLORS.charcoal,
                        opacity: 0.75,
                        fontSize: "14px",
                        lineHeight: 1.5,
                      }}
                    >
                      Your words might pair beautifully with any of these galleries — feel free to share.
                    </p>
                  </div>

                  {/* Photo links */}
                  <div className="space-y-6">
                    <div className="flex items-baseline justify-between">
                      <h2
                        style={{
                          ...typography.subhead,
                          color: COLORS.charcoal,
                          fontSize: "clamp(22px, 3vw, 28px)",
                        }}
                      >
                        The Photos
                      </h2>
                      <span
                        style={{
                          ...typography.caption,
                          color: COLORS.boulder,
                          fontSize: "10px",
                        }}
                      >
                        {links.length} {links.length === 1 ? "GALLERY" : "GALLERIES"}
                      </span>
                    </div>

                    {links.length === 0 ? (
                      <div
                        style={{
                          ...typography.body,
                          color: COLORS.charcoal,
                          opacity: 0.6,
                          fontSize: "14px",
                          textAlign: "center",
                          padding: "32px 0",
                        }}
                      >
                        Galleries are still coming in from our photographers. Check back soon.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {links.map((link) => {
                          const igHandleRaw = link.instagram_handle?.trim().replace(/^@/, "") || "";
                          const igUrl = igHandleRaw
                            ? `https://instagram.com/${igHandleRaw}`
                            : "";
                          const igDisplay = igHandleRaw ? `@${igHandleRaw}` : "";
                          return (
                            <div
                              key={link.id}
                              style={{
                                backgroundColor: COLORS.white,
                                border: `1px solid ${COLORS.charcoal}15`,
                                borderRadius: "6px",
                                overflow: "hidden",
                                transition: "transform 0.25s ease, box-shadow 0.25s ease",
                              }}
                              onMouseEnter={(ev) => {
                                ev.currentTarget.style.transform = "translateY(-2px)";
                                ev.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
                              }}
                              onMouseLeave={(ev) => {
                                ev.currentTarget.style.transform = "translateY(0)";
                                ev.currentTarget.style.boxShadow = "none";
                              }}
                            >
                              {link.cover_images && link.cover_images.length > 0 && (
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open gallery by ${link.photographer_name}`}
                                  className="grid"
                                  style={{
                                    gridTemplateColumns: `repeat(${Math.min(link.cover_images.length, 3)}, 1fr)`,
                                    gap: "2px",
                                    backgroundColor: COLORS.charcoal,
                                    textDecoration: "none",
                                  }}
                                >
                                  {link.cover_images.slice(0, 3).map((src, i) => {
                                    const positionOverrides: Record<string, string> = {
                                      "michael-chan/cover-1.jpg": "center 25%",
                                    };
                                    const override = Object.entries(positionOverrides).find(([key]) =>
                                      src.includes(key)
                                    )?.[1];
                                    return (
                                      <img
                                        key={i}
                                        src={src}
                                        alt={`Photo by ${link.photographer_name}`}
                                        loading="lazy"
                                        decoding="async"
                                        style={{
                                          width: "100%",
                                          aspectRatio: "1 / 1",
                                          objectFit: "cover",
                                          objectPosition: override || "center",
                                          display: "block",
                                        }}
                                      />
                                    );
                                  })}
                                </a>
                              )}
                              <div style={{ padding: "20px 24px" }}>
                                <p
                                  style={{
                                    ...typography.caption,
                                    color: COLORS.boulder,
                                    fontSize: "10px",
                                    marginBottom: "8px",
                                  }}
                                >
                                  PHOTOGRAPHY BY
                                </p>
                                <h3
                                  style={{
                                    ...typography.subhead,
                                    color: COLORS.charcoal,
                                    fontSize: "22px",
                                    marginBottom: link.description ? "8px" : "12px",
                                  }}
                                >
                                  {link.photographer_name}
                                </h3>
                                {igHandleRaw && (
                                  <div style={{ marginBottom: link.description ? "8px" : "12px" }}>
                                    <p
                                      style={{
                                        ...typography.body,
                                        color: COLORS.charcoal,
                                        opacity: 0.6,
                                        fontSize: "12px",
                                        fontStyle: "italic",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      Please tag the photographer and tag or collab with us.
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <a
                                        href={igUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          ...typography.body,
                                          color: COLORS.clay,
                                          fontSize: "13px",
                                          letterSpacing: "0.04em",
                                          textDecoration: "underline",
                                          textUnderlineOffset: "3px",
                                        }}
                                      >
                                        {igDisplay}
                                      </a>
                                      <span
                                        style={{
                                          ...typography.body,
                                          color: COLORS.charcoal,
                                          opacity: 0.4,
                                          fontSize: "12px",
                                        }}
                                        aria-hidden="true"
                                      >
                                        ·
                                      </span>
                                      <a
                                        href={configuredSocialLinks().find((s) => s.label === "Instagram")?.url ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          ...typography.body,
                                          color: COLORS.clay,
                                          fontSize: "13px",
                                          letterSpacing: "0.04em",
                                          textDecoration: "underline",
                                          textUnderlineOffset: "3px",
                                        }}
                                      >
                                        @analogcommons
                                      </a>
                                    </div>
                                  </div>
                                )}
                                {link.description && (
                                  <p
                                    style={{
                                      ...typography.body,
                                      color: COLORS.charcoal,
                                      opacity: 0.7,
                                      fontSize: "14px",
                                      marginBottom: "12px",
                                    }}
                                  >
                                    {link.description}
                                  </p>
                                )}
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    ...typography.button,
                                    color: COLORS.clay,
                                    fontSize: "14px",
                                    textDecoration: "underline",
                                    textUnderlineOffset: "4px",
                                  }}
                                >
                                  View gallery →
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Share more / feedback form */}
                  <div
                    id="share-more"
                    style={{
                      backgroundColor: `${COLORS.charcoal}06`,
                      border: `1px solid ${COLORS.charcoal}15`,
                      borderRadius: "6px",
                      padding: "28px",
                      scrollMarginTop: "100px",
                    }}
                  >
                    <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: "10px", marginBottom: "8px" }}>
                      HAVE MORE TO SHARE?
                    </p>
                    <h3
                      style={{
                        ...typography.subhead,
                        color: COLORS.charcoal,
                        fontSize: "clamp(20px, 2.5vw, 24px)",
                        marginBottom: "8px",
                      }}
                    >
                      We'd love to hear from you
                    </h3>
                    <p
                      style={{
                        ...typography.body,
                        color: COLORS.charcoal,
                        opacity: 0.7,
                        fontSize: "14px",
                        marginBottom: "20px",
                      }}
                    >
                      Feedback, ways to support our work, how you'd like to participate next time — it all
                      lands in our inbox.
                    </p>

                    {fbSubmitted ? (
                      <div
                        style={{
                          padding: "16px 20px",
                          backgroundColor: `${COLORS.clay}15`,
                          borderLeft: `3px solid ${COLORS.clay}`,
                          borderRadius: "4px",
                        }}
                      >
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "14px", margin: 0 }}>
                          Thank you — your note is with us. We read every one.
                        </p>
                        <button
                          type="button"
                          onClick={() => setFbSubmitted(false)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            marginTop: "12px",
                            color: COLORS.clay,
                            fontSize: "13px",
                            fontFamily: typography.button.fontFamily,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                          }}
                        >
                          Share something else
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitFeedback} className="space-y-4">
                        <div>
                          <label style={{ ...labelStyles, marginBottom: "10px" }}>
                            WHAT'S THIS ABOUT
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {fbCategories.map((cat) => {
                              const checked = fbCategory === cat.value;
                              return (
                                <label
                                  key={cat.value}
                                  className="cursor-pointer select-none"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "8px 14px",
                                    borderRadius: "4px",
                                    border: `1px solid ${checked ? COLORS.clay : `${COLORS.charcoal}20`}`,
                                    backgroundColor: checked ? `${COLORS.clay}12` : `${COLORS.charcoal}06`,
                                    fontFamily: typography.body.fontFamily,
                                    fontSize: "13px",
                                    color: COLORS.charcoal,
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name="fb-category"
                                    value={cat.value}
                                    checked={checked}
                                    onChange={(ev) => setFbCategory(ev.target.value)}
                                    style={{ accentColor: COLORS.clay, cursor: "pointer" }}
                                  />
                                  {cat.label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <label htmlFor="fb-message" style={labelStyles}>
                            YOUR MESSAGE
                          </label>
                          <textarea
                            id="fb-message"
                            value={fbMessage}
                            onChange={(ev) => setFbMessage(ev.target.value)}
                            maxLength={5000}
                            rows={5}
                            placeholder="Share whatever's on your mind…"
                            style={{ ...inputStyles, resize: "vertical", minHeight: "140px", lineHeight: 1.6 }}
                            onFocus={(ev) => (ev.target.style.borderColor = COLORS.clay)}
                            onBlur={(ev) => (ev.target.style.borderColor = `${COLORS.charcoal}20`)}
                          />
                          <div
                            style={{
                              ...typography.body,
                              fontSize: "12px",
                              color: COLORS.charcoal,
                              opacity: 0.5,
                              textAlign: "right",
                              marginTop: "6px",
                            }}
                          >
                            Sending as {verifiedEmail}
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={fbSubmitting || fbMessage.trim().length < 5}
                          style={primaryBtnStyles(fbSubmitting || fbMessage.trim().length < 5)}
                        >
                          {fbSubmitting ? "Sending…" : "Send to Demo Organizers"}
                        </button>
                      </form>
                    )}
                  </div>



                  <div className="text-center pt-4">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      style={{
                        background: "none",
                        border: "none",
                        color: COLORS.charcoal,
                        opacity: 0.5,
                        fontSize: "12px",
                        fontFamily: typography.button.fontFamily,
                        cursor: "pointer",
                        textDecoration: "underline",
                        textUnderlineOffset: "3px",
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </section>

      <MayFooter />
    </div>
  );
}
