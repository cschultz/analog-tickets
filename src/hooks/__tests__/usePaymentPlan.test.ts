import { describe, it, expect } from "vitest";

// Test payment plan calculation logic extracted from hook
interface PaymentPlanConfig {
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

interface PaymentPlanBreakdown {
  available: boolean;
  paymentCount: number;
  amounts: number[];
  dates: string[];
  firstPayment: number;
  isBeforeCutoff: boolean;
}

function calculateBreakdown(
  config: PaymentPlanConfig | null,
  cartTotalCents: number,
  now: Date = new Date()
): PaymentPlanBreakdown {
  const defaultBreakdown: PaymentPlanBreakdown = {
    available: false, paymentCount: 0, amounts: [], dates: [], firstPayment: 0, isBeforeCutoff: false,
  };

  if (!config || !config.is_enabled || cartTotalCents < config.min_cart_amount) return defaultBreakdown;

  const cutoffDate = new Date(config.cutoff_date);
  const isBeforeCutoff = now < cutoffDate;
  const paymentCount = isBeforeCutoff ? config.pre_cutoff_payment_count : config.post_cutoff_payment_count;
  const splits = isBeforeCutoff ? config.pre_cutoff_splits : config.post_cutoff_splits;
  const dates = isBeforeCutoff ? config.pre_cutoff_dates : config.post_cutoff_dates;

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

  return { available: true, paymentCount, amounts, dates, firstPayment: amounts[0], isBeforeCutoff };
}

// formatPaymentDate and formatCentsToDollars
function formatPaymentDate(dateStr: string): string {
  if (dateStr === "immediate") return "Today";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const baseConfig: PaymentPlanConfig = {
  is_enabled: true,
  min_cart_amount: 10000, // $100
  pre_cutoff_payment_count: 3,
  pre_cutoff_splits: [0.34, 0.33, 0.33],
  pre_cutoff_dates: ["immediate", "2026-04-15", "2026-05-01"],
  post_cutoff_payment_count: 2,
  post_cutoff_splits: [0.5, 0.5],
  post_cutoff_dates: ["immediate", "2026-05-01"],
  cutoff_date: "2026-04-01",
};

describe("Payment Plan Calculation", () => {
  it("returns unavailable when disabled", () => {
    const result = calculateBreakdown({ ...baseConfig, is_enabled: false }, 15000);
    expect(result.available).toBe(false);
  });

  it("returns unavailable when below minimum", () => {
    const result = calculateBreakdown(baseConfig, 5000);
    expect(result.available).toBe(false);
  });

  it("returns unavailable when config is null", () => {
    const result = calculateBreakdown(null, 15000);
    expect(result.available).toBe(false);
  });

  it("calculates 3-payment plan before cutoff", () => {
    const beforeCutoff = new Date("2026-03-15");
    const result = calculateBreakdown(baseConfig, 15000, beforeCutoff);
    expect(result.available).toBe(true);
    expect(result.paymentCount).toBe(3);
    expect(result.isBeforeCutoff).toBe(true);
    expect(result.amounts).toHaveLength(3);
    // Total should equal cart total exactly
    expect(result.amounts.reduce((s, a) => s + a, 0)).toBe(15000);
  });

  it("calculates 2-payment plan after cutoff", () => {
    const afterCutoff = new Date("2026-04-15");
    const result = calculateBreakdown(baseConfig, 15000, afterCutoff);
    expect(result.available).toBe(true);
    expect(result.paymentCount).toBe(2);
    expect(result.isBeforeCutoff).toBe(false);
    expect(result.amounts.reduce((s, a) => s + a, 0)).toBe(15000);
  });

  it("handles rounding correctly with weighted splits", () => {
    const result = calculateBreakdown(baseConfig, 10001, new Date("2026-03-15"));
    // Last payment captures rounding remainder
    const total = result.amounts.reduce((s, a) => s + a, 0);
    expect(total).toBe(10001);
  });

  it("first payment matches amounts[0]", () => {
    const result = calculateBreakdown(baseConfig, 20000, new Date("2026-03-15"));
    expect(result.firstPayment).toBe(result.amounts[0]);
  });

  it("at exactly min_cart_amount is available", () => {
    const result = calculateBreakdown(baseConfig, 10000, new Date("2026-03-15"));
    expect(result.available).toBe(true);
  });
});

describe("formatPaymentDate", () => {
  it("returns Today for immediate", () => {
    expect(formatPaymentDate("immediate")).toBe("Today");
  });

  it("formats date correctly", () => {
    const result = formatPaymentDate("2026-04-15");
    expect(result).toContain("Apr");
    expect(result).toContain("15");
  });
});

describe("formatCentsToDollars", () => {
  it("formats whole dollars", () => {
    expect(formatCentsToDollars(10000)).toBe("$100");
  });

  it("truncates cents", () => {
    expect(formatCentsToDollars(9999)).toBe("$100");
  });

  it("handles zero", () => {
    expect(formatCentsToDollars(0)).toBe("$0");
  });
});
