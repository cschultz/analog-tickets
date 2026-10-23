/** Narrow provider transport for reading one existing test refund. */
import type { StripeRefundLookupTransport } from "@/lib/refund-status-lookup.server";

const REFUND_URL = /^https:\/\/api\.stripe\.com\/v1\/refunds\/re_[A-Za-z0-9]{8,200}$/;
const MAX_BODY_BYTES = 65_536;

export function createStripeRefundLookupTransport(): StripeRefundLookupTransport {
  return async (request) => {
    if (
      request.method !== "GET" ||
      !REFUND_URL.test(request.url) ||
      !Number.isSafeInteger(request.timeoutMs) ||
      request.timeoutMs < 1 ||
      request.timeoutMs > 20_000
    ) {
      throw new Error("Invalid refund read request");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: "GET",
        headers: request.headers,
        signal: controller.signal,
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400)
        return { status: response.status, body: "" };
      const reader = response.body?.getReader();
      if (!reader) return { status: response.status, body: "" };
      const decoder = new TextDecoder();
      let body = "";
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new Error("Refund read response too large");
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
