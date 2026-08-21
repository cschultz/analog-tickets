import { describe, expect, it } from "vitest";
import { categorizeStripeFailure } from "@/lib/stripeFailureCategory";

describe("categorizeStripeFailure", () => {
  it("maps canonical Stripe decline codes", () => {
    expect(categorizeStripeFailure({ error_code: "card_declined" })).toBe("card_declined");
    expect(categorizeStripeFailure({ error_code: "insufficient_funds" })).toBe("insufficient_funds");
    expect(categorizeStripeFailure({ error_code: "incorrect_cvc" })).toBe("incorrect_cvc");
    expect(categorizeStripeFailure({ error_code: "expired_card" })).toBe("expired_card");
  });

  it("maps cancel and network cases from logged fields", () => {
    expect(
      categorizeStripeFailure({
        error_message: "Customer returned from Stripe without completing payment",
        request_payload: { canceled: true },
      }),
    ).toBe("canceled");

    expect(
      categorizeStripeFailure({
        error_message: "Failed to fetch checkout session",
        payment_intent_last_error: { type: "api_connection_error" },
      }),
    ).toBe("network_error");
  });

  it("falls back to unknown when no Stripe failure signal matches", () => {
    expect(categorizeStripeFailure({ error_message: "Something unexpected happened" })).toBe("unknown");
  });
});