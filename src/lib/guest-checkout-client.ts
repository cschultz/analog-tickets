/** Guest purchase orchestration; injected I/O, explicit actions, no payment proof. */
import { isUuid, MAX_CHECKOUT_QUANTITY } from "./checkout-core";
import { parseGuestCheckoutContact, type GuestCheckoutContact } from "./guest-checkout-contact";
import { safeOwnedCheckoutRedirect } from "./owned-checkout-client";
import { OWNED_RESERVATION_MAX_REMAINING_MS } from "./owned-reservation-core";
import type { GuestIdentityResult } from "./guest-checkout-identity";

interface Reference {
  version: 1;
  ownerId: string;
  cartId: string;
  ticketTypeId: string;
  quantity: number;
}
export interface GuestPurchaseState {
  phase: "details" | "working" | "resume" | "blocked" | "redirect";
  message: string;
  quantity: number;
  quantityLocked: boolean;
}
export interface GuestPurchaseDependencies {
  ticketTypeId: string;
  ensureIdentity(allowCreate: boolean): Promise<GuestIdentityResult>;
  getToken(ownerId: string): Promise<string | null>;
  fetchImpl: typeof fetch;
  storage: { read(): unknown; write(value: Reference): void };
  navigate(url: string): void;
  newId?: () => string;
  now?: () => number;
  timeoutMs?: number;
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const quantityValid = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= MAX_CHECKOUT_QUANTITY;

export function createGuestPurchase(deps: GuestPurchaseDependencies) {
  let reference: Reference | null = null;
  let state: GuestPurchaseState = {
    phase: "details",
    message: "",
    quantity: 1,
    quantityLocked: false,
  };
  let busy = false,
    disposed = false,
    generation = 0;
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const now = deps.now ?? Date.now;
  const set = (phase: GuestPurchaseState["phase"], message: string) => {
    if (disposed) return;
    state = {
      phase,
      message,
      quantity: reference?.quantity ?? state.quantity,
      quantityLocked: Boolean(reference),
    };
    for (const listener of listeners) listener();
  };
  try {
    const saved = deps.storage.read();
    if (saved !== null && saved !== undefined) {
      const r = record(saved);
      if (
        !r ||
        Object.keys(r).length !== 5 ||
        r["version"] !== 1 ||
        !isUuid(r["ownerId"]) ||
        !isUuid(r["cartId"]) ||
        r["ticketTypeId"] !== deps.ticketTypeId ||
        !quantityValid(r["quantity"])
      )
        throw new Error("invalid reference");
      reference = {
        version: 1,
        ownerId: r["ownerId"],
        cartId: r["cartId"],
        ticketTypeId: deps.ticketTypeId,
        quantity: r["quantity"],
      };
      set(
        "resume",
        "An earlier checkout is saved. Resume it to check its current status before starting anything else.",
      );
    }
  } catch {
    set(
      "blocked",
      "Your saved checkout could not be read. Keep this page and contact the organizer before trying another purchase.",
    );
  }

  async function bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("deadline")), deps.timeoutMs ?? 12000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function request(path: string, body: unknown) {
    const stamp = generation;
    if (disposed || !reference) throw new Error("unavailable");
    const token = await bounded(deps.getToken(reference.ownerId));
    if (disposed || stamp !== generation || !token) throw new Error("session changed");
    const controller = new AbortController();
    active = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await deps.fetchImpl(path, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          return { status: response.status, body: record(await response.json()) };
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("deadline"));
          }, deps.timeoutMs ?? 12000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (active === controller) active = null;
    }
  }
  const validDeadline = (value: unknown): value is string =>
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) > now() &&
    Date.parse(value) - now() <= OWNED_RESERVATION_MAX_REMAINING_MS;

  async function continuePurchase(input?: {
    quantity: number;
    contact: GuestCheckoutContact;
  }): Promise<void> {
    if (busy || disposed || state.phase === "blocked" || state.phase === "redirect") return;
    let contact = input ? parseGuestCheckoutContact(input.contact) : null;
    if (
      input &&
      (!quantityValid(input.quantity) ||
        !contact ||
        !contact.email.toLowerCase().endsWith("@example.test") ||
        (reference && input.quantity !== reference.quantity))
    ) {
      set(
        reference ? "resume" : "details",
        "Enter your name, a synthetic @example.test email and a valid ticket quantity.",
      );
      return;
    }
    if (!reference && !input) {
      set("details", "Enter your contact details to continue.");
      return;
    }
    busy = true;
    const stamp = generation;
    const current = () => !disposed && generation === stamp;
    const restoring = Boolean(reference);
    set("working", restoring ? "Checking your existing checkout…" : "Preparing your checkout…");
    try {
      const identity = await bounded(deps.ensureIdentity(!restoring));
      if (!current()) return;
      if (!identity.ok || (reference && reference.ownerId !== identity.ownerId)) {
        set(
          "blocked",
          "Your checkout session is unavailable or has changed. No replacement purchase was started.",
        );
        return;
      }
      if (!reference) {
        const id = (deps.newId ?? (() => crypto.randomUUID()))();
        if (!isUuid(id) || !isUuid(deps.ticketTypeId) || !input) throw new Error("invalid choice");
        reference = {
          version: 1,
          ownerId: identity.ownerId,
          cartId: id,
          ticketTypeId: deps.ticketTypeId,
          quantity: input.quantity,
        };
        // Persist before the first cart/provider transport, without contact or bearer.
        try {
          deps.storage.write(reference);
        } catch {
          set(
            "blocked",
            "Your checkout reference could not be saved. Nothing was reserved; please enable browser storage before continuing.",
          );
          return;
        }
      }
      let reservationId: string | null = null;
      let resume = false;
      if (restoring) {
        // Select this exact cart for the fixed Stripe return URL as well.
        // If storage fails, do not request another payment handoff.
        deps.storage.write(reference);
        const result = await request("/api/public/lookup-guest-cart", { cartId: reference.cartId });
        if (!current()) return;
        const cart = result.body;
        if (result.status !== 200 || !cart) throw new Error("lookup unavailable");
        if (cart["status"] === "found") {
          const storedContact = parseGuestCheckoutContact(cart["contact"]);
          if (
            cart["cartId"] !== reference.cartId ||
            cart["ticketTypeId"] !== reference.ticketTypeId ||
            cart["quantity"] !== reference.quantity ||
            !isUuid(cart["reservationId"]) ||
            !storedContact ||
            !storedContact.email.toLowerCase().endsWith("@example.test")
          )
            throw new Error("cart mismatch");
          if (cart["phase"] === "closed" || !validDeadline(cart["expiresAt"])) {
            set(
              "blocked",
              "This checkout is no longer open. Its payment or ticket status must be checked before another purchase.",
            );
            return;
          }
          if (cart["phase"] !== "ready" && cart["phase"] !== "pending")
            throw new Error("cart phase");
          if (
            contact &&
            (contact.name !== storedContact.name || contact.email !== storedContact.email)
          ) {
            set(
              "blocked",
              "The saved checkout has different contact details. Please ask the organizer to correct that checkout; no replacement was created.",
            );
            return;
          }
          contact = storedContact;
          reservationId = cart["reservationId"];
          resume = cart["phase"] === "pending";
        } else if (cart["status"] !== "missing") throw new Error("unknown lookup");
      }
      if (!reservationId) {
        if (!contact) {
          set(
            "details",
            "Re-enter the original contact details to recover this saved checkout. Your ticket quantity is unchanged.",
          );
          return;
        }
        const prepared = await request("/api/public/prepare-guest-cart", {
          cartId: reference.cartId,
          ticketTypeId: reference.ticketTypeId,
          quantity: reference.quantity,
          contact,
        });
        if (!current()) return;
        const cart = prepared.body;
        if (
          prepared.status !== 200 ||
          cart?.["ok"] !== true ||
          cart["status"] !== "ready" ||
          cart["cartId"] !== reference.cartId ||
          !isUuid(cart["reservationId"]) ||
          !validDeadline(cart["expiresAt"])
        )
          throw new Error("cart unavailable");
        reservationId = cart["reservationId"];
      }
      const checkout = await request("/api/public/create-checkout-attempt", {
        ticketTypeId: reference.ticketTypeId,
        quantity: reference.quantity,
        reservationId,
        ...(resume ? { resume: true } : {}),
      });
      if (!current()) return;
      const url =
        checkout.status === 200 &&
        checkout.body?.["ok"] === true &&
        checkout.body["status"] === "redirect"
          ? safeOwnedCheckoutRedirect(checkout.body["redirectUrl"])
          : null;
      if (!url) throw new Error("payment link uncertain");
      set("redirect", "Opening Stripe TEST payment. Payment and tickets are not confirmed yet.");
      try {
        deps.navigate(url);
      } catch {
        set(
          "resume",
          "The payment page could not open. Resume this checkout to recover the same payment link.",
        );
      }
    } catch {
      if (current())
        set(
          reference ? "resume" : "details",
          reference
            ? "We could not confirm the next step. Resume this same checkout; do not start another purchase."
            : "Checkout is temporarily unavailable. No payment was requested.",
        );
    } finally {
      if (stamp === generation) busy = false;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    continue: continuePurchase,
    sessionChanged(ownerId: string | null) {
      if (disposed || !reference || reference.ownerId === ownerId) return;
      generation++;
      busy = false;
      active?.abort();
      set(
        "blocked",
        "This saved checkout belongs to a different session. Recover it before starting another purchase.",
      );
    },
    activate() {
      disposed = false;
    },
    dispose() {
      disposed = true;
      generation++;
      busy = false;
      active?.abort();
      listeners.clear();
    },
  };
}
