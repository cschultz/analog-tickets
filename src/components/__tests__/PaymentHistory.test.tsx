import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentHistory } from "../PaymentHistory";

function createQueryResult(result: unknown) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: vi.fn((resolve: (value: unknown) => void) => Promise.resolve(resolve(result))),
  };
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "upgrade_offers") {
        return createQueryResult({ data: [], error: null });
      }
      if (table === "admin_audit_logs") {
        return createQueryResult({
          data: {
            old_value: { ticket_type: "early_bird_ga_2day", total_amount: 39800 },
            new_value: { ticket_type: "tier_1_vip_3day", total_amount: 89800 },
            created_at: "2026-05-06T21:00:57.510Z",
          },
          error: null,
        });
      }
      return createQueryResult({ data: null, error: null });
    }),
  },
}));

describe("PaymentHistory", () => {
  it("shows the pre-upgrade ticket type as the original purchase for admin comp upgrades", async () => {
    render(
      <PaymentHistory
        registrationId="67050e83-33bb-4293-9d1d-9c5f9c37d6f6"
        originalAmount={89800}
        originalTicketType="tier_1_vip_3day"
        purchaseDate="2026-01-05T00:00:00.000Z"
        compUpgradeAmount={50000}
      />,
    );

    await waitFor(() => expect(screen.getByText("Original Purchase")).toBeInTheDocument());

    expect(screen.getAllByText(/Early Bird Ga 2day/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$398.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Early Bird Ga 2day → VIP — 3 Day/i)).toBeInTheDocument();
  });
});