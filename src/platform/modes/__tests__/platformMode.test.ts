import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PLATFORM_MODE,
  isPlatformMode,
  resolvePlatformMode,
} from "@/platform/modes/platformMode";

describe("resolvePlatformMode", () => {
  it("defaults to integrated when unset", () => {
    expect(resolvePlatformMode(undefined)).toBe("integrated");
    expect(resolvePlatformMode(null)).toBe("integrated");
    expect(resolvePlatformMode("")).toBe("integrated");
    expect(DEFAULT_PLATFORM_MODE).toBe("integrated");
  });

  it("accepts the supported modes, case/whitespace insensitively", () => {
    expect(resolvePlatformMode("site")).toBe("site");
    expect(resolvePlatformMode(" TICKETING ")).toBe("ticketing");
    expect(resolvePlatformMode("Integrated")).toBe("integrated");
  });

  it("fails safe to integrated and warns in development on invalid values", () => {
    const warn = vi.fn();
    expect(resolvePlatformMode("kiosk", { warn, isDev: true })).toBe("integrated");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("VITE_PLATFORM_MODE");
  });

  it("does not warn outside development", () => {
    const warn = vi.fn();
    expect(resolvePlatformMode(42, { warn, isDev: false })).toBe("integrated");
    expect(warn).not.toHaveBeenCalled();
  });

  it("guards mode values", () => {
    expect(isPlatformMode("site")).toBe(true);
    expect(isPlatformMode("nope")).toBe(false);
  });
});
