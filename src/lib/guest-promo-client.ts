/** Guest promo UX. Browser choices are never price authority; no automatic payment or retry. */
import { isUuid } from "./checkout-core";
import { parsePricePreview, parsePromoInput, type PricePreview } from "./guest-promo-core";
import { parseGuestCheckoutContact, type GuestCheckoutContact } from "./guest-checkout-contact";
import { parseStoredPriceQuote, type TestPriceQuote } from "./promotion-pricing-core";
import {
  parseGuestPurchaseReference,
  type GuestPurchaseReference,
} from "./guest-purchase-reference";
import { safeOwnedCheckoutRedirect } from "./owned-checkout-client";
import type { GuestIdentityResult } from "./guest-checkout-identity";

export interface PromoBuyerState {
  phase: "details" | "review" | "saved" | "recover" | "expired" | "blocked" | "redirect";
  busy: boolean;
  message: string;
  preview: PricePreview | null;
  quote: TestPriceQuote | null;
  quantity: number;
  locked: boolean;
}
export interface PromoBuyerDependencies {
  ticketTypeId: string;
  ensureIdentity(allowCreate: boolean): Promise<GuestIdentityResult>;
  getToken(owner: string): Promise<string | null>;
  fetchImpl: typeof fetch;
  storage: {
    read(): unknown;
    write(value: GuestPurchaseReference): void;
    clear(value: GuestPurchaseReference): void;
  };
  navigate(url: string): void;
  newId?: () => string;
  now?: () => number;
  timeoutMs?: number;
}
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const generic = "Checkout is temporarily unavailable. No new payment was requested.";
const recover = "Check this saved checkout before continuing. Do not start another purchase.";
export const promoCheckoutStorageKey = (tier: string) => `analog-promo-purchase-v1:${tier}`;

export function createPromoBuyer(deps: PromoBuyerDependencies) {
  let reference: GuestPurchaseReference | null = null;
  let owner: string | null = null;
  let contact: GuestCheckoutContact | null = null;
  let disposed = false,
    busy = false,
    generation = 0;
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const now = deps.now ?? Date.now;
  let state: PromoBuyerState = Object.freeze({
    phase: "details",
    busy: false,
    message: "",
    preview: null,
    quote: null,
    quantity: 1,
    locked: false,
  });
  function set(patch: Partial<PromoBuyerState>) {
    if (disposed) return;
    state = Object.freeze({
      ...state,
      ...patch,
      locked: Boolean(reference),
      quantity: reference?.quantity ?? patch.quantity ?? state.quantity,
    });
    for (const listener of listeners) listener();
  }
  try {
    const saved = deps.storage.read();
    if (saved != null) {
      reference = parseGuestPurchaseReference(saved);
      if (!reference || reference.ticketTypeId !== deps.ticketTypeId)
        throw new Error("bad reference");
      owner = reference.ownerId;
      set({ phase: "recover", message: recover });
    }
  } catch {
    set({
      phase: "blocked",
      message:
        "The saved checkout could not be read. Recover your tickets before starting another purchase.",
    });
  }
  async function bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), deps.timeoutMs ?? 12000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const current = (stamp: number) => !disposed && stamp === generation;
  async function identity(stamp: number) {
    const result = await bounded(deps.ensureIdentity(!reference));
    if (
      !current(stamp) ||
      !result.ok ||
      !isUuid(result.ownerId) ||
      (owner && owner !== result.ownerId)
    )
      throw new Error("identity unavailable");
    owner = result.ownerId;
  }
  async function request(body: unknown, stamp: number) {
    if (!owner || !current(stamp)) throw new Error("no identity");
    const token = await bounded(deps.getToken(owner));
    if (!token || !current(stamp)) throw new Error("session changed");
    const controller = new AbortController();
    active = controller;
    try {
      return await bounded(
        (async () => {
          const response = await deps.fetchImpl("/api/public/guest-promo-checkout", {
            method: "POST",
            cache: "no-store",
            redirect: "error",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          return { status: response.status, body: object(await response.json()) };
        })(),
      );
    } finally {
      controller.abort();
      if (active === controller) active = null;
    }
  }
  async function run(work: (stamp: number) => Promise<void>) {
    if (disposed || busy || state.phase === "blocked" || state.phase === "redirect") return;
    busy = true;
    const stamp = generation;
    set({ busy: true, message: "Checking your order…" });
    try {
      await identity(stamp);
      if (current(stamp)) await work(stamp);
    } catch {
      if (current(stamp))
        set({
          phase: reference ? "recover" : "details",
          preview: null,
          message: reference ? recover : generic,
        });
    } finally {
      if (current(stamp)) {
        busy = false;
        set({ busy: false });
      }
    }
  }
  async function getPreview(quantity: number, code: string | null, stamp: number) {
    const input = parsePromoInput({
      action: "preview",
      ticketTypeId: deps.ticketTypeId,
      quantity,
      code,
    });
    if (!input || input.action !== "preview") {
      set({
        phase: "details",
        preview: null,
        message: "Enter a valid ticket quantity and promo code.",
      });
      return null;
    }
    const result = await request(input, stamp);
    if (!current(stamp)) return null;
    const price =
      result.status === 200 && result.body?.["ok"] === true && result.body["status"] === "preview"
        ? parsePricePreview(result.body["value"])
        : null;
    if (
      !price ||
      price.ticketTypeId !== deps.ticketTypeId ||
      price.quantity !== quantity ||
      price.code !== input.code
    ) {
      set({
        phase: "details",
        preview: null,
        message:
          result.body?.["code"] === "promotion_unavailable"
            ? "This code is not available for this order. Try another code or remove it."
            : result.body?.["code"] === "unsupported_paid_total"
              ? "Free orders and totals below USD 0.50 are not supported by this TEST checkout."
              : "The current price could not be checked. Please try again before paying.",
      });
      return null;
    }
    const snapshot = Object.freeze({ ...price });
    set({ preview: snapshot, quote: null, quantity });
    return snapshot;
  }
  function edit() {
    if (disposed || busy || reference || state.phase === "blocked") return;
    contact = null;
    set({ phase: "details", preview: null, quote: null, message: "" });
  }
  async function preview(quantity: number, code: string | null) {
    if (reference) return;
    contact = null;
    await run(async (stamp) => {
      const price = await getPreview(quantity, code, stamp);
      if (price && current(stamp))
        set({
          phase: "details",
          message: price.code
            ? "Promo code applied. Review your total before payment."
            : "Current price checked. No promo code applied.",
        });
    });
  }
  async function review(input: {
    quantity: number;
    code: string | null;
    contact: GuestCheckoutContact;
  }) {
    if (reference) return;
    const parsed = parseGuestCheckoutContact(input.contact);
    if (!parsed || !parsed.email.toLowerCase().endsWith("@example.test")) {
      set({ message: "Enter your name and a synthetic @example.test email." });
      return;
    }
    await run(async (stamp) => {
      const price = await getPreview(input.quantity, input.code, stamp);
      if (price && current(stamp)) {
        contact = parsed;
        set({
          phase: "review",
          message: "Review this total, then continue to Stripe TEST payment.",
        });
      }
    });
  }
  async function restore() {
    if (!reference) return;
    await run(async (stamp) => {
      const result = await request({ action: "read", cartId: reference!.cartId }, stamp);
      if (!current(stamp)) return;
      if (
        result.status === 200 &&
        result.body?.["ok"] === true &&
        result.body["status"] === "expiry" &&
        object(result.body["value"])?.["status"] === "released"
      ) {
        finishReleased();
        return;
      }
      const quote =
        result.status === 200 && result.body?.["ok"] === true && result.body["status"] === "ready"
          ? parseStoredPriceQuote(result.body["value"])
          : null;
      if (
        !quote ||
        quote.ticketTypeId !== reference!.ticketTypeId ||
        quote.quantity !== reference!.quantity
      )
        throw new Error("saved quote unavailable");
      set({
        quote,
        preview: null,
        phase: quote.expiresAtMs > now() ? "saved" : "expired",
        message:
          quote.expiresAtMs > now()
            ? "Your original price is saved. Continue this checkout, or recover your tickets if you already paid."
            : "This saved checkout has expired. Check whether it can be safely released, or recover your tickets if you paid. Do not pay again.",
      });
    });
  }
  async function pay() {
    if (state.phase !== "review" && state.phase !== "saved") return;
    const reviewed = state.preview;
    const buyer = contact;
    await run(async (stamp) => {
      if (!reference) {
        if (!reviewed || !buyer || !owner) throw new Error("no review");
        const candidate = parseGuestPurchaseReference({
          version: 1,
          ownerId: owner,
          cartId: (deps.newId ?? (() => crypto.randomUUID()))(),
          ticketTypeId: deps.ticketTypeId,
          quantity: reviewed.quantity,
        });
        if (!candidate) throw new Error("invalid cart");
        // Durable no-contact reference BEFORE a potentially committed request.
        deps.storage.write(candidate);
        reference = candidate;
        const result = await request(
          {
            action: "prepare",
            cartId: candidate.cartId,
            ticketTypeId: candidate.ticketTypeId,
            quantity: candidate.quantity,
            contact: buyer,
            code: reviewed.code,
            revision: reviewed.revision,
          },
          stamp,
        );
        if (!current(stamp)) return;
        contact = null;
        if (
          result.status === 409 &&
          result.body?.["ok"] === false &&
          ["review_required", "promotion_unavailable", "unsupported_paid_total"].includes(
            String(result.body["code"]),
          )
        ) {
          // The atomic prepare explicitly refused/rolled back this newly authored cart.
          // Never clear a restored or uncertain reference on a generic failure.
          deps.storage.clear(candidate);
          reference = null;
          set({
            phase: "details",
            preview: null,
            quote: null,
            message:
              result.body["code"] === "review_required"
                ? "The price changed. Review the updated total before continuing."
                : "This code or total is no longer available. Review your order again.",
          });
          return;
        }
        const quote =
          result.status === 200 && result.body?.["ok"] === true && result.body["status"] === "ready"
            ? parseStoredPriceQuote(result.body["value"])
            : null;
        if (
          !quote ||
          quote.ticketTypeId !== reviewed.ticketTypeId ||
          quote.quantity !== reviewed.quantity ||
          quote.unitPriceCents !== reviewed.unitPriceCents ||
          quote.subtotalCents !== reviewed.subtotalCents ||
          quote.discountCents !== reviewed.discountCents ||
          quote.totalCents !== reviewed.totalCents ||
          (quote.discount?.code ?? null) !== reviewed.code
        )
          throw new Error("quote changed");
        set({ quote, preview: null, phase: "saved" });
      }
      if (!state.quote || state.quote.expiresAtMs <= now()) throw new Error("quote expired");
      const result = await request({ action: "pay", cartId: reference!.cartId }, stamp);
      if (!current(stamp)) return;
      const value =
        result.status === 200 && result.body?.["ok"] === true && result.body["status"] === "payment"
          ? object(result.body["value"])
          : null;
      if (value?.["status"] === "complete") {
        set({
          phase: "redirect",
          message:
            "Opening your order status. Tickets are confirmed by verified payment, not this page.",
        });
        deps.navigate("/checkout/complete");
        return;
      }
      if (value?.["status"] === "released") {
        finishReleased();
        return;
      }
      const url =
        value?.["status"] === "redirect" ? safeOwnedCheckoutRedirect(value["redirectUrl"]) : null;
      if (!url) throw new Error("payment outcome unknown");
      set({ phase: "redirect", message: "Opening Stripe TEST payment…" });
      deps.navigate(url);
    });
  }
  async function expire() {
    if (!reference || state.phase !== "expired") return;
    await run(async (stamp) => {
      const result = await request({ action: "expire", cartId: reference!.cartId }, stamp);
      if (!current(stamp)) return;
      const value =
        result.status === 200 && result.body?.["ok"] === true && result.body["status"] === "expiry"
          ? object(result.body["value"])
          : null;
      if (value?.["status"] !== "released") {
        set({
          phase: "expired",
          message:
            "This checkout could not be proved unused. Recover your tickets or contact the organizer; do not pay again.",
        });
        return;
      }
      finishReleased();
    });
  }
  function finishReleased() {
    deps.storage.clear(reference!);
    reference = null;
    contact = null;
    set({
      phase: "details",
      quote: null,
      preview: null,
      message: "The unused checkout was released. Review a new order before continuing to payment.",
    });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    preview,
    review,
    pay,
    restore,
    edit,
    expire,
    sessionChanged(next: string | null) {
      if (disposed || !owner || next === owner) return;
      generation++;
      busy = false;
      active?.abort();
      contact = null;
      set({
        phase: "blocked",
        busy: false,
        preview: null,
        quote: null,
        message: "Your session changed. Recover the saved purchase before continuing.",
      });
    },
    activate() {
      disposed = false;
    },
    dispose() {
      disposed = true;
      generation++;
      busy = false;
      active?.abort();
      contact = null;
      listeners.clear();
      state = Object.freeze({
        ...state,
        busy: false,
        preview: null,
        quote: null,
        phase: reference ? "recover" : state.phase === "blocked" ? "blocked" : "details",
      });
    },
  };
}
