import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentPlanConfig {
  is_enabled: boolean;
  min_cart_amount: number;
  pre_cutoff_payment_count: number;
  pre_cutoff_splits: number[];
  pre_cutoff_dates: string[];
  post_cutoff_payment_count: number;
  post_cutoff_splits: number[];
  post_cutoff_dates: string[];
  cutoff_date: string;
}

export interface PaymentPlanBreakdown {
  available: boolean;
  paymentCount: number;
  amounts: number[]; // cents
  dates: string[];
  firstPayment: number; // cents
  isBeforeCutoff: boolean;
}

/**
 * Hook to fetch payment plan config and calculate breakdown for a given cart total
 */
export function usePaymentPlan(cartTotalCents: number) {
  const [config, setConfig] = useState<PaymentPlanConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const { data, error } = await supabase
          .from("payment_plan_config")
          .select("*")
          .limit(1)
          .single();

        if (error) {
          console.error("[usePaymentPlan] Error fetching config:", error);
          return;
        }

        setConfig(data as unknown as PaymentPlanConfig);
      } catch (err) {
        console.error("[usePaymentPlan] Unexpected error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  const breakdown = useMemo<PaymentPlanBreakdown>(() => {
    const defaultBreakdown: PaymentPlanBreakdown = {
      available: false,
      paymentCount: 0,
      amounts: [],
      dates: [],
      firstPayment: 0,
      isBeforeCutoff: false,
    };

    if (!config || !config.is_enabled || cartTotalCents < config.min_cart_amount) {
      return defaultBreakdown;
    }

    const now = new Date();
    const cutoffDate = new Date(config.cutoff_date);
    const isBeforeCutoff = now < cutoffDate;

    const paymentCount = isBeforeCutoff ? config.pre_cutoff_payment_count : config.post_cutoff_payment_count;
    const splits = isBeforeCutoff ? config.pre_cutoff_splits : config.post_cutoff_splits;
    const dates = isBeforeCutoff ? config.pre_cutoff_dates : config.post_cutoff_dates;

    // Calculate amounts ensuring exact total
    const amounts: number[] = [];
    let remaining = cartTotalCents;
    for (let i = 0; i < paymentCount; i++) {
      if (i === paymentCount - 1) {
        amounts.push(remaining);
      } else {
        const amount = Math.round(cartTotalCents * splits[i]);
        amounts.push(amount);
        remaining -= amount;
      }
    }

    return {
      available: true,
      paymentCount,
      amounts,
      dates,
      firstPayment: amounts[0],
      isBeforeCutoff,
    };
  }, [config, cartTotalCents]);

  return { config, breakdown, loading };
}

/**
 * Format a payment schedule date for display
 */
export function formatPaymentDate(dateStr: string): string {
  if (dateStr === "immediate") return "Today";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

/**
 * Format cents to dollars display
 */
export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}
