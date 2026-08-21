import { isQualifyingLodgingTicketType } from "@/lib/bookingRouteGuard";

export interface AccommodationZone {
  id: string;
  zone_key: string;
  zone_name: string;
  description: string;
  sound_level: string;
  sleeps_min: number;
  sleeps_max: number;
  inventory_available: number;
  inventory_total: number;
  night_price: number;
  is_publicly_available: boolean;
}

export interface AccommodationUnit {
  id: string;
  unit_name: string;
  product_type: "tent" | "cabin";
  zone_key: string;
  bed_configuration: string;
  sleeps_max: number;
  has_loft: boolean;
  night_price: number;
}

export interface LodgingPreferences {
  travelingWithKids: boolean;
  sensitiveToSound: boolean;
  bookingWithFriends: string;
}

export const DEFAULT_LODGING_PREFERENCES: LodgingPreferences = {
  travelingWithKids: false,
  sensitiveToSound: false,
  bookingWithFriends: "",
};

export const ACCOMMODATION_ZONE_SELECT = "id, zone_key, zone_name, description, sound_level, sleeps_min, sleeps_max, inventory_available, inventory_total, night_price, is_publicly_available";

export const ACCOMMODATION_FAMILY_UNIT_SELECT = "id, unit_name, product_type, zone_key, bed_configuration, sleeps_max, has_loft, night_price";

export const zoneHelperText: Record<string, { tagline: string; bestFor: string; siteNumbers?: string }> = {
  front_row_tents: {
    tagline: "Front-row access to the action",
    bestFor: "Guests who want premium positioning with views of the festival grounds.",
    siteNumbers: "Sites 1–4, 31–37",
  },
  front_row_cabins: {
    tagline: "Solid-wall comfort, front-row positioning",
    bestFor: "Guests looking for added comfort with prime festival access.",
    siteNumbers: "Sites 5–10, 30",
  },
  grove_tents: {
    tagline: "Cozy retreat for couples",
    bestFor: "Couples who love a cozy queen-bed home base nestled among the trees.",
    siteNumbers: "Sites 11–29, 39",
  },
  grove_tents_2q: {
    tagline: "Room to spread out",
    bestFor: "Friends or small groups who want two queen beds and more space.",
    siteNumbers: "Sites 40–47, 49–55",
  },
};

export function getLodgingEligibility(ticketType: string | null | undefined, quantity: number | null | undefined) {
  const normalizedQuantity = quantity ?? 0;
  const hasQualifyingTickets = !!ticketType && isQualifyingLodgingTicketType(ticketType);
  return {
    hasQualifyingTickets,
    canBookLodging: hasQualifyingTickets && normalizedQuantity >= 1,
    maxLodgingQty: normalizedQuantity,
  };
}

export function getLodgingSelectionState({
  zones,
  familyUnits,
  selectedZone,
  selectedFamilyUnit,
  lodgingQty,
}: {
  zones: AccommodationZone[];
  familyUnits: AccommodationUnit[];
  selectedZone: string | null;
  selectedFamilyUnit: string | null;
  lodgingQty: number;
}) {
  const selectedZoneData = zones.find((zone) => zone.zone_key === selectedZone) ?? null;
  const selectedFamilyUnitData = familyUnits.find((unit) => unit.id === selectedFamilyUnit) ?? null;
  const hasFamilyUnit = !!selectedFamilyUnitData;
  const hasZone = !!selectedZoneData && !hasFamilyUnit;
  const lodgingTotal = hasFamilyUnit
    ? (selectedFamilyUnitData.night_price * 2) / 100
    : hasZone
      ? ((selectedZoneData.night_price * 2) / 100) * lodgingQty
      : 0;

  return {
    selectedZoneData,
    selectedFamilyUnitData,
    hasFamilyUnit,
    hasZone,
    lodgingTotal,
  };
}