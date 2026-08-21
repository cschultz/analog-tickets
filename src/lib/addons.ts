import { z } from "zod";

export interface AddonItem {
  id: string;
  addon_type: string;
  display_name: string;
  description: string | null;
  price: number;
  total_quantity: number;
  sold_quantity: number;
  required_ticket_types: string[] | null;
  sales_end_at?: string | null;
}

export interface SelectedAddon {
  inventoryId: string;
  addonType: string;
  displayName: string;
  unitPrice: number;
  quantity: number;
  hasDietaryRestrictions?: boolean;
  dietaryRestrictions?: string;
}

export interface AddonEligibilityContext {
  ticketType: string;
  quantity: number;
  childCount?: number;
  youthCount?: number;
  // Total count of Friday-eligible tickets across the account/order. Used to
  // cap Friday-night dinner add-ons: 1 dinner per Friday-attending ticket.
  // Falls back to `quantity` when not provided.
  fridayTicketCount?: number;
}

export interface AddonAvailabilityState {
  isEligible: boolean;
  isIncluded: boolean;
  unavailableReason: string | null;
}

export const DINNER_ADDON_TYPE = "friday_dinner";

export const MY_TICKETS_FEATURED_ADDON_TYPES = ["wine_camp", "kids_camp"] as const;

export const ADDON_TICKET_TYPE_ALIASES: Record<string, string> = {
  "2day_ga": "tier_1_ga_2day",
  "friday_ga": "tier_1_ga_friday",
  "saturday_ga": "tier_1_ga_saturday",
  ga_friday: "tier_1_ga_friday",
  ga_saturday: "tier_1_ga_saturday",
  ga_2day: "tier_1_ga_2day",
  ga_2_day: "tier_1_ga_2day",
  early_bird_ga_friday: "tier_1_ga_friday",
  early_bird_ga_saturday: "tier_1_ga_saturday",
  early_bird_ga_2day: "tier_1_ga_2day",
  vip_3day: "tier_1_vip_3day",
  vip_3_day: "tier_1_vip_3day",
  early_bird_vip_3day: "tier_1_vip_3day",
  early_bird_vip_3_day: "tier_1_vip_3day",
  krewe_3day: "tier_1_krewe_3day",
  krewe_3_day: "tier_1_krewe_3day",
  early_bird_krewe_3day: "tier_1_krewe_3day",
  early_bird_krewe_3_day: "tier_1_krewe_3day",
  // Legacy ticket_type values still in production data
  krewe: "tier_1_krewe_3day",
  vip_friday: "tier_1_ga_friday",
  artist_guest: "tier_1_vip_3day",
};

export const TICKET_INCLUDES: Record<string, string[]> = {
  tier_1_ga_2day: ["Friday & Saturday entry", "Wine Camp (Saturday)", "Live music both days"],
  tier_1_krewe_3day: ["3-day entry (Fri–Sun)", "Wine Camp (Saturday)", "Crew perks"],
  tier_1_vip_3day: ["3-day entry (Fri–Sun)", "Wine Camp (Saturday)", "VIP lounge & viewing", "VIP welcome"],
  tier_1_ga_friday: ["Friday entry", "Live music"],
  tier_1_ga_saturday: ["Saturday entry", "Live music"],
  patrons_premier: ["Full weekend access", "Wine Camp (Saturday)", "Premier patron benefits"],
  patrons_ultimate: ["Full weekend access", "Wine Camp (Saturday)", "All-access patron privileges"],
};

export const ELIGIBLE_ADDON_TICKET_TYPES = [
  "tier_1_ga_friday",
  "tier_1_krewe_3day",
  "tier_1_vip_3day",
  "tier_1_ga_2day",
  "tier_1_ga_saturday",
];

export const WINE_CAMP_INCLUDED_TICKETS = [
  "tier_1_krewe_3day",
  "tier_1_vip_3day",
  "tier_1_ga_2day",
  "patrons_premier",
  "patrons_ultimate",
];

// Ticket types whose access includes Friday. Anything multi-day (2-day/3-day,
// patrons full-weekend) implicitly includes Friday. Saturday-only tickets do
// NOT. Used to compute how many Friday-night dinner add-ons an account may
// purchase: 1 dinner per Friday-eligible ticket on the order.
export const FRIDAY_ELIGIBLE_TICKET_TYPES = [
  "tier_1_ga_friday",
  "tier_1_ga_2day",
  "tier_1_krewe_3day",
  "tier_1_vip_3day",
  "patrons_premier",
  "patrons_ultimate",
  "party_only",
];

export function ticketTypeIncludesFriday(ticketType: string | null | undefined) {
  if (!ticketType) return false;
  const resolved = ADDON_TICKET_TYPE_ALIASES[ticketType] || ticketType;
  return FRIDAY_ELIGIBLE_TICKET_TYPES.includes(resolved);
}

export function resolveAddonTicketType(ticketType: string | null | undefined) {
  if (!ticketType) return null;
  return ADDON_TICKET_TYPE_ALIASES[ticketType] || ticketType;
}

export function getTicketIncludes(ticketType: string | null | undefined) {
  const resolvedTicketType = resolveAddonTicketType(ticketType);
  return resolvedTicketType ? TICKET_INCLUDES[resolvedTicketType] || [] : [];
}

export const dietaryRestrictionsSchema = z
  .string()
  .trim()
  .min(1, "Please share your dietary restrictions")
  .max(1000, "Dietary restrictions must be 1000 characters or fewer");

export function validateSelectedAddonDietary(addon: SelectedAddon) {
  if (addon.addonType === DINNER_ADDON_TYPE && typeof addon.hasDietaryRestrictions !== "boolean") {
    throw new Error("Please tell us whether the Japanese Picnic has any dietary restrictions before continuing to cart");
  }

  const trimmedRestrictions = (addon.dietaryRestrictions ?? "").trim();

  // If the user opted into the "Yes" path but left the notes empty, treat it
  // as "no restrictions" rather than blocking checkout.
  if (!addon.hasDietaryRestrictions || trimmedRestrictions.length === 0) {
    return {
      ...addon,
      hasDietaryRestrictions: false,
      dietaryRestrictions: "",
    };
  }

  const parsedRestrictions = dietaryRestrictionsSchema.parse(trimmedRestrictions);
  return {
    ...addon,
    hasDietaryRestrictions: true,
    dietaryRestrictions: parsedRestrictions,
  };
}

export function isAddonsEligibleTicketType(ticketType: string | null | undefined) {
  const resolvedTicketType = resolveAddonTicketType(ticketType);
  return !!resolvedTicketType && ELIGIBLE_ADDON_TICKET_TYPES.includes(resolvedTicketType);
}

export function isWineCampIncludedTicketType(ticketType: string | null | undefined) {
  const resolvedTicketType = resolveAddonTicketType(ticketType);
  return !!resolvedTicketType && WINE_CAMP_INCLUDED_TICKETS.includes(resolvedTicketType);
}

export function isAddonIncludedForTicket(addonType: string, ticketType: string | null | undefined) {
  return addonType === "wine_camp" && isWineCampIncludedTicketType(ticketType);
}

export function getVisibleAddonsForTicket(addons: AddonItem[], ticketType: string | null | undefined) {
  const resolvedTicketType = resolveAddonTicketType(ticketType);
  if (!resolvedTicketType) return [];

  return addons.filter((addon) => {
    if (!addon.required_ticket_types || addon.required_ticket_types.length === 0) return true;
    const resolvedRequiredTypes = addon.required_ticket_types.map((requiredTicketType) => resolveAddonTicketType(requiredTicketType) || requiredTicketType);
    if (resolvedRequiredTypes.includes(resolvedTicketType)) return true;
    return isAddonIncludedForTicket(addon.addon_type, ticketType);
  });
}

export function isAddonSalesClosed(addon: AddonItem): boolean {
  if (!addon.sales_end_at) return false;
  const cutoff = new Date(addon.sales_end_at).getTime();
  if (Number.isNaN(cutoff)) return false;
  return Date.now() >= cutoff;
}

export function getAddonAvailability(addon: AddonItem, context: AddonEligibilityContext): AddonAvailabilityState {
  const resolvedTicketType = resolveAddonTicketType(context.ticketType);
  const isIncluded = isAddonIncludedForTicket(addon.addon_type, context.ticketType);

  if (isAddonSalesClosed(addon)) {
    return {
      isEligible: false,
      isIncluded,
      unavailableReason: "Sales for this add-on have closed.",
    };
  }

  if (!resolvedTicketType) {
    return {
      isEligible: false,
      isIncluded,
      unavailableReason: "This add-on isn’t available until we can verify your ticket.",
    };
  }

  const resolvedRequiredTypes = (addon.required_ticket_types || []).map((requiredTicketType) => resolveAddonTicketType(requiredTicketType) || requiredTicketType);
  const matchesTicketType = resolvedRequiredTypes.length === 0 || resolvedRequiredTypes.includes(resolvedTicketType) || isIncluded;

  if (!matchesTicketType) {
    if (addon.addon_type === "wine_camp") {
      return {
        isEligible: false,
        isIncluded,
        unavailableReason: "Wine Camp is available with 2-Day GA and VIP weekend tickets.",
      };
    }

    if (addon.addon_type === "kids_camp") {
      return {
        isEligible: false,
        isIncluded,
        unavailableReason: "Kids Camp is only offered with qualifying family ticket types.",
      };
    }

    return {
      isEligible: false,
      isIncluded,
      unavailableReason: "This add-on isn’t available for your current ticket.",
    };
  }

  if (addon.addon_type === "kids_camp" && getMaxForAddon(addon, context) <= 0) {
    return {
      isEligible: false,
      isIncluded,
      unavailableReason: "Kids Camp can be added once your booking includes at least one child or youth attendee.",
    };
  }

  if (addon.addon_type === DINNER_ADDON_TYPE && (context.fridayTicketCount ?? 0) <= 0) {
    return {
      isEligible: false,
      isIncluded,
      unavailableReason:
        "The Friday-night dinner is only available to Friday attendees. Add a Friday, 2-day, or 3-day ticket and the dinner will unlock — one seat per Friday-eligible ticket on your account.",
    };
  }

  return {
    isEligible: true,
    isIncluded,
    unavailableReason: null,
  };
}

export function getDisplayAddonsForTicket(addons: AddonItem[], context: AddonEligibilityContext) {
  const visibleAddons = getVisibleAddonsForTicket(addons, context.ticketType);
  const featuredAddons = addons.filter((addon) => MY_TICKETS_FEATURED_ADDON_TYPES.includes(addon.addon_type as (typeof MY_TICKETS_FEATURED_ADDON_TYPES)[number]));

  const addonsById = new Map<string, AddonItem>();
  [...visibleAddons, ...featuredAddons].forEach((addon) => {
    addonsById.set(addon.id, addon);
  });

  return Array.from(addonsById.values());
}

export function getMaxForAddon(addon: AddonItem, context: AddonEligibilityContext) {
  const kidsCount = (context.childCount || 0) + (context.youthCount || 0);
  if (addon.addon_type === "kids_camp") return kidsCount > 0 ? kidsCount : context.quantity;
  // Friday-night dinner: 1 dinner seat per Friday-eligible ticket on the order.
  if (addon.addon_type === DINNER_ADDON_TYPE) {
    return Math.max(0, context.fridayTicketCount ?? context.quantity);
  }
  return context.quantity;
}

export function normalizeSelectedAddonsForCheckout(selectedAddons: SelectedAddon[]) {
  return selectedAddons.map(validateSelectedAddonDietary);
}