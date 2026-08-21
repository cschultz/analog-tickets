import { describe, expect, it } from "vitest";

import {
  isSafeInternalPath,
  resolveExternalRedirect,
  sanitizeInternalPath,
} from "@/lib/safeRedirect";

const ORIGIN = "https://app.example.org";

describe("sanitizeInternalPath", () => {
  it("keeps same-origin app paths including query and hash", () => {
    expect(sanitizeInternalPath("/admin/registrations")).toBe("/admin/registrations");
    expect(sanitizeInternalPath("/tickets?qty=2#summary")).toBe("/tickets?qty=2#summary");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeInternalPath("//evil.test/path")).toBe("/");
    expect(sanitizeInternalPath("/\\evil.test")).toBe("/");
    expect(sanitizeInternalPath("\\\\evil.test")).toBe("/");
  });

  it("rejects unsafe schemes", () => {
    for (const target of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://evil.test/abc",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "https://evil.test",
    ]) {
      expect(sanitizeInternalPath(target)).toBe("/");
    }
  });

  it("rejects control-character smuggling and non-strings", () => {
    expect(sanitizeInternalPath("java\tscript:alert(1)")).toBe("/");
    expect(sanitizeInternalPath("")).toBe("/");
    expect(sanitizeInternalPath(undefined)).toBe("/");
    expect(sanitizeInternalPath({ from: "/admin" })).toBe("/");
  });

  it("honours the provided fallback", () => {
    expect(sanitizeInternalPath("//evil.test", "/auth")).toBe("/auth");
  });

  it("isSafeInternalPath mirrors sanitization", () => {
    expect(isSafeInternalPath("/my-tickets")).toBe(true);
    expect(isSafeInternalPath("//evil.test")).toBe(false);
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
  });
});

describe("resolveExternalRedirect", () => {
  it("allows approved payment hosts", () => {
    expect(
      resolveExternalRedirect("https://checkout.stripe.com/c/pay/cs_test_123", {
        currentOrigin: ORIGIN,
      }),
    ).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
  });

  it("allows subdomains of approved hosts on a label boundary", () => {
    expect(
      resolveExternalRedirect("https://eu.checkout.stripe.com/session", { currentOrigin: ORIGIN }),
    ).toBe("https://eu.checkout.stripe.com/session");
  });

  it("rejects lookalike hosts", () => {
    expect(
      resolveExternalRedirect("https://checkout.stripe.com.evil.test/pay", {
        currentOrigin: ORIGIN,
      }),
    ).toBeNull();
    expect(
      resolveExternalRedirect("https://notstripe.com/pay", { currentOrigin: ORIGIN }),
    ).toBeNull();
  });

  it("allows same-origin absolute and relative targets", () => {
    expect(
      resolveExternalRedirect(`${ORIGIN}/checkout/success`, { currentOrigin: ORIGIN }),
    ).toBe(`${ORIGIN}/checkout/success`);
    expect(resolveExternalRedirect("/checkout/success", { currentOrigin: ORIGIN })).toBe(
      `${ORIGIN}/checkout/success`,
    );
  });

  it("rejects unsafe schemes and protocol-relative URLs", () => {
    for (const target of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://evil.test/abc",
      "//evil.test/path",
      "ftp://evil.test/file",
      "",
      null,
    ]) {
      expect(resolveExternalRedirect(target, { currentOrigin: ORIGIN })).toBeNull();
    }
  });

  it("rejects credential-bearing URLs", () => {
    expect(
      resolveExternalRedirect("https://evil.test@checkout.stripe.com/pay", {
        currentOrigin: ORIGIN,
      }),
    ).toBeNull();
  });

  it("supports opt-in extra allowed hosts", () => {
    expect(
      resolveExternalRedirect("https://partner.example.org/booking", {
        currentOrigin: ORIGIN,
        allowedHosts: ["partner.example.org"],
      }),
    ).toBe("https://partner.example.org/booking");
  });
});
