import { isUuid } from "./checkout-core";

export const organizerSections = [
  "dashboard",
  "reports",
  "orders",
  "attendees",
  "check-in",
  "promotions",
  "event",
  "tickets",
  "inventory",
  "setup",
] as const;
export type OrganizerSection = (typeof organizerSections)[number];
export type OrganizerAccess =
  "checking" | "signed_out" | "loading" | "ready" | "no_access" | "error";
export interface OrganizerLocation {
  section: OrganizerSection;
  eventId: string | null;
  orderId?: string;
}

/** Only navigation hints, never authorization. No buyer text, session or credentials in links. */
export function readOrganizerLocation(hash: string): OrganizerLocation | null {
  if (!hash.startsWith("#view=") || hash.length > 200) return null;
  const params = new URLSearchParams(hash.slice(1));
  if (
    [...params.keys()].some((k) => !["view", "event", "order"].includes(k)) ||
    params.getAll("view").length !== 1 ||
    params.getAll("event").length > 1 ||
    params.getAll("order").length > 1
  )
    return null;
  const section = params.get("view");
  const eventId = params.get("event");
  const orderId = params.get("order");
  if (
    !organizerSections.includes(section as OrganizerSection) ||
    (eventId !== null && !isUuid(eventId)) ||
    (orderId !== null &&
      (!isUuid(orderId) || !eventId || !["orders", "attendees"].includes(section!)))
  )
    return null;
  return {
    section: section as OrganizerSection,
    eventId: eventId?.toLowerCase() ?? null,
    ...(orderId ? { orderId: orderId.toLowerCase() } : {}),
  };
}

export function organizerLocationHash(location: OrganizerLocation): string {
  if (
    !organizerSections.includes(location.section) ||
    (location.eventId !== null && !isUuid(location.eventId)) ||
    (location.orderId !== undefined &&
      (!isUuid(location.orderId) ||
        !location.eventId ||
        !["orders", "attendees"].includes(location.section)))
  )
    throw new Error("Invalid organizer location");
  return `#view=${location.section}${location.eventId ? `&event=${location.eventId.toLowerCase()}` : ""}${location.orderId ? `&order=${location.orderId.toLowerCase()}` : ""}`;
}

export function selectOrganizerEvent(events: { id: string }[], requestedId: string | null): string {
  return requestedId
    ? (events.find((event) => event.id === requestedId)?.id ?? "")
    : (events[0]?.id ?? "");
}

export function organizerEventContext(access: OrganizerAccess, eventName: string): string {
  if (eventName && access === "ready") return eventName;
  return {
    checking: "Checking your session…",
    signed_out: "Sign in to continue",
    loading: "Loading event access…",
    ready: "Select an available event",
    no_access: "No organizer access",
    error: "Event access unavailable",
  }[access];
}
