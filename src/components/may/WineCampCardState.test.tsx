import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { render, screen } from "@/test/test-utils";
import { WineCampCardState, getWineCampCardState } from "./WineCampCardState";

describe("getWineCampCardState", () => {
  it("treats Wine Camp as included when another qualifying ticket in the booking covers it", () => {
    const state = getWineCampCardState({
      userTicketTypes: ["tier_1_ga_friday", "tier_1_vip_3day"],
      primaryTicketType: "tier_1_ga_friday",
      availability: {
        isEligible: false,
        isIncluded: false,
        unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
      },
      soldOut: false,
      upgradeAvailable: true,
    });

    expect(state.isIncluded).toBe(true);
    expect(state.isIncludedInWallet).toBe(true);
    expect(state.showUpgrade).toBe(false);
  });

  it("marks Wine Camp unavailable for a Friday-only ticket with no qualifying ticket in the wallet", () => {
    const state = getWineCampCardState({
      userTicketTypes: ["tier_1_ga_friday"],
      primaryTicketType: "tier_1_ga_friday",
      availability: {
        isEligible: false,
        isIncluded: false,
        unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
      },
      soldOut: false,
      upgradeAvailable: false,
    });

    expect(state.isUnavailable).toBe(true);
    expect(state.showFridayExplanation).toBe(true);
    expect(state.showUpgrade).toBe(false);
  });

  it("shows upgrade only when the booking does not already include Wine Camp and a real upgrade path exists", () => {
    const state = getWineCampCardState({
      userTicketTypes: ["tier_1_ga_saturday"],
      primaryTicketType: "tier_1_ga_saturday",
      availability: {
        isEligible: false,
        isIncluded: false,
        unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
      },
      soldOut: false,
      upgradeAvailable: true,
    });

    expect(state.isUnavailable).toBe(true);
    expect(state.showUpgrade).toBe(true);
  });
});

describe("WineCampCardState", () => {
  it("renders a view details link for included state", () => {
    render(
      <WineCampCardState
        userTicketTypes={["tier_1_ga_2day"]}
        primaryTicketType="tier_1_ga_2day"
        availability={{ isEligible: true, isIncluded: true, unavailableReason: null }}
        soldOut={false}
        upgradeAvailable={false}
      />
    );

    expect(screen.getByText("Included with your current ticket.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view details/i })).toHaveAttribute("href", "/winecamp");
  });

  it("renders unavailable explanations and no upgrade CTA when another booking ticket already includes Wine Camp", () => {
    render(
      <WineCampCardState
        userTicketTypes={["tier_1_ga_friday", "tier_1_vip_3day"]}
        primaryTicketType="tier_1_ga_friday"
        availability={{
          isEligible: false,
          isIncluded: false,
          unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
        }}
        soldOut={false}
        upgradeAvailable={true}
      />
    );

    expect(screen.getByText(/already included with a qualifying weekend ticket in this wallet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it("renders the exact ticket mismatch reason plus helpful links when unavailable", () => {
    render(
      <WineCampCardState
        userTicketTypes={["tier_1_ga_friday"]}
        primaryTicketType="tier_1_ga_friday"
        availability={{
          isEligible: false,
          isIncluded: false,
          unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
        }}
        soldOut={false}
        upgradeAvailable={false}
      />
    );

    expect(screen.getByText(/runs saturday only, and your current ticket is friday-only/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /venue map/i })).toHaveAttribute("href", "/almost-here#venue-map");
    expect(screen.getByRole("link", { name: /^faq/i })).toHaveAttribute("href", "/faq");
  });

  it("renders upgrade CTA only when eligible", async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();

    render(
      <WineCampCardState
        userTicketTypes={["tier_1_ga_saturday"]}
        primaryTicketType="tier_1_ga_saturday"
        availability={{
          isEligible: false,
          isIncluded: false,
          unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
        }}
        soldOut={false}
        upgradeAvailable={true}
        onUpgrade={onUpgrade}
      />
    );

    const upgradeButton = screen.getByRole("button", { name: /upgrade/i });
    expect(upgradeButton).toBeInTheDocument();

    await user.click(upgradeButton);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});