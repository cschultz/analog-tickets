export type CatalogEventRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  venue_name: string | null;
  starts_at: string | null;
  timezone: string;
  is_published: boolean;
};

export type CatalogTierRow = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  sort_order: number;
  is_active: boolean;
  max_per_order?: number;
};

export type CatalogEvent = CatalogEventRow & { tiers: CatalogTierRow[] };

/** Defense in depth: only published events and their active tiers reach the view. */
export function assembleCatalog(
  events: readonly CatalogEventRow[],
  tiers: readonly CatalogTierRow[],
): CatalogEvent[] {
  const byEvent = new Map<string, CatalogTierRow[]>();
  for (const tier of tiers) {
    if (!tier.is_active) continue;
    const list = byEvent.get(tier.event_id) ?? [];
    list.push(tier);
    byEvent.set(tier.event_id, list);
  }
  return events
    .filter((event) => event.is_published)
    .map((event) => ({
      ...event,
      tiers: [...(byEvent.get(event.id) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => {
      if (!a.starts_at) return b.starts_at ? 1 : a.name.localeCompare(b.name);
      if (!b.starts_at) return -1;
      return a.starts_at.localeCompare(b.starts_at) || a.name.localeCompare(b.name);
    });
}

export function catalogPrice(priceCents: number, currency: string): string {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0 || !/^[a-z]{3}$/i.test(currency))
    return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return "Price unavailable";
  }
}

export function catalogDate(value: string | null, timezone = "UTC"): string {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  const format = (zone: string) =>
    `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(date)} (${zone})`;
  try {
    return format(timezone);
  } catch {
    // An invalid stored timezone must never fall back to the viewer's locale.
    return format("UTC");
  }
}
