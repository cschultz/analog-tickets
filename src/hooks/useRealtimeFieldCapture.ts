import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEYS = ["cart_intent_session_id", "cart_session_id"] as const;

function createFallbackSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSafeSessionId(): string {
  try {
    for (const key of SESSION_KEYS) {
      const value = sessionStorage.getItem(key);
      if (value) return value;
    }

    const value = createFallbackSessionId();
    sessionStorage.setItem(SESSION_KEYS[0], value);
    return value;
  } catch {
    return createFallbackSessionId();
  }
}

/**
 * Debounced real-time capture of checkout form fields.
 * Saves name, email, phone to checkout_abandonment and cart_intent_signals
 * as the user types — even if they never click "Continue".
 */
export function useRealtimeFieldCapture({
  name,
  email,
  phone,
  ticketType,
  enabled = true,
}: {
  name: string;
  email: string;
  phone: string;
  ticketType: string | null;
  enabled?: boolean;
}) {
  const lastSaved = useRef({ name: "", email: "", phone: "" });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedName = name.trim();

    // Capture as soon as the email contains an "@" and at least one char after it.
    // We accept partial domains (e.g. "jane@gmai") so we don't lose leads who
    // bail mid-typing. The recovery automation will only act on syntactically
    // valid emails (validated server-side / by Resend).
    const atIdx = trimmedEmail.indexOf("@");
    if (!trimmedEmail || atIdx < 1 || atIdx === trimmedEmail.length - 1) return;

    const changed =
      trimmedEmail !== lastSaved.current.email ||
      trimmedName !== lastSaved.current.name ||
      trimmedPhone !== lastSaved.current.phone;

    if (!changed) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        lastSaved.current = {
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
        };

      // Only commit to checkout_abandonment (which triggers email/SMS automation)
      // when the email is fully syntactically valid. Partial typers still get
      // logged as a cart_intent_signal below for funnel visibility.
      const isFullyValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail);
      if (isFullyValidEmail) {
        await supabase.functions
          .invoke("upsert-checkout-abandonment", {
            body: {
              email: trimmedEmail,
              name: trimmedName || null,
              ticket_type: ticketType || null,
              phone: trimmedPhone || null,
            },
          })
          .then(
            () => console.log("[realtime-capture] Fields saved"),
            () => {}
          );
      }

      // Always log a field-capture signal (not gated on phone) and
      // upgrade any prior anonymous signals in this session to identified.
      const sessionId = getSafeSessionId();
      await supabase
        .from("cart_intent_signals")
        .insert({
          session_id: sessionId,
          signal_type: "checkout_field_capture",
          ticket_type: ticketType || null,
          email: trimmedEmail,
          name: trimmedName || null,
          lead_status: "identified",
        })
        .then(
          () => {},
          () => {}
        );

      // Retro-link anonymous signals from this session
      supabase
        .from("cart_intent_signals")
        .update({ email: trimmedEmail, name: trimmedName || null, lead_status: "identified" })
        .eq("session_id", sessionId)
        .is("email", null)
        .then(() => {}, () => {});

      // Sync phone to SimpleTexting immediately when present
      if (trimmedPhone && trimmedPhone.length >= 7) {
        supabase.functions
          .invoke("sync-simpletexting", {
            body: {
              phone: trimmedPhone,
              email: trimmedEmail,
              firstName: trimmedName || undefined,
              listName: "Cosmico Full List",
            },
          })
          .catch(() => {});
      }
      } catch (error) {
        console.warn("[realtime-capture] Best-effort field capture skipped", error);
      }
    }, 2000); // 2 second debounce

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [name, email, phone, ticketType, enabled]);
}
