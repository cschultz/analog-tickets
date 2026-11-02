import type { AdminWorkspace, WorkspaceInput } from "./admin-workspace-core";
import { catalogDate } from "./event-catalog-core";
import { organizerMoney } from "./organizer-order-detail-core";

const labels: Record<string, string> = {
  name: "Name",
  description: "Description",
  venue: "Venue",
  timezone: "Event timezone",
  startsAt: "Starts",
  endsAt: "Ends",
  slug: "Ticket slug",
  priceCents: "Price (USD)",
  capacity: "Total capacity",
  maxPerOrder: "Maximum per order",
  active: "Available for new TEST sales",
};
export interface CatalogReview {
  subject: string;
  changes: { label: string; before: string; after: string }[];
  schedule: { starts: string; ends: string } | null;
  committed: number | null;
  blocked: string | null;
}
/** Display-only comparison of the authorized snapshot and parsed draft, not write authority. */
export function catalogReview(w: AdminWorkspace, input: WorkspaceInput): CatalogReview | null {
  if (input.action === "read" || input.eventId !== w.event.id) return null;
  const tier =
    input.action === "save_tier" && input.id !== null
      ? w.tiers.find((t) => t.id === input.id)
      : null;
  if (
    input.action === "save_event"
      ? input.revision !== w.event.revision
      : input.id !== null && (!tier || tier.revision !== input.revision)
  )
    return null;
  const previous: Record<string, unknown> =
    input.action === "save_event" ? { ...w.event } : { ...tier };
  const nextZone = input.action === "save_event" ? input.values.timezone : w.event.timezone;
  const format = (key: string, value: unknown, zone: string) => {
    if (value === undefined) return "New tier";
    if (key === "capacity" && value === null) return "Unbounded";
    if (key === "startsAt" || key === "endsAt")
      return value ? `${catalogDate(String(value), zone)} · ${String(value)}` : "Not scheduled";
    if (value === null || value === "") return "Not set";
    if (key === "priceCents" && typeof value === "number") return organizerMoney(value);
    return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  };
  return {
    subject: input.action === "save_event" ? w.event.name : (tier?.name ?? "New ticket tier"),
    changes: Object.entries(input.values)
      .filter(([key, value]) => (previous[key] ?? "") !== (value ?? ""))
      .map(([key, value]) => ({
        label: labels[key] ?? key,
        before: format(key, previous[key], w.event.timezone),
        after: format(key, value, nextZone),
      })),
    schedule:
      input.action === "save_event"
        ? {
            starts: input.values.startsAt
              ? catalogDate(input.values.startsAt, nextZone)
              : "Not scheduled",
            ends: input.values.endsAt
              ? catalogDate(input.values.endsAt, nextZone)
              : "Not scheduled",
          }
        : null,
    committed: tier?.committed ?? null,
    blocked:
      input.action === "save_tier" && tier && input.values.capacity < tier.committed
        ? "Capacity is below the currently reserved-or-sold quantity. Cancel and adjust the draft."
        : null,
  };
}
