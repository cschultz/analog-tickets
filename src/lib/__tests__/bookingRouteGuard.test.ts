import { describe, expect, it } from "vitest";

import {
  resolveBookingRoute,
  isQualifyingLodgingTicketType,
} from "@/lib/bookingRouteGuard";

describe("bookingRouteGuard", () => {
  it("routes qualifying checkout lodging requests into checkout", () => {
    expect(
      resolveBookingRoute("lodging", {
        ticketSelectionRaw: JSON.stringify({
          ticketType: "tier_1_vip_3day",
          selectedTicket: "tier_1_vip_3day",
          ticketName: "VIP 3-Day",
          ticketPrice: 450,
          quantity: 2,
          name: "Test User",
          email: "test@example.com",
        }),
      }),
    ).toBe("/checkout/lodging");
  });

  it("sends non-qualifying lodging requests to My Tickets", () => {
    expect(
      resolveBookingRoute("lodging", {
        ticketSelectionRaw: JSON.stringify({
          ticketType: "tier_1_ga_saturday",
          selectedTicket: "tier_1_ga_saturday",
          ticketName: "GA Saturday",
          ticketPrice: 129,
          quantity: 1,
          name: "Test User",
          email: "test@example.com",
        }),
        lodgingSelectionRaw: JSON.stringify({ zoneKey: "grove_tents" }),
      }),
    ).toBe("/my-tickets");
  });

  it("keeps add-ons in checkout when there is an active checkout ticket", () => {
    expect(
      resolveBookingRoute("addons", {
        ticketSelectionRaw: JSON.stringify({
          ticketType: "tier_1_ga_2day",
          selectedTicket: "tier_1_ga_2day",
          ticketName: "GA 2-Day",
          ticketPrice: 239,
          quantity: 2,
          name: "Test User",
          email: "test@example.com",
        }),
        addonSelectionRaw: JSON.stringify([{ inventoryId: "addon-1", quantity: 2 }]),
      }),
    ).toBe("/checkout/addons");
  });

  it("sends stale cart fragments without a ticket selection to My Tickets", () => {
    expect(
      resolveBookingRoute("addons", {
        lodgingSelectionRaw: JSON.stringify({ zoneKey: "front_row_tents" }),
        addonSelectionRaw: JSON.stringify([{ inventoryId: "addon-1", quantity: 1 }]),
      }),
    ).toBe("/my-tickets");
  });

  it("matches the lodging qualification rule used by the flow", () => {
    expect(isQualifyingLodgingTicketType("tier_1_vip_3day")).toBe(true);
    expect(isQualifyingLodgingTicketType("tier_1_krewe_3day")).toBe(true);
    expect(isQualifyingLodgingTicketType("tier_1_ga_saturday")).toBe(false);
  });
});