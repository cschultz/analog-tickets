import { CHECKOUT_TICKET_STORAGE_KEY, parseCheckoutTicketSelection } from "@/lib/checkoutTicket";

export const CHECKOUT_LODGING_STORAGE_KEY = "cosmico_checkout_lodging";
export const CHECKOUT_ADDONS_STORAGE_KEY = "cosmico_checkout_addons";
export const MY_TICKETS_SELF_SERVICE_LODGING_KEY = "myTicketsSelfServiceLodging";

const QUALIFYING_LODGING_TICKET_TYPES = ["vip", "vip_3day", "krewe", "krewe_3day"];

export type BookingRouteIntent = "lodging" | "addons";

export interface BookingRouteContext {
  addonSelectionRaw?: string | null;
  lodgingSelectionRaw?: string | null;
  ticketSelectionRaw?: string | null;
}

export function isQualifyingLodgingTicketType(ticketType: string): boolean {
  const normalized = ticketType.toLowerCase().replace(/[\s-]/g, "_");
  return QUALIFYING_LODGING_TICKET_TYPES.some((candidate) => normalized.includes(candidate)) && !normalized.includes("single");
}

export function resolveBookingRoute(
  intent: BookingRouteIntent,
  context: BookingRouteContext,
): "/my-tickets" | "/checkout/lodging" | "/checkout/addons" {
  const ticketSelection = parseCheckoutTicketSelection(context.ticketSelectionRaw ?? null);
  const hasCheckoutTicket = Boolean(ticketSelection);
  const hasCartContext = hasCheckoutTicket || Boolean(context.lodgingSelectionRaw) || Boolean(context.addonSelectionRaw);

  if (!hasCartContext || !ticketSelection) {
    return "/my-tickets";
  }

  if (intent === "lodging") {
    return isQualifyingLodgingTicketType(ticketSelection.ticketType) ? "/checkout/lodging" : "/my-tickets";
  }

  return "/checkout/addons";
}

export function resolveBookingRouteFromSessionStorage(intent: BookingRouteIntent) {
  if (typeof window === "undefined") {
    return "/my-tickets" as const;
  }

  return resolveBookingRoute(intent, {
    ticketSelectionRaw: window.sessionStorage.getItem(CHECKOUT_TICKET_STORAGE_KEY),
    lodgingSelectionRaw: window.sessionStorage.getItem(CHECKOUT_LODGING_STORAGE_KEY),
    addonSelectionRaw: window.sessionStorage.getItem(CHECKOUT_ADDONS_STORAGE_KEY),
  });
}