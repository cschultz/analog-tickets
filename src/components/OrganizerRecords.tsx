import { useEffect, useRef, useState } from "react";
import { CheckoutShell } from "./CheckoutShell";
import { Button } from "./ui/button";
import { OrganizerPromotions } from "./OrganizerPromotions";
import { supabase } from "@/lib/public-supabase-client";
import { getOrganizerEventChoices, getOrganizerRecords } from "@/lib/organizer-records.functions";
import {
  ORGANIZER_EXPORT_LIMIT,
  type OrganizerRecord,
  type OrganizerResource,
  type OrganizerSearchField,
} from "@/lib/organizer-records-core";

export function OrganizerRecords() {
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventId, setEventId] = useState("");
  const [resource, setResource] = useState<OrganizerResource>("orders");
  const [field, setField] = useState<OrganizerSearchField>("name");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<OrganizerRecord[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [message, setMessage] = useState("Checking organizer access…");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const version = useRef(0);
  const activeUser = useRef<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let disposed = false;
    const generationRef = version;
    const apply = async (userId: string | null, token?: string) => {
      if (disposed) return;
      const generation = ++version.current;
      activeUser.current = userId;
      setSignedIn(userId !== null);
      setLoginPassword("");
      setEvents([]);
      setEventId("");
      setRows([]);
      setAfter(null);
      setQuery("");
      setMessage(
        userId ? "Loading your events…" : "Sign in with your organizer account to continue.",
      );
      if (!token) return;
      try {
        const result = await getOrganizerEventChoices({
          headers: { authorization: `Bearer ${token}` },
        });
        if (disposed || version.current !== generation) return;
        if (!result.ok) {
          setMessage("Organizer tools are unavailable.");
          return;
        }
        setEvents(result.events);
        setEventId(result.events[0]?.id ?? "");
        setMessage(
          result.events.length
            ? "Choose a view and search, or leave the search blank to browse."
            : "No organizer events are available for this account.",
        );
      } catch {
        if (!disposed && version.current === generation)
          setMessage("Organizer tools are unavailable.");
      }
    };
    const initial = version.current;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (version.current === initial)
          void apply(data.session?.user.id ?? null, data.session?.access_token);
      })
      .catch(() => {
        if (version.current === initial) void apply(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (activeUser.current !== session?.user.id)
        void apply(session?.user.id ?? null, session?.access_token);
    });
    return () => {
      disposed = true;
      ++generationRef.current;
      subscription.unsubscribe();
    };
  }, []);

  function clearResults() {
    ++version.current;
    setRows([]);
    setAfter(null);
  }
  async function signIn() {
    if (pending.current || !/^[^@\s]+@example\.test$/i.test(loginEmail.trim())) return;
    pending.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) setMessage("Sign-in was not successful. Check your TEST account details.");
    } catch {
      setMessage("Sign-in is unavailable.");
    } finally {
      setLoginPassword("");
      pending.current = false;
      setBusy(false);
    }
  }
  async function run(operation: "search" | "export", cursor: string | null = null) {
    if (pending.current || !eventId) return;
    pending.current = true;
    setBusy(true);
    const generation = ++version.current;
    setMessage(operation === "export" ? "Preparing CSV…" : "Searching…");
    if (operation === "search") {
      setRows([]);
      setAfter(null);
    }
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (version.current !== generation) return;
      if (!session || session.user.id !== activeUser.current) {
        clearResults();
        setMessage("Sign in again to continue.");
        return;
      }
      const result = await getOrganizerRecords({
        data: {
          eventId,
          resource,
          field,
          query,
          after: operation === "export" ? null : cursor,
          operation,
        },
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (version.current !== generation) return;
      if (!result.ok) {
        setMessage(
          result.code === "export_too_large"
            ? `More than ${ORGANIZER_EXPORT_LIMIT} matches. Narrow the search before exporting; no partial file was created.`
            : result.code === "invalid_request"
              ? "Check your search. IDs must be complete; wildcard characters are not supported."
              : "Organizer tools are unavailable for this selection.",
        );
        return;
      }
      if (operation === "export" && result.csv !== null) {
        const url = URL.createObjectURL(
          new Blob(["\uFEFF", result.csv], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `analog-test-${resource}-${eventId}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setMessage(
          `Exported all ${result.rows.length} matching ${resource}. Keep this personal data private.`,
        );
      } else {
        setRows(result.rows);
        setAfter(result.nextAfter);
        setMessage(
          result.rows.length
            ? `${result.rows.length} ${resource} shown${result.nextAfter ? "; more available" : ""}.`
            : "No matches. Try a different search.",
        );
      }
    } catch {
      if (version.current === generation)
        setMessage("Organizer tools are unavailable. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <CheckoutShell
      title="Organizer tools"
      summary={
        <>
          <h2>TEST operations</h2>
          <p className="checkout-note">Search orders or ticket holders for an event you manage.</p>
          <p className="checkout-note">
            CSV includes all matches, up to {ORGANIZER_EXPORT_LIMIT}. It is not a financial
            reconciliation report.
          </p>
          <p className="checkout-note">
            Order totals are the original amount, not net revenue after refunds. Holder details may
            be blank or differ from the buyer.
          </p>
          <p className="checkout-note">
            Downloads contain personal data. Store them privately and delete them when no longer
            needed.
          </p>
        </>
      }
    >
      {!signedIn ? (
        <form
          className="checkout-form"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <h2>Organizer sign-in</h2>
          <p className="checkout-note">
            Use an existing synthetic @example.test organizer account. This screen does not create
            accounts or grant access.
          </p>
          <label htmlFor="organizer-email">Email</label>
          <input
            id="organizer-email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            pattern={"[^@\\s]+@example\\.test"}
            value={loginEmail}
            disabled={busy}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
          <label htmlFor="organizer-password">Password</label>
          <input
            id="organizer-password"
            type="password"
            autoComplete="current-password"
            required
            value={loginPassword}
            disabled={busy}
            onChange={(e) => setLoginPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            Sign in to TEST organizer tools
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            clearResults();
            setEvents([]);
            setEventId("");
            setMessage("Signing out…");
            void supabase.auth
              .signOut({ scope: "local" })
              .then(({ error }) => {
                if (error) setMessage("Sign-out was not completed. Please try again.");
              })
              .catch(() => setMessage("Sign-out was not completed. Please try again."));
          }}
        >
          Sign out on this device
        </Button>
      )}
      <form
        className="checkout-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run("search");
        }}
      >
        <label htmlFor="organizer-event">Event</label>
        <select
          id="organizer-event"
          value={eventId}
          disabled={busy || !events.length}
          onChange={(e) => {
            clearResults();
            setEventId(e.target.value);
          }}
        >
          {!events.length ? <option value="">No event selected</option> : null}
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <label htmlFor="organizer-view">View</label>
        <select
          id="organizer-view"
          value={resource}
          disabled={busy || !events.length}
          onChange={(e) => {
            clearResults();
            setResource(e.target.value as OrganizerResource);
            setField("name");
            setQuery("");
          }}
        >
          <option value="orders">Orders — buyer details</option>
          <option value="attendees">Attendees — ticket holder details</option>
        </select>
        <label htmlFor="organizer-field">Search by</label>
        <select
          id="organizer-field"
          value={field}
          disabled={busy || !events.length}
          onChange={(e) => {
            clearResults();
            setField(e.target.value as OrganizerSearchField);
            setQuery("");
          }}
        >
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="id">{resource === "orders" ? "Order ID" : "Ticket ID"}</option>
          {resource === "attendees" ? <option value="orderId">Order ID</option> : null}
        </select>
        <label htmlFor="organizer-query">Search text</label>
        <input
          id="organizer-query"
          value={query}
          maxLength={120}
          autoComplete="off"
          disabled={busy || !events.length}
          onChange={(e) => {
            clearResults();
            setQuery(e.target.value);
          }}
          aria-describedby="organizer-search-hint"
        />
        <p id="organizer-search-hint" className="checkout-note">
          Names and emails match part of the text. IDs must be complete. Leave blank to browse.
          Results are ordered by ID, not purchase date.
        </p>
        <Button type="submit" disabled={busy || !eventId}>
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !eventId}
          onClick={() => {
            void run("export");
          }}
        >
          Export all matching {resource} (CSV)
        </Button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {rows.length ? (
        <div className="organizer-results" tabIndex={0} role="region" aria-label="Search results">
          <table>
            <caption>
              {resource === "orders" ? "Order search results" : "Ticket holder search results"}
            </caption>
            <thead>
              <tr>
                <th scope="col">{resource === "orders" ? "Order" : "Ticket"}</th>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">{resource === "orders" ? "Original total" : "Check-in"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <code>{row.id}</code>
                    {resource === "attendees" ? (
                      <p>
                        Order: <code>{row.orderId}</code>
                      </p>
                    ) : null}
                  </td>
                  <td>{row.name || "Not provided"}</td>
                  <td>{row.email || "Not provided"}</td>
                  <td>{row.status}</td>
                  <td>
                    {resource === "orders"
                      ? row.currency === "usd" && row.orderTotalCents !== null
                        ? `$${(row.orderTotalCents / 100).toFixed(2)} USD`
                        : `${row.orderTotalCents} ${row.currency?.toUpperCase()} minor units`
                      : (row.checkedInAt ?? "Not checked in")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {after ? (
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            void run("search", after);
          }}
        >
          Next 50 results
        </Button>
      ) : null}
      {signedIn && eventId && activeUser.current ? (
        <OrganizerPromotions
          key={`${activeUser.current}:${eventId}`}
          eventId={eventId}
          eventName={events.find((event) => event.id === eventId)?.name ?? "Selected event"}
          userId={activeUser.current}
        />
      ) : null}
    </CheckoutShell>
  );
}
