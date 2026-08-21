import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { COLORS, typography } from "@/styles/may-theme";
import { Loader2, Mail, Shield } from "lucide-react";

const bookingEmailSchema = z.string().trim().email("Please enter a valid email").max(255);

interface ManageBookingPanelProps {
  defaultEmail?: string;
  helperText?: string;
  className?: string;
  mode?: "full" | "linkOnly";
}

export default function ManageBookingPanel({
  defaultEmail = "",
  helperText = "Bought tickets already? Use the same email to view tickets, add lodging, or purchase add-ons.",
  className = "",
  mode = "full",
}: ManageBookingPanelProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSendAccessLink = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedEmail = bookingEmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      toast.error(parsedEmail.error.issues[0]?.message || "Please enter a valid email");
      return;
    }

    setSending(true);
    try {
      const normalizedEmail = parsedEmail.data.toLowerCase();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: `${window.location.origin}/my-tickets` },
      });

      if (error) throw error;

      setSentTo(normalizedEmail);
      toast.success("Secure access link sent! Check your email.");
    } catch (error: any) {
      console.error("Manage booking access link error:", error);
      toast.error(error.message || "Failed to send access link");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{
        backgroundColor: COLORS.white,
        borderColor: `${COLORS.charcoal}15`,
      }}
    >
      {mode === "linkOnly" ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "16px", fontWeight: 600 }}>
            Already have tickets? View tickets, add lodging, or manage add-ons.
          </p>
          <Link
            to="/my-tickets"
            className="inline-flex items-center gap-2 text-sm hover:opacity-70 transition-opacity"
            style={{ color: COLORS.charcoal, ...typography.button }}
          >
            Manage booking
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "16px", fontWeight: 600 }}>
              Already booked? View tickets, add lodging, or manage add-ons.
            </p>
            <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: "13px", marginTop: "6px", lineHeight: 1.6 }}>
              Enter the email used for your order and we&apos;ll send you a secure access link.
            </p>
          </div>

          <div
            className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1"
            style={{ backgroundColor: `${COLORS.charcoal}08`, color: COLORS.boulder }}
          >
            <Shield className="h-3.5 w-3.5" />
            <span style={{ ...typography.caption, fontSize: "11px", letterSpacing: "0.08em" }}>SECURE ACCESS</span>
          </div>
        </div>

        <form onSubmit={handleSendAccessLink} className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Input
              type="email"
              placeholder="Email used for your order"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (sentTo) setSentTo(null);
              }}
              className="h-11"
              style={{ borderColor: `${COLORS.charcoal}20` }}
              aria-label="Email used for your order"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: COLORS.charcoal,
              color: COLORS.white,
              ...typography.button,
            }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {sending ? "Sending…" : "Send me a secure access link"}
          </button>
        </form>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p style={{ ...typography.caption, color: sentTo ? COLORS.charcoal : COLORS.boulder, fontSize: "12px", lineHeight: 1.5 }}>
            {sentTo ? `Secure link sent to ${sentTo}.` : helperText}
          </p>
          <Link
            to="/my-tickets"
            className="inline-flex items-center gap-2 text-sm hover:opacity-70 transition-opacity"
            style={{ color: COLORS.charcoal, ...typography.button }}
          >
            Manage booking
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}