import { describe, it, expect } from "vitest";

// Test the fee calculation logic directly (extracted from hook)
interface CheckoutFee {
  fee_key: string;
  fee_label: string;
  fee_type: "percentage" | "flat_per_order" | "flat_per_item";
  fee_value: number;
  applies_to: "total" | "tickets" | "lodging" | "donations";
}

interface CalculatedFee {
  key: string;
  label: string;
  amount: number;
  rate?: string;
}

function calculateFees(
  fees: CheckoutFee[],
  ticketSubtotal: number,
  lodgingSubtotal: number,
  donationAmount: number
): CalculatedFee[] {
  const orderTotal = ticketSubtotal + lodgingSubtotal + donationAmount;
  const result: CalculatedFee[] = [];

  for (const fee of fees) {
    let baseAmount = 0;
    switch (fee.applies_to) {
      case "total": baseAmount = orderTotal; break;
      case "tickets": baseAmount = ticketSubtotal; break;
      case "lodging": baseAmount = lodgingSubtotal; break;
      case "donations": baseAmount = donationAmount; break;
    }
    if (baseAmount === 0) continue;

    let feeAmount = 0;
    let rateDisplay = "";
    switch (fee.fee_type) {
      case "percentage":
        feeAmount = Math.round(baseAmount * fee.fee_value);
        rateDisplay = `${(fee.fee_value * 100).toFixed(0)}%`;
        break;
      case "flat_per_order":
        feeAmount = fee.fee_value;
        rateDisplay = `$${(fee.fee_value / 100).toFixed(2)}`;
        break;
      case "flat_per_item":
        feeAmount = fee.fee_value;
        rateDisplay = `$${(fee.fee_value / 100).toFixed(2)}`;
        break;
    }
    if (feeAmount > 0) {
      result.push({ key: fee.fee_key, label: fee.fee_label, amount: feeAmount, rate: rateDisplay });
    }
  }
  return result;
}

describe("Fee Calculation Logic", () => {
  const serviceFee: CheckoutFee = {
    fee_key: "service_fee",
    fee_label: "Service Fee",
    fee_type: "percentage",
    fee_value: 0.05,
    applies_to: "total",
  };

  const flatFee: CheckoutFee = {
    fee_key: "processing_fee",
    fee_label: "Processing Fee",
    fee_type: "flat_per_order",
    fee_value: 500,
    applies_to: "total",
  };

  it("calculates percentage fee on ticket subtotal", () => {
    const ticketFee: CheckoutFee = { ...serviceFee, applies_to: "tickets" };
    const result = calculateFees([ticketFee], 10000, 0, 0);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(500); // 5% of $100
    expect(result[0].rate).toBe("5%");
  });

  it("calculates percentage fee on total including lodging", () => {
    const result = calculateFees([serviceFee], 10000, 5000, 0);
    expect(result[0].amount).toBe(750); // 5% of $150
  });

  it("calculates flat fee correctly", () => {
    const result = calculateFees([flatFee], 10000, 0, 0);
    expect(result[0].amount).toBe(500);
    expect(result[0].rate).toBe("$5.00");
  });

  it("skips fees when base amount is zero", () => {
    const lodgingFee: CheckoutFee = { ...serviceFee, applies_to: "lodging" };
    const result = calculateFees([lodgingFee], 10000, 0, 0);
    expect(result).toHaveLength(0);
  });

  it("handles multiple fees correctly", () => {
    const result = calculateFees([serviceFee, flatFee], 10000, 0, 0);
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, f) => sum + f.amount, 0);
    expect(total).toBe(1000); // 500 (5%) + 500 (flat)
  });

  it("handles zero cart gracefully", () => {
    const result = calculateFees([serviceFee, flatFee], 0, 0, 0);
    expect(result).toHaveLength(0);
  });

  it("rounds percentage fees to nearest cent", () => {
    const result = calculateFees([serviceFee], 9999, 0, 0);
    expect(result[0].amount).toBe(500); // Math.round(9999 * 0.05) = 500
  });
});
