import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  rate?: string;   // Display rate like "5%" or "$5"
}

/**
 * Hook to fetch and calculate checkout fees
 */
export function useCheckoutFees(input: FeeCalculationInput) {
  const [fees, setFees] = useState<CheckoutFee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFees() {
      try {
        const { data, error } = await supabase
          .from("checkout_fees")
          .select("fee_key, fee_label, fee_type, fee_value, applies_to")
          .eq("is_active", true)
          .order("display_order");

        if (error) {
          console.error("[useCheckoutFees] Error fetching fees:", error);
          return;
        }

        setFees((data as CheckoutFee[]) || []);
      } catch (err) {
        console.error("[useCheckoutFees] Unexpected error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchFees();
  }, []);

  const calculatedFees = useMemo<CalculatedFee[]>(() => {
    const orderTotal = input.ticketSubtotal + input.lodgingSubtotal + input.donationAmount;
    const result: CalculatedFee[] = [];

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

      // Skip if base amount is zero
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
        result.push({
          key: fee.fee_key,
          label: fee.fee_label,
          amount: feeAmount,
          rate: rateDisplay,
        });
      }
    }

    return result;
  }, [fees, input.ticketSubtotal, input.lodgingSubtotal, input.donationAmount]);

  const totalFees = useMemo(() => {
    return calculatedFees.reduce((sum, fee) => sum + fee.amount, 0);
  }, [calculatedFees]);

  return {
    fees: calculatedFees,
    totalFees,
    loading,
  };
}
