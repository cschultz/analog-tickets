import { describe, it, expect } from "vitest";
import {
  type AddonItem,
  type AddonEligibilityContext,
  DINNER_ADDON_TYPE,
  FRIDAY_ELIGIBLE_TICKET_TYPES,
  getMaxForAddon,
  ticketTypeIncludesFriday,
} from "@/lib/addons";

/**
 * Reproduces the logic that lives in AddOnsPurchaseSection.tsx so we can unit-
 * test the contract: "Friday-night dinner add-ons may be purchased up to one
 * per Friday-eligible ticket on the order, summed across registrations."
 *
 * If you change how the page derives `fridayTicketCount` / `quantity` from the
 * registrations array, mirror it here so this test keeps reflecting reality.
 */
function buildContextFromRegistrations(
  registrations: Array<{ event_id?: string; ticket_type?: string | null; quantity?: number }>,
  primaryEventId: string,
): AddonEligibilityContext {
  const sameEvent = registrations.filter((r) => r.event_id === primaryEventId);
  const totalEventTicketQuantity = sameEvent.reduce(
    (sum, r) => sum + (r.quantity || 1),
    0,
  );
  const fridayTicketCount = sameEvent.reduce(
    (sum, r) => sum + (ticketTypeIncludesFriday(r.ticket_type) ? r.quantity || 1 : 0),
    0,
  );
  const primary = sameEvent[0];
  return {
    ticketType: primary?.ticket_type || "",
    quantity: Math.max(totalEventTicketQuantity, primary?.quantity || 1),
    childCount: 0,
    youthCount: 0,
    fridayTicketCount,
  };
}

const dinnerAddon: AddonItem = {
  id: "addon-japanese-picnic",
  addon_type: DINNER_ADDON_TYPE,
  display_name: "Field Day CA Japanese Picnic Dinner",
  description: null,
  price: 8500,
  total_quantity: 100,
  sold_quantity: 0,
  required_ticket_types: null,
};

const wineCampAddon: AddonItem = {
  ...dinnerAddon,
  id: "addon-wine-camp",
  addon_type: "wine_camp",
  display_name: "Wine Camp",
};

const EVT = "evt-may-2026";

describe("dinner add-on cap — sums Friday-eligible tickets across registrations", () => {
  it("regression: 1 party_only + 1 GA-Friday → cap is 2 (was capped at 1 before fix)", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "party_only", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(2);
  });

  it("3 separate Friday-only registrations of qty=1 each → cap is 3", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(3);
  });

  it("a single registration with quantity=4 still yields cap 4", () => {
    const ctx = buildContextFromRegistrations(
      [{ event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 4 }],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(4);
  });

  it("multi-day tickets count toward Friday cap (2-day, 3-day VIP, Crew, Patrons)", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_2day", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_vip_3day", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_krewe_3day", quantity: 1 },
        { event_id: EVT, ticket_type: "patrons_premier", quantity: 1 },
        { event_id: EVT, ticket_type: "patrons_ultimate", quantity: 1 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(5);
  });

  it("Saturday-only tickets do NOT count toward the Friday dinner cap", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_saturday", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_ga_saturday", quantity: 1 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(0);
  });

  it("mixed: 1 Saturday + 1 Friday + 1 VIP-3day → Friday cap is 2", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_saturday", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_vip_3day", quantity: 1 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(2);
  });

  it("ignores registrations from other events", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
        { event_id: "evt-other-2025", ticket_type: "tier_1_ga_friday", quantity: 5 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(1);
  });

  it("aliased ticket type names (early_bird_ga_2day, vip_3_day, etc.) still count", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "early_bird_ga_2day", quantity: 1 },
        { event_id: EVT, ticket_type: "early_bird_ga_friday", quantity: 1 },
        { event_id: EVT, ticket_type: "vip_3_day", quantity: 1 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(3);
  });

  it("mixed quantity rows summed correctly: qty=2 Friday + qty=3 2-day → cap 5", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 2 },
        { event_id: EVT, ticket_type: "tier_1_ga_2day", quantity: 3 },
      ],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(5);
  });

  it("non-dinner addons (e.g. wine_camp) ignore fridayTicketCount and use total quantity", () => {
    const ctx = buildContextFromRegistrations(
      [
        { event_id: EVT, ticket_type: "tier_1_ga_friday", quantity: 1 },
        { event_id: EVT, ticket_type: "tier_1_ga_saturday", quantity: 1 },
      ],
      EVT,
    );
    // Friday cap = 1, but wine_camp uses total quantity = 2
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(1);
    expect(getMaxForAddon(wineCampAddon, ctx)).toBe(2);
  });

  it("zero registrations of the right event → cap 0 (cannot order dinner)", () => {
    const ctx = buildContextFromRegistrations(
      [{ event_id: "evt-other", ticket_type: "tier_1_ga_friday", quantity: 2 }],
      EVT,
    );
    expect(getMaxForAddon(dinnerAddon, ctx)).toBe(0);
  });
});

describe("ticketTypeIncludesFriday allowlist sanity", () => {
  it.each(FRIDAY_ELIGIBLE_TICKET_TYPES)("includes %s", (tt) => {
    expect(ticketTypeIncludesFriday(tt)).toBe(true);
  });

  it("rejects Saturday-only and unknown types", () => {
    expect(ticketTypeIncludesFriday("tier_1_ga_saturday")).toBe(false);
    expect(ticketTypeIncludesFriday("saturday_ga")).toBe(false);
    expect(ticketTypeIncludesFriday("totally_made_up")).toBe(false);
    expect(ticketTypeIncludesFriday(null)).toBe(false);
    expect(ticketTypeIncludesFriday(undefined)).toBe(false);
    expect(ticketTypeIncludesFriday("")).toBe(false);
  });
});
