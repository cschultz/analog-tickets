import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import "@/components/test-beta.css";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/public-supabase-client";
import {
  assembleCatalog,
  catalogDate,
  catalogPrice,
  type CatalogEvent,
} from "@/lib/event-catalog-core";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Analog Tickets — TEST event catalog" },
      { name: "description", content: "Synthetic events and TEST tickets. No real admission." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EventCatalog,
});

type CatalogState =
  { status: "loading" } | { status: "unavailable" } | { status: "ready"; events: CatalogEvent[] };

function EventCatalog() {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // The Data API and RLS are the primary access boundary. Explicit
        // filters and the view projection add defense in depth for signed-in
        // visitors whose role may see more than the anonymous catalog.
        const eventResult = await supabase
          .from("events")
          .select("id,slug,name,description,venue_name,starts_at,timezone,is_published")
          .eq("is_published", true);
        if (eventResult.error) throw new Error("catalog_unavailable");
        const events = eventResult.data ?? [];
        if (events.length === 0) {
          if (active) setState({ status: "ready", events: [] });
          return;
        }
        const tierResult = await supabase
          .from("ticket_types")
          .select("id,event_id,name,description,price_cents,currency,sort_order,is_active")
          .in(
            "event_id",
            events.map((event) => event.id),
          )
          .eq("is_active", true);
        if (tierResult.error) throw new Error("catalog_unavailable");
        if (active)
          setState({
            status: "ready",
            events: assembleCatalog(events, tierResult.data ?? []),
          });
      } catch {
        if (active) setState({ status: "unavailable" });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="test-beta-catalog">
      <header>
        <p className="test-beta-label">Analog Tickets · TEST beta</p>
        <h1>Explore the ticket experience</h1>
        <p>Synthetic events only. These tickets do not grant admission to a real event.</p>
        <nav aria-label="Ticket services"><a href="/tickets/recover">Recover TEST tickets</a></nav>
      </header>
      {state.status === "loading" ? (
        <p role="status" className="festival-catalog-state">
          Loading events…
        </p>
      ) : state.status === "unavailable" ? (
        <p role="alert" className="festival-catalog-state">
          Events are temporarily unavailable. Please try again later.
        </p>
      ) : state.events.length === 0 ? (
        <p role="status" className="festival-catalog-state">
          No events are published yet.
        </p>
      ) : (
        <div className="festival-catalog">
          {state.events.map((event) => (
            <article key={event.id} className="festival-event">
              <h3 className="festival-event-title">{event.name}</h3>
              <p className="festival-event-meta">
                {catalogDate(event.starts_at, event.timezone)}
                {event.venue_name ? ` · ${event.venue_name}` : ""}
              </p>
              {event.description ? (
                <p className="festival-event-description">{event.description}</p>
              ) : null}
              {event.tiers.length === 0 ? (
                <p className="festival-catalog-state">No ticket options listed.</p>
              ) : (
                <section
                  aria-label={`Ticket options for ${event.name}`}
                  className="festival-ticket-options"
                >
                  <h4 className="festival-options-title">Ticket options</h4>
                  <ul className="festival-ticket-list">
                    {event.tiers.map((tier) => (
                      <li key={tier.id} className="festival-ticket">
                        <span>
                          <span className="festival-tier-name">{tier.name}</span>
                          {tier.description ? (
                            <span className="festival-tier-description">{tier.description}</span>
                          ) : null}
                        </span>
                        <span className="festival-tier-actions">
                          <span className="festival-price">
                            {catalogPrice(tier.price_cents, tier.currency)}
                          </span>
                          <Button asChild variant="outline" className="festival-button">
                            <a href={`/checkout/start?ticketTypeId=${encodeURIComponent(tier.id)}`}>
                              Preview TEST checkout
                            </a>
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
