import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PromoCodeResult {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
}

export type PromoErrorCode =
  | "EMPTY"
  | "INVALID"
  | "EXPIRED"
  | "NOT_YET_ACTIVE"
  | "MAX_USES"
  | "TICKET_TYPE_NOT_ALLOWED"
  | "MIN_ORDER"
  | "ALREADY_USED"
  | "BAD_REQUEST"
  | "DB_ERROR"
  | "NETWORK"
  | "UNKNOWN";

export interface PromoError {
  code: PromoErrorCode;
  /** Short headline shown prominently */
  title: string;
  /** Optional secondary line giving the user a next step */
  detail?: string;
  /** Visual severity to drive UI treatment */
  severity: "error" | "warning" | "info";
}

function buildError(rawCode: string | undefined, fallbackMessage?: string): PromoError {
  const code = (rawCode as PromoErrorCode) || "UNKNOWN";
  switch (code) {
    case "EMPTY":
      return { code, title: "Enter a promo code", severity: "info" };
    case "INVALID":
      return {
        code,
        title: "That code isn't recognized",
        detail: "Double-check the spelling — codes are case-insensitive.",
        severity: "error",
      };
    case "EXPIRED":
      return {
        code,
        title: "This code has expired",
        detail: "Reach out to hello@example.org if you think this is a mistake.",
        severity: "warning",
      };
    case "NOT_YET_ACTIVE":
      return {
        code,
        title: "This code isn't active yet",
        detail: "It will become valid on its scheduled start date.",
        severity: "warning",
      };
    case "MAX_USES":
      return {
        code,
        title: "This code has been fully redeemed",
        detail: "All available uses are taken.",
        severity: "warning",
      };
    case "ALREADY_USED":
      return {
        code,
        title: "You've already used this code",
        detail: "It's a single-use code tied to your email.",
        severity: "warning",
      };
    case "TICKET_TYPE_NOT_ALLOWED":
      return {
        code,
        title: "This code doesn't apply to your ticket",
        detail: "Try a different ticket type or check the offer details.",
        severity: "warning",
      };
    case "MIN_ORDER":
      return {
        code,
        title: "Order total too low for this code",
        detail: fallbackMessage || "Add more to your cart to unlock this discount.",
        severity: "warning",
      };
    case "DB_ERROR":
    case "BAD_REQUEST":
      return {
        code,
        title: "Couldn't validate that code right now",
        detail: "Please try again in a moment.",
        severity: "error",
      };
    case "NETWORK":
      return {
        code,
        title: "Connection issue",
        detail: "Check your internet and try again.",
        severity: "error",
      };
    default:
      return {
        code: "UNKNOWN",
        title: fallbackMessage || "Unable to apply promo code",
        severity: "error",
      };
  }
}

export function usePromoCode() {
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<PromoCodeResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<PromoError | null>(null);

  const validatePromo = useCallback(async (code: string, email: string, ticketType: string, orderTotal: number) => {
    if (!code.trim()) {
      setError(buildError("EMPTY"));
      return null;
    }

    setIsValidating(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("validate-promo-code", {
        body: {
          code: code.trim().toUpperCase(),
          email: email || null,
          ticket_type: ticketType || null,
          order_total: orderTotal,
          page: typeof window !== "undefined" ? window.location.pathname : null,
        },
      });

      if (invokeError || !data) {
        setError(buildError("NETWORK"));
        setAppliedPromo(null);
        return null;
      }

      if (!data.valid) {
        setError(buildError(data.error_code, data.message));
        setAppliedPromo(null);
        return null;
      }

      const result: PromoCodeResult = {
        id: data.promo.id,
        code: data.promo.code,
        description: data.promo.description,
        discount_type: data.promo.discount_type,
        discount_value: Number(data.promo.discount_value),
      };

      setAppliedPromo(result);
      setError(null);
      return result;
    } catch {
      setError(buildError("NETWORK"));
      return null;
    } finally {
      setIsValidating(false);
    }
  }, []);

  const calculateDiscount = useCallback((subtotalDollars: number): number => {
    if (!appliedPromo) return 0;
    if (appliedPromo.discount_type === "percentage") {
      return Math.round(subtotalDollars * (appliedPromo.discount_value / 100) * 100) / 100;
    }
    return Math.min(appliedPromo.discount_value, subtotalDollars);
  }, [appliedPromo]);

  const removePromo = useCallback(() => {
    setAppliedPromo(null);
    setPromoCode("");
    setError(null);
  }, []);

  return {
    promoCode,
    setPromoCode,
    appliedPromo,
    isValidating,
    /** Structured error object — `null` when no error */
    error,
    /** Convenience: short error message string for legacy callers */
    errorMessage: error ? error.title : null,
    validatePromo,
    calculateDiscount,
    removePromo,
  };
}
