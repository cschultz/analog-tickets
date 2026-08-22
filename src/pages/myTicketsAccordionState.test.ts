import { describe, expect, it } from "vitest";

import { createEligibilitySignature, resolveAccordionState } from "./myTicketsAccordionState";

describe("resolveAccordionState", () => {
  it("returns null while eligibility is still loading", () => {
    expect(
      resolveAccordionState({
        loading: true,
        cartCount: 1,
        lodgingIds: [],
        addonIds: [],
        savedPreference: null,
      })
    ).toBeNull();
  });

  it("keeps the accordion expanded when cart updates arrive before eligibility finishes loading", () => {
    const eligibilitySignature = createEligibilitySignature(["lodge-1"], ["addon-1"]);

    expect(
      resolveAccordionState({
        loading: false,
        cartCount: 1,
        lodgingIds: ["lodge-1"],
        addonIds: ["addon-1"],
        savedPreference: {
          eligibilitySignature,
          expanded: false,
        },
      })
    ).toEqual({
      eligibilitySignature,
      expanded: true,
      hasEligibleOptions: true,
      shouldPersist: true,
      showEligibilityAutoExpandNote: false,
    });
  });

  it("restores the saved preference when eligibility is unchanged and cart is empty", () => {
    const eligibilitySignature = createEligibilitySignature(["lodge-1"], ["addon-1"]);

    expect(
      resolveAccordionState({
        loading: false,
        cartCount: 0,
        lodgingIds: ["lodge-1"],
        addonIds: ["addon-1"],
        savedPreference: {
          eligibilitySignature,
          expanded: false,
        },
      })
    ).toEqual({
      eligibilitySignature,
      expanded: false,
      hasEligibleOptions: true,
      shouldPersist: false,
      showEligibilityAutoExpandNote: false,
    });
  });

  it("collapses by default when eligible option set changes (don't auto-expand upsell)", () => {
    const previousSignature = createEligibilitySignature(["lodge-1"], []);
    const nextSignature = createEligibilitySignature(["lodge-1"], ["addon-2"]);

    expect(
      resolveAccordionState({
        loading: false,
        cartCount: 0,
        lodgingIds: ["lodge-1"],
        addonIds: ["addon-2"],
        savedPreference: {
          eligibilitySignature: previousSignature,
          expanded: false,
        },
      })
    ).toEqual({
      eligibilitySignature: nextSignature,
      expanded: false,
      hasEligibleOptions: true,
      shouldPersist: true,
      showEligibilityAutoExpandNote: false,
    });
  });
});