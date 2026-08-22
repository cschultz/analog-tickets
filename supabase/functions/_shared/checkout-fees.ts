import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

export interface CheckoutFee {
  fee_key: string;
  fee_label: string;
  fee_type: "percentage" | "flat_per_order" | "flat_per_item";
  fee_value: number;
  applies_to: "total" | "tickets" | "lodging" | "donations";
}

export interface FeeCalculationInput {
  ticketSubtotal: number;   // in cents
  lodgingSubtotal: number;  // in cents
  donationAmount: number;   // in cents
}

export interface CalculatedFee {
  key: string;
  label: string;
  amount: number;  // in cents
}

/**
 * Fetch active checkout fees from the database
 */
export async function fetchCheckoutFees(
  supabase: SupabaseClient
): Promise<CheckoutFee[]> {
  const { data, error } = await supabase
    .from("checkout_fees")
    .select("fee_key, fee_label, fee_type, fee_value, applies_to")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("[checkout-fees] Error fetching fees:", error);
    return [];
  }

  return data || [];
}

/**
 * Calculate fee amounts based on subtotals
 */
export function calculateFees(
  fees: CheckoutFee[],
  input: FeeCalculationInput
): CalculatedFee[] {
  const orderTotal = input.ticketSubtotal + input.lodgingSubtotal + input.donationAmount;
  const calculatedFees: CalculatedFee[] = [];

  for (const fee of fees) {
    let baseAmount = 0;

    switch (fee.applies_to) {
      case "total":
        baseAmount = orderTotal;
        break;
      case "tickets":
        baseAmount = input.ticketSubtotal;
        break;
      case "lodging":
        baseAmount = input.lodgingSubtotal;
        break;
      case "donations":
        baseAmount = input.donationAmount;
        break;
    }

    // Skip if base amount is zero (no lodging = no occupancy tax)
    if (baseAmount === 0) continue;

    let feeAmount = 0;

    switch (fee.fee_type) {
      case "percentage":
        // fee_value is stored as decimal (0.05 = 5%)
        feeAmount = Math.round(baseAmount * fee.fee_value);
        break;
      case "flat_per_order":
        // fee_value is in cents
        feeAmount = fee.fee_value;
        break;
      case "flat_per_item":
        // This would need item counts - implement if needed
        feeAmount = fee.fee_value;
        break;
    }

    if (feeAmount > 0) {
      calculatedFees.push({
        key: fee.fee_key,
        label: fee.fee_label,
        amount: feeAmount,
      });
    }
  }

  return calculatedFees;
}

/**
 * Generate Stripe line items for calculated fees
 */
export function createFeeLineItems(
  calculatedFees: CalculatedFee[]
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return calculatedFees.map((fee) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: fee.label,
      },
      unit_amount: fee.amount,
    },
    quantity: 1,
  }));
}

/**
 * Calculate total fees amount
 */
export function getTotalFeesAmount(calculatedFees: CalculatedFee[]): number {
  return calculatedFees.reduce((sum, fee) => sum + fee.amount, 0);
}
