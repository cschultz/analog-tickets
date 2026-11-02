import { useCallback, useEffect, useRef, useState } from "react";
import { OrganizerAdminShell, type OrganizerSection } from "./admin/OrganizerAdminShell";
import { OrganizerOrderDetail } from "./admin/OrganizerOrderDetail";
import { OrganizerBuyerSupport } from "./admin/OrganizerBuyerSupport";
import { OrganizerCheckIn } from "./admin/OrganizerCheckIn";
import { OrganizerSetup } from "./admin/OrganizerSetup";
import { OrganizerSupportMemory } from "@/lib/organizer-support-controller";
import { OrganizerListMemory } from "@/lib/organizer-list-memory";
import { AdminWorkspacePanel } from "./admin/AdminWorkspacePanel";
import { StatusPill } from "./admin/StatusPill";
import { getOrganizerOrderDetail } from "@/lib/organizer-order-detail.functions";
import {
  organizerDate,
  type OrganizerOrderDetail as Detail,
} from "@/lib/organizer-order-detail-core";
import { Button } from "./ui/button";
import { OrganizerPromotions } from "./OrganizerPromotions";
import { supabase } from "@/lib/public-supabase-client";
import { getOrganizerEventChoices, getOrganizerRecords } from "@/lib/organizer-records.functions";
import { adminWorkspace } from "@/lib/admin-workspace.functions";
import {
  emptyOrganizerFilters,
  organizerPageHistory,
  organizerStatuses,
  type OrganizerFilters,
} from "@/lib/organizer-browse-core";
import {
  ORGANIZER_EXPORT_LIMIT,
  type OrganizerRecord,
  type OrganizerResource,
  type OrganizerSearchField,
} from "@/lib/organizer-records-core";
import {
  readOrganizerLocation,
  organizerLocationHash,
  selectOrganizerEvent,
  type OrganizerAccess,
} from "@/lib/organizer-navigation";

function writeLocation(
  next: OrganizerSection,
  selected: string,
  replace = false,
  orderId?: string,
) {
  const hash = organizerLocationHash({
    section: next,
    eventId: selected || null,
    ...(orderId ? { orderId } : {}),
  });
  if (window.location.hash !== hash)
    window.history[replace ? "replaceState" : "pushState"](null, "", hash);
}

export function OrganizerRecords({
  initialSection = "orders",
}: { initialSection?: OrganizerSection } = {}) {
  const [section, setSection] = useState<OrganizerSection>(
    () =>
      (typeof window !== "undefined" && readOrganizerLocation(window.location.hash)?.section) ||
      initialSection,
  );
  const isRecords = section === "orders" || section === "attendees";
  const needsWorkspaceMetadata = isRecords || section === "promotions";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [supportMemory] = useState(() => new OrganizerSupportMemory());
  const [listMemory] = useState(() => new OrganizerListMemory());
  const [orderHint, setOrderHint] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? (readOrganizerLocation(window.location.hash)?.orderId ?? null)
      : null,
  );
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMessage, setDetailMessage] = useState("");
  const openOrderTrigger = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const previousOrderHint = useRef(orderHint);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventId, setEventId] = useState("");
  const [resource, setResource] = useState<OrganizerResource>(
    section === "attendees" ? "attendees" : "orders",
  );
  const [field, setField] = useState<OrganizerSearchField>("auto");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<OrganizerFilters>({ ...emptyOrganizerFilters });
  const [tiers, setTiers] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [tiersState, setTiersState] = useState<"loading" | "ready" | "error">("loading");
  const [tiersAttempt, setTiersAttempt] = useState(0);
  const [eventClock, setEventClock] = useState<{ eventId: string; timeZone: string } | null>(null);
  const timeZone = eventClock?.eventId === eventId ? eventClock.timeZone : "UTC";
  const [rows, setRows] = useState<OrganizerRecord[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [message, setMessage] = useState("Checking organizer access…");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [access, setAccess] = useState<OrganizerAccess>("checking");
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [eventAccessRevision, setEventAccessRevision] = useState(0);
  const [accountEmail, setAccountEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const version = useRef(0);
  const detailVersion = useRef(0);
  const accessVersion = useRef(0);
  const activeUser = useRef<string | null>(null);
  const pending = useRef(false);

  const clearResults = useCallback(
    (updateLocation = true) => {
      ++version.current;
      ++detailVersion.current;
      pending.current = false;
      setBusy(false);
      setRows([]);
      setAfter(null);
      setCursorHistory([null]);
      setDetail(null);
      setOrderHint(null);
      setDetailMessage("");
      if (updateLocation && eventId) writeLocation(section, eventId, true);
      setMessage("Selection changed. Search to load matching records.");
    },
    [section, eventId],
  );

  const rememberList = useCallback(() => {
    if (activeUser.current && eventId && isRecords)
      listMemory.save(activeUser.current, eventId, resource, {
        field,
        query,
        filters,
        history: cursorHistory,
      });
  }, [eventId, isRecords, resource, field, query, filters, cursorHistory, listMemory]);
  const restoreList = useCallback(
    (next: OrganizerSection, selected: string) => {
      if (next !== "orders" && next !== "attendees") return;
      const context = listMemory.read(activeUser.current ?? "", selected, next);
      setResource(next);
      setField(context.field);
      setQuery(context.query);
      setFilters(context.filters);
      setCursorHistory(context.history);
    },
    [listMemory],
  );

  useEffect(() => {
    let disposed = false;
    const generationRef = version;
    const accessGenerationRef = accessVersion;
    const apply = async (userId: string | null, token?: string, email = "") => {
      if (disposed) return;
      const generation = ++accessVersion.current;
      ++version.current;
      ++detailVersion.current;
      pending.current = false;
      setBusy(false);
      listMemory.clear();
      activeUser.current = userId;
      setSignedIn(userId !== null);
      setAccess(userId ? "loading" : "signed_out");
      setAccountEmail(userId ? email : "");
      setLoginPassword("");
      setEvents([]);
      setEventClock(null);
      setEventId("");
      setRows([]);
      setAfter(null);
      setCursorHistory([null]);
      setDetail(null);
      setDetailMessage("");
      setQuery("");
      setFilters({ ...emptyOrganizerFilters });
      setMessage(
        userId ? "Loading your events…" : "Sign in with your organizer account to continue.",
      );
      if (!token) return;
      try {
        const result = await getOrganizerEventChoices({
          headers: { authorization: `Bearer ${token}` },
        });
        if (disposed || accessVersion.current !== generation) return;
        if (!result.ok) {
          setAccess("error");
          setMessage(
            "We couldn’t load your event access. Retry without changing your account or permissions.",
          );
          return;
        }
        const location = readOrganizerLocation(window.location.hash);
        const selected = selectOrganizerEvent(result.events, location?.eventId ?? null);
        setEvents(result.events);
        setEventId(selected);
        setAccess(result.events.length ? "ready" : "no_access");
        setEventAccessRevision((revision) => revision + 1);
        setOrderHint(location?.orderId ?? null);
        if (selected)
          writeLocation(location?.section ?? initialSection, selected, true, location?.orderId);
        setMessage(
          result.events.length
            ? selected
              ? "Choose a view and search, or leave the search blank to browse."
              : "The event in this link is not available to this account. Select one of your events above."
            : "You’re signed in, but this account has no organizer events. Switch accounts or ask the installation owner for event access.",
        );
      } catch {
        if (!disposed && accessVersion.current === generation) {
          setAccess("error");
          setMessage("We couldn’t load your event access. Retry or switch accounts.");
        }
      }
    };
    const initial = accessVersion.current;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (accessVersion.current === initial)
          void apply(
            data.session?.user.id ?? null,
            data.session?.access_token,
            data.session?.user.email,
          );
      })
      .catch(() => {
        if (accessVersion.current === initial) void apply(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (activeUser.current !== session?.user.id)
        void apply(session?.user.id ?? null, session?.access_token, session?.user.email);
    });
    return () => {
      disposed = true;
      ++generationRef.current;
      ++accessGenerationRef.current;
      subscription.unsubscribe();
    };
  }, [accessAttempt, initialSection, listMemory]);

  useEffect(() => {
    const onNavigation = () => {
      const location = readOrganizerLocation(window.location.hash);
      if (!location) return;
      const selected = access === "ready" ? selectOrganizerEvent(events, location.eventId) : "";
      const sameList = location.section === section && selected === eventId;
      if (access === "ready" && !sameList) {
        rememberList();
        clearResults(false);
      }
      if (!sameList || (location.orderId ?? null) !== orderHint) {
        ++detailVersion.current;
        setDetail(null);
        setDetailMessage("");
      }
      setOrderHint(location.orderId ?? null);
      setSection(location.section);
      if (!sameList) restoreList(location.section, selected);
      if (access === "ready") {
        setEventId(selected);
        if (!sameList) setMessage("Select an available event to continue.");
      }
    };
    window.addEventListener("hashchange", onNavigation);
    return () => window.removeEventListener("hashchange", onNavigation);
  }, [events, access, section, eventId, orderHint, clearResults, rememberList, restoreList]);
  function changeSection(next: OrganizerSection) {
    if (next === section) {
      closeOrder();
      return;
    }
    rememberList();
    clearResults(false);
    restoreList(next, eventId);
    setSection(next);
    writeLocation(next, eventId);
  }
  async function signOut() {
    if (pending.current) return;
    listMemory.clear();
    clearResults();
    ++accessVersion.current;
    setEvents([]);
    setEventId("");
    setAccess("loading");
    setMessage("Signing out…");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (!error) return;
    } catch {
      /* Show an actionable error without reusing cached workspace data. */
    }
    setAccess("error");
    setMessage("Sign-out was not completed. Retry access or try signing out again.");
  }
  function openOrder(orderId: string, trigger: HTMLButtonElement) {
    if (!eventId) return;
    ++detailVersion.current;
    setDetail(null);
    openOrderTrigger.current = trigger;
    setOrderHint(orderId);
    setDetailAttempt((n) => n + 1);
    writeLocation(section, eventId, false, orderId);
  }
  function closeOrder() {
    ++detailVersion.current;
    setOrderHint(null);
    setDetail(null);
    setDetailMessage("");
    writeLocation(section, eventId);
  }

  useEffect(() => {
    if (previousOrderHint.current && !orderHint) {
      const target = openOrderTrigger.current?.isConnected
        ? openOrderTrigger.current
        : searchInput.current;
      if (target?.isConnected) target.focus();
    }
    previousOrderHint.current = orderHint;
  }, [orderHint]);

  useEffect(() => {
    let disposed = false;
    const generation = ++detailVersion.current;
    setDetail(null);
    setDetailMessage("");
    setDetailBusy(false);
    if (!orderHint || !eventId || !isRecords || access !== "ready") return;
    setDetailBusy(true);
    setDetailMessage("Loading order details…");
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (disposed || detailVersion.current !== generation) return;
        if (!session || session.user.id !== activeUser.current) {
          setDetailMessage("Sign in again to view this order.");
          return;
        }
        const result = await getOrganizerOrderDetail({
          data: { eventId, orderId: orderHint },
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (disposed || detailVersion.current !== generation) return;
        if (result.ok && result.order.id === orderHint && result.order.eventId === eventId) {
          setDetail(result.order);
          setDetailMessage("");
        } else
          setDetailMessage(
            "This order is unavailable for your current event and account. Retry or return to the list.",
          );
      } catch {
        if (!disposed && detailVersion.current === generation)
          setDetailMessage("Order details could not be loaded. Retry or return to the list.");
      } finally {
        if (!disposed && detailVersion.current === generation) setDetailBusy(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [orderHint, eventId, isRecords, access, detailAttempt, eventAccessRevision]);
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
  async function run(
    operation: "search" | "export",
    cursor: string | null = null,
    override?: { field: OrganizerSearchField; query: string; filters: OrganizerFilters },
    navigation: "search" | "next" | "previous" | "refresh" = "search",
  ) {
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
          field: override?.field ?? field,
          query: override?.query ?? query,
          sort: "recent",
          filters: override?.filters ?? filters,
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
              ? "Check your search and date range. IDs must be complete; wildcard characters are not supported."
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
        setCursorHistory((history) => organizerPageHistory(history, cursor, navigation));
        setMessage(
          result.rows.length
            ? `${result.rows.length} ${result.rows.length === 1 ? (resource === "orders" ? "order" : "attendee") : resource} shown${result.nextAfter ? "; more available" : ""}.`
            : "No matches. Try a different search.",
        );
      }
    } catch {
      if (version.current === generation)
        setMessage("Organizer tools are unavailable. Please try again.");
    } finally {
      if (version.current === generation) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  const latestRun = useRef(run);
  const latestHistory = useRef(cursorHistory);
  useEffect(() => {
    latestRun.current = run;
    latestHistory.current = cursorHistory;
  });
  useEffect(() => {
    if (isRecords && access === "ready" && eventId)
      void latestRun.current("search", latestHistory.current.at(-1) ?? null, undefined, "refresh");
  }, [isRecords, access, eventId, resource, eventAccessRevision]);

  useEffect(() => {
    let disposed = false;
    setTiers([]);
    setEventClock(null);
    setTiersState("loading");
    if (needsWorkspaceMetadata && access === "ready" && eventId)
      void (async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (disposed) return;
          if (!data.session || data.session.user.id !== activeUser.current) {
            setTiersState("error");
            return;
          }
          const result = await adminWorkspace({
            data: { action: "read", eventId },
            headers: { authorization: `Bearer ${data.session.access_token}` },
          });
          if (disposed) return;
          const ready = result.ok && result.action === "read";
          setTiersState(ready ? "ready" : "error");
          if (ready) {
            setEventClock({ eventId, timeZone: result.workspace.event.timezone });
            setTiers(
              result.workspace.tiers.map((tier) => ({
                id: tier.id,
                name: tier.name,
                active: tier.active,
              })),
            );
          }
        } catch {
          if (!disposed) setTiersState("error");
        }
      })();
    return () => {
      disposed = true;
    };
  }, [needsWorkspaceMetadata, access, eventId, tiersAttempt, eventAccessRevision]);

  return (
    <OrganizerAdminShell
      section={section}
      onSection={changeSection}
      signedIn={signedIn}
      access={access}
      eventName={events.find((e) => e.id === eventId)?.name ?? ""}
      eventControl={
        signedIn ? (
          <>
            <label htmlFor="organizer-event">Event</label>
            <select
              id="organizer-event"
              value={eventId}
              disabled={busy || access !== "ready"}
              onChange={(e) => {
                rememberList();
                clearResults(false);
                restoreList(section, e.target.value);
                setEventId(e.target.value);
                writeLocation(section, e.target.value);
              }}
            >
              {!eventId ? (
                <option value="">
                  {events.length
                    ? "Select an available event"
                    : access === "no_access"
                      ? "No organizer events"
                      : access === "error"
                        ? "Event access unavailable"
                        : "Loading event access…"}
                </option>
              ) : null}
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span>Analog Tickets · Organizer tools</span>
        )
      }
      accountControl={
        signedIn ? (
          <details className="admin-account-menu">
            <summary>Account</summary>
            <div>
              <p>{accountEmail || "Signed-in TEST account"}</p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out on this device
              </Button>
            </div>
          </details>
        ) : null
      }
    >
      {access === "checking" ? (
        <p role="status">Checking your session…</p>
      ) : !signedIn ? (
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
          <p role="status" aria-live="polite">
            {message}
          </p>
        </form>
      ) : null}
      {signedIn && access !== "ready" ? (
        <section className="admin-access-state" aria-labelledby="organizer-access-heading">
          <h2 id="organizer-access-heading">
            {access === "no_access"
              ? "This account has no organizer access"
              : access === "error"
                ? "Event access could not be loaded"
                : "Loading event access…"}
          </h2>
          <p role="status">{message}</p>
          {access === "no_access" || access === "error" ? (
            <div className="admin-access-actions">
              <Button type="button" onClick={() => setAccessAttempt((attempt) => attempt + 1)}>
                Retry event access
              </Button>
              <Button type="button" variant="outline" onClick={() => void signOut()}>
                Switch account
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {signedIn && access === "ready" ? (
        <>
          <div hidden={orderHint !== null}>
            <form
              className="checkout-form admin-record-search"
              onSubmit={(e) => {
                e.preventDefault();
                closeOrder();
                void run("search");
              }}
            >
              {isRecords ? (
                <>
                  <label htmlFor="organizer-query">Search {resource}</label>
                  <input
                    id="organizer-query"
                    ref={searchInput}
                    value={query}
                    maxLength={120}
                    autoComplete="off"
                    placeholder={
                      resource === "orders"
                        ? "Name, email or full order ID"
                        : "Name, email, full ticket or order ID"
                    }
                    disabled={busy || !events.length}
                    onChange={(e) => {
                      clearResults();
                      setQuery(e.target.value);
                    }}
                    aria-describedby="organizer-search-hint"
                  />
                  <p id="organizer-search-hint" className="checkout-note">
                    Names and emails match part of the text. IDs must be complete. Leave blank to
                    browse. Newest records appear first. Searches and page position stay in this
                    workspace as you move between views; reload or account changes start fresh.
                  </p>
                  <p className="checkout-note">
                    Display times: {timeZone}
                    {eventClock?.eventId !== eventId
                      ? " (event timezone unavailable; explicit fallback)"
                      : ""}
                    . Creation-date filters and CSV timestamps remain UTC.
                  </p>
                  <div className="admin-record-filters">
                    <label>
                      Recorded {resource === "orders" ? "order" : "ticket"} status
                      <select
                        value={filters.status}
                        disabled={busy}
                        onChange={(e) => {
                          clearResults();
                          setFilters({ ...filters, status: e.target.value });
                        }}
                      >
                        <option value="all">All statuses</option>
                        {organizerStatuses[resource].map((status) => (
                          <option key={status} value={status}>
                            {status.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Created from (UTC)
                      <input
                        type="date"
                        value={filters.from ?? ""}
                        disabled={busy}
                        onChange={(e) => {
                          clearResults();
                          setFilters({ ...filters, from: e.target.value || null });
                        }}
                      />
                    </label>
                    <label>
                      Created through (UTC)
                      <input
                        type="date"
                        value={filters.through ?? ""}
                        disabled={busy}
                        onChange={(e) => {
                          clearResults();
                          setFilters({ ...filters, through: e.target.value || null });
                        }}
                      />
                    </label>
                    <label>
                      Ticket type
                      <select
                        value={filters.ticketTypeId ?? ""}
                        disabled={busy || tiersState !== "ready"}
                        onChange={(e) => {
                          clearResults();
                          setFilters({ ...filters, ticketTypeId: e.target.value || null });
                        }}
                      >
                        <option value="">
                          {tiersState === "loading"
                            ? "Loading ticket types…"
                            : tiersState === "error"
                              ? "Ticket types unavailable"
                              : "All ticket types"}
                        </option>
                        {tiers.map((tier) => (
                          <option key={tier.id} value={tier.id}>
                            {tier.name}
                            {tier.active ? "" : " (inactive)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {tiersState === "error" ? (
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() => setTiersAttempt((n) => n + 1)}
                    >
                      Retry ticket-type filters
                    </button>
                  ) : null}
                  <div className="admin-record-actions">
                    <Button type="submit" disabled={busy || !eventId}>
                      Search
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !eventId}
                      onClick={() => {
                        clearResults();
                        setField("auto");
                        setQuery("");
                        setFilters({ ...emptyOrganizerFilters });
                        void run("search", null, {
                          field: "auto",
                          query: "",
                          filters: { ...emptyOrganizerFilters },
                        });
                      }}
                    >
                      Reset filters
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
                  </div>
                </>
              ) : null}
            </form>
          </div>
          {isRecords ? (
            <>
              <div hidden={orderHint !== null}>
                <details className="admin-data-definitions">
                  <summary>About totals, refunds and CSV exports</summary>
                  <p className="checkout-note">
                    Order totals are the original amount, not net revenue after refunds. CSV
                    includes all matches, up to {ORGANIZER_EXPORT_LIMIT}; it is not a financial
                    reconciliation report. A paid order may have recorded partial refunds; open its
                    detail for history. Downloads contain personal data. Store them privately.
                  </p>
                </details>
              </div>
              {detailMessage ? (
                <div>
                  <p role="status" aria-live="polite">
                    {detailMessage}
                  </p>
                  {orderHint ? (
                    <div className="admin-record-actions">
                      {!detailBusy ? (
                        <Button type="button" onClick={() => setDetailAttempt((n) => n + 1)}>
                          Retry order details
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" onClick={closeOrder}>
                        Return to list
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {detail ? (
                <OrganizerOrderDetail
                  order={detail}
                  onClose={closeOrder}
                  ticketTypes={tiersState === "ready" ? tiers : []}
                  timeZone={timeZone}
                  support={
                    activeUser.current ? (
                      <OrganizerBuyerSupport
                        key={`${activeUser.current}:${detail.eventId}:${detail.id}`}
                        order={detail}
                        userId={activeUser.current}
                        memory={supportMemory}
                        onRefresh={() => {
                          setDetailAttempt((n) => n + 1);
                          void run("search", cursorHistory.at(-1) ?? null, undefined, "refresh");
                        }}
                      />
                    ) : null
                  }
                />
              ) : null}
              <div hidden={orderHint !== null}>
                <p role="status" aria-live="polite">
                  {message}
                </p>
                {rows.length ? (
                  <div
                    className="organizer-results"
                    tabIndex={0}
                    role="region"
                    aria-label="Search results"
                  >
                    <table>
                      <caption>
                        {resource === "orders"
                          ? "Order search results"
                          : "Ticket holder search results"}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{resource === "orders" ? "Order" : "Ticket"}</th>
                          <th scope="col">Created ({timeZone})</th>
                          <th scope="col">Name</th>
                          <th scope="col">Email</th>
                          <th scope="col">Status</th>
                          <th scope="col">
                            {resource === "orders" ? "Original total" : "Check-in"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <button
                                type="button"
                                className="admin-open-order"
                                disabled={busy}
                                onClick={(e) => {
                                  void openOrder(row.orderId, e.currentTarget);
                                }}
                                aria-label={`Open order ${row.orderId}`}
                              >
                                {resource === "orders"
                                  ? `Order ${row.id.slice(0, 8)}…`
                                  : `Ticket ${row.id.slice(0, 8)}…`}
                              </button>
                              {resource === "attendees" ? <p>View buyer order</p> : null}
                            </td>
                            <td>{organizerDate(row.createdAt, timeZone)}</td>
                            <td>{row.name || "Not provided"}</td>
                            <td>{row.email || "Not provided"}</td>
                            <td>
                              <StatusPill status={row.status.replaceAll("_", " ")} />
                            </td>
                            <td>
                              {resource === "orders"
                                ? row.currency === "usd" && row.orderTotalCents !== null
                                  ? `$${(row.orderTotalCents / 100).toFixed(2)} USD`
                                  : `${row.orderTotalCents} ${row.currency?.toUpperCase()} minor units`
                                : row.checkedInAt
                                  ? organizerDate(row.checkedInAt, timeZone)
                                  : "Not checked in"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {after || cursorHistory.length > 1 ? (
                  <nav className="admin-record-actions" aria-label="Result pages">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || cursorHistory.length <= 1}
                      onClick={() =>
                        void run("search", cursorHistory.at(-2) ?? null, undefined, "previous")
                      }
                    >
                      Previous page
                    </Button>
                    <span>Page {cursorHistory.length}</span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !after}
                      onClick={() => void run("search", after, undefined, "next")}
                    >
                      Next page
                    </Button>
                  </nav>
                ) : null}
              </div>
            </>
          ) : null}
          {section === "check-in" && eventId ? (
            <OrganizerCheckIn onAttendees={() => changeSection("attendees")} />
          ) : null}
          {section === "setup" && eventId && activeUser.current ? (
            <OrganizerSetup
              key={`${activeUser.current}:${eventId}`}
              eventId={eventId}
              userId={activeUser.current}
              onSection={changeSection}
            />
          ) : null}
          {!isRecords &&
          section !== "promotions" &&
          section !== "check-in" &&
          section !== "setup" &&
          eventId &&
          activeUser.current ? (
            <AdminWorkspacePanel
              key={`${activeUser.current}:${eventId}:${section}`}
              eventId={eventId}
              userId={activeUser.current}
              section={section}
            />
          ) : null}
          {!eventId ? (
            <p role="status" aria-live="polite">
              {message}
            </p>
          ) : null}
          {section === "promotions" && eventId && activeUser.current ? (
            <OrganizerPromotions
              key={`${activeUser.current}:${eventId}`}
              eventId={eventId}
              eventName={events.find((event) => event.id === eventId)?.name ?? "Selected event"}
              userId={activeUser.current}
              timeZone={eventClock?.eventId === eventId ? eventClock.timeZone : undefined}
            />
          ) : null}
        </>
      ) : access === "signed_out" ? (
        <p className="checkout-note">
          Your account must already have event access. Contact the TEST installation owner if you
          need organizer access; this screen does not create accounts.
        </p>
      ) : null}
    </OrganizerAdminShell>
  );
}
