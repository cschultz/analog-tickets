/**
 * Server-only real transport for the Stripe Checkout adapter.
 *
 * Isolated in its own `*.server.ts` module so the adapter and every test stay
 * transport-free and fully offline: tests inject a mock and never import this
 * file. Nothing here logs, persists, or returns provider payload detail.
 */
import type { StripeTransport } from "@/lib/stripe-checkout.server";
import type { CheckoutReadTransport } from "@/lib/stripe-checkout-lookup.server";

/** Separately gated by the caller. Fixed provider GET endpoint, no body/retry or redirects. */
export function createStripeCheckoutReadTransport(): CheckoutReadTransport {
  return async (req) => {
    const url = new URL(req.url);
    if (
      req.method !== "GET" ||
      url.origin !== "https://api.stripe.com" ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\/v1\/checkout\/sessions(?:\/cs_test_[A-Za-z0-9]{8,200})?$/.test(url.pathname)
    )
      throw new Error("Invalid read target");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(5000, req.timeoutMs));
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: req.headers,
        signal: controller.signal,
        // Workers does not implement redirect:error. Manual never forwards the key.
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400)
        return { status: response.status, body: "" };
      const reader = response.body?.getReader();
      if (!reader) return { status: response.status, body: "" };
      let body = "",
        bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 512 * 1024) {
            await reader.cancel();
            throw new Error("Read body too large");
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        return { status: response.status, body: body + decoder.decode() };
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createStripeFetchTransport(): StripeTransport {
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      return { status: response.status, body: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  };
}
