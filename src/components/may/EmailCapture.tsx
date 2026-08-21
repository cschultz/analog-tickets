import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography } from "@/styles/may-theme";
import { Loader2 } from "lucide-react";
import { trackLead, generateEventId, getMetaClientData } from "@/components/AnalyticsTracking";

interface EmailCaptureProps {
  variant?: "inline" | "stacked" | "compact";
  headline?: string;
  subheadline?: string;
  buttonText?: string;
  showPhone?: boolean;
  showFirstName?: boolean;
  className?: string;
  darkMode?: boolean;
}

const EmailCapture = ({
  variant = "stacked",
  headline,
  subheadline,
  buttonText = "Join",
  showPhone = true,
  showFirstName = true,
  className = "",
  darkMode = false,
}: EmailCaptureProps) => {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Please enter your email");
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    const insertData: { email: string; phone?: string; first_name?: string } = {
      email: trimmedEmail,
    };

    const hasPhone = phone.trim().length > 0;
    const hasFirstName = firstName.trim().length > 0;

    if (hasPhone) {
      insertData.phone = phone.trim();
    }
    if (hasFirstName) {
      insertData.first_name = firstName.trim();
    }

    const { error } = await supabase
      .from("preview_signups")
      .insert(insertData);

    // Generate a shared Lead event ID for browser↔server deduplication
    const leadEventId = generateEventId("Lead");

    if (error) {
      if (error.code === "23505") {
        toast.success("You're already on the list!");
        // Still track as lead for duplicate signups (re-engagement)
        trackLead("Cosmico Email Opt-in", trimmedEmail, leadEventId);
      } else {
        toast.error("Something went wrong. Please try again.");
        setIsSubmitting(false);
        return;
      }
    } else {
      toast.success("You're in! We'll be in touch.");
      // Browser pixel Lead with shared event_id
      trackLead("Cosmico Email Opt-in", trimmedEmail, leadEventId);
    }

    // Server-side CAPI Lead (fire and forget — source of truth for Meta)
    getMetaClientData().then((metaData) => {
      supabase.functions
        .invoke("meta-capi", {
          body: {
            event_name: "Lead",
            event_id: leadEventId,
            event_source_url: metaData.event_source_url,
            content_name: "Cosmico Email Opt-in",
            user_email: trimmedEmail,
            user_phone: hasPhone ? phone.trim() : undefined,
            user_first_name: hasFirstName ? firstName.trim() : undefined,
            external_id: trimmedEmail,
            fbp: metaData.fbp,
            fbc: metaData.fbc,
            client_ip: metaData.client_ip,
            client_user_agent: metaData.client_user_agent,
          },
        })
        .then(({ error: capiError }) => {
          if (capiError) console.error("[Meta CAPI] Lead error:", capiError);
        });
    });

    const emailToSync = trimmedEmail;
    const nameToSync = hasFirstName ? firstName.trim() : undefined;

    // Sync to Flodesk (fire and forget)
    supabase.functions
      .invoke("sync-flodesk", {
        body: {
          email: emailToSync,
          firstName: nameToSync,
        },
      })
      .then(({ error: syncError }) => {
        if (syncError) {
          console.error("Flodesk sync error:", syncError);
        }
      });

    // Sync to ConvertKit (fire and forget)
    supabase.functions
      .invoke("sync-convertkit", {
        body: {
          email: emailToSync,
          firstName: nameToSync,
        },
      })
      .then(({ error: syncError }) => {
        if (syncError) {
          console.error("ConvertKit sync error:", syncError);
        }
      });

    // Sync phone to SimpleTexting if provided (fire and forget)
    if (hasPhone) {
      supabase.functions
        .invoke("sync-simpletexting", {
          body: {
            phone: phone.trim(),
            email: emailToSync,
            firstName: nameToSync,
            listName: "Cosmico List",
          },
        })
        .then(({ error: syncError }) => {
          if (syncError) {
            console.error("SimpleTexting sync error:", syncError);
          }
        });
    }

    setFirstName("");
    setEmail("");
    setPhone("");
    setIsSubmitting(false);
  };

  const textColor = darkMode ? COLORS.dustySky : COLORS.charcoal;
  const mutedColor = darkMode ? COLORS.boulder : COLORS.boulder;
  const inputBg = darkMode ? `${COLORS.charcoal}` : COLORS.white;
  const inputBorder = darkMode ? `${COLORS.dustySky}30` : `${COLORS.charcoal}20`;
  const inputText = darkMode ? COLORS.dustySky : COLORS.charcoal;
  const placeholderOpacity = darkMode ? "placeholder:text-gray-500" : "placeholder:text-gray-400";

  if (variant === "compact") {
    return (
      <form onSubmit={handleSubmit} className={`${className}`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            name="email"
            className={`flex-1 h-10 text-sm ${placeholderOpacity}`}
            style={{
              backgroundColor: inputBg,
              borderColor: inputBorder,
              color: inputText,
              borderRadius: "0",
            }}
          />
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-10 px-5 text-xs uppercase"
            style={{
              ...typography.button,
              backgroundColor: darkMode ? COLORS.clay : COLORS.charcoal,
              color: darkMode ? COLORS.charcoal : COLORS.dustySky,
              borderRadius: "0",
            }}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonText}
          </Button>
        </div>
      </form>
    );
  }

  if (variant === "inline") {
    return (
      <form onSubmit={handleSubmit} className={`${className}`}>
        {headline && (
          <p
            className="mb-4"
            style={{
              ...typography.subhead,
              color: textColor,
              fontSize: "16px",
            }}
          >
            {headline}
          </p>
        )}
        {subheadline && (
          <p
            className="mb-4"
            style={{
              ...typography.body,
              color: mutedColor,
              fontSize: "14px",
            }}
          >
            {subheadline}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          {showFirstName && (
            <Input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              name="firstName"
              className={`sm:w-32 h-11 text-sm ${placeholderOpacity}`}
              style={{
                backgroundColor: inputBg,
                borderColor: inputBorder,
                color: inputText,
                borderRadius: "0",
              }}
            />
          )}
          {showPhone && (
            <Input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              name="phone"
              className={`sm:w-32 h-11 text-sm ${placeholderOpacity}`}
              style={{
                backgroundColor: inputBg,
                borderColor: inputBorder,
                color: inputText,
                borderRadius: "0",
              }}
            />
          )}
          <Input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            name="email"
            className={`flex-1 h-11 text-sm ${placeholderOpacity}`}
            style={{
              backgroundColor: inputBg,
              borderColor: inputBorder,
              color: inputText,
              borderRadius: "0",
            }}
          />
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 px-6 text-xs uppercase"
            style={{
              ...typography.button,
              backgroundColor: darkMode ? COLORS.clay : COLORS.charcoal,
              color: darkMode ? COLORS.charcoal : COLORS.dustySky,
              borderRadius: "0",
            }}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonText}
          </Button>
        </div>
      </form>
    );
  }

  // Default: stacked variant
  return (
    <form onSubmit={handleSubmit} className={`${className}`}>
      {headline && (
        <p
          className="mb-3"
          style={{
            ...typography.subhead,
            color: textColor,
            fontSize: "18px",
          }}
        >
          {headline}
        </p>
      )}
      {subheadline && (
        <p
          className="mb-5"
          style={{
            ...typography.body,
            color: mutedColor,
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          {subheadline}
        </p>
      )}
      <div className="space-y-3">
        <div className="flex gap-3">
          {showFirstName && (
            <Input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              name="firstName"
              className={`flex-1 h-11 text-sm ${placeholderOpacity}`}
              style={{
                backgroundColor: inputBg,
                borderColor: inputBorder,
                color: inputText,
                borderRadius: "0",
              }}
            />
          )}
          {showPhone && (
            <Input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              name="phone"
              className={`flex-1 h-11 text-sm ${placeholderOpacity}`}
              style={{
                backgroundColor: inputBg,
                borderColor: inputBorder,
                color: inputText,
                borderRadius: "0",
              }}
            />
          )}
        </div>
        <div className="flex gap-3">
          <Input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            name="email"
            className={`flex-1 h-11 text-sm ${placeholderOpacity}`}
            style={{
              backgroundColor: inputBg,
              borderColor: inputBorder,
              color: inputText,
              borderRadius: "0",
            }}
          />
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 px-6 text-xs uppercase whitespace-nowrap"
            style={{
              ...typography.button,
              backgroundColor: darkMode ? COLORS.clay : COLORS.charcoal,
              color: darkMode ? COLORS.charcoal : COLORS.dustySky,
              borderRadius: "0",
            }}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonText}
          </Button>
        </div>
      </div>
      <p
        className="mt-3"
        style={{
          ...typography.caption,
          color: mutedColor,
          fontSize: "11px",
          opacity: 0.7,
        }}
      >
        * Required. We'll never share your info.
      </p>
    </form>
  );
};

export default EmailCapture;
