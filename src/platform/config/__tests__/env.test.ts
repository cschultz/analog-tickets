import { describe, it, expect } from "vitest";
import {
  getPublicEnv,
  requirePublicEnv,
  hasRequiredPublicEnv,
  getSupabaseUrl,
  getSupabaseOrigin,
  getFunctionUrl,
  getPublicStorageUrl,
  getPlatformModeSetting,
  getProductionHosts,
} from "../env";

const VALID = {
  VITE_SUPABASE_URL: "https://example-project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
  VITE_SUPABASE_PROJECT_ID: "example-project",
};

describe("public env module", () => {
  it("importing the module does not throw without configuration", () => {
    expect(() => getPublicEnv({})).not.toThrow();
    expect(getPublicEnv({}).supabaseUrl).toBe("");
    expect(hasRequiredPublicEnv({})).toBe(false);
  });

  it("accepts valid placeholder configuration", () => {
    const parsed = requirePublicEnv(VALID);
    expect(parsed.VITE_SUPABASE_URL).toBe(VALID.VITE_SUPABASE_URL);
    expect(hasRequiredPublicEnv(VALID)).toBe(true);
  });

  it("throws a remixer-facing error when required config is missing", () => {
    expect(() => requirePublicEnv({})).toThrow(/VITE_SUPABASE_URL is required/);
    expect(() => requirePublicEnv({})).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY is required/);
    expect(() => requirePublicEnv({})).toThrow(/\.env\.example/);
  });

  it("rejects a malformed URL and never echoes the value", () => {
    const bad = { ...VALID, VITE_SUPABASE_URL: "not-a-url" };
    try {
      requirePublicEnv(bad);
      throw new Error("expected throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/absolute http\(s\) URL/);
      expect(message).not.toContain("not-a-url");
      expect(message).not.toContain(VALID.VITE_SUPABASE_PUBLISHABLE_KEY);
    }
  });

  it("derives URLs from the configured base", () => {
    const source = { ...VALID, VITE_SUPABASE_URL: "https://example-project.supabase.co/" };
    expect(getSupabaseUrl(source)).toBe("https://example-project.supabase.co");
    expect(getSupabaseOrigin(source)).toBe("https://example-project.supabase.co");
    expect(getFunctionUrl("do-thing", source)).toBe(
      "https://example-project.supabase.co/functions/v1/do-thing",
    );
    expect(getPublicStorageUrl("/bucket/path", source)).toBe(
      "https://example-project.supabase.co/storage/v1/object/public/bucket/path",
    );
  });

  it("returns empty derived URLs when the backend is unconfigured", () => {
    expect(getSupabaseOrigin({})).toBe("");
    expect(getFunctionUrl("do-thing", {})).toBe("");
    expect(getPublicStorageUrl("bucket/path", {})).toBe("");
  });

  it("defaults optional mode and host settings", () => {
    expect(getPlatformModeSetting(VALID)).toBeUndefined();
    expect(getProductionHosts(VALID)).toEqual([]);
    expect(getPublicEnv(VALID).enableTesting).toBe(false);

    const withOptional = {
      ...VALID,
      VITE_PLATFORM_MODE: " ticketing ",
      VITE_PRODUCTION_HOSTS: "Example.test, www.example.test ,",
      VITE_ENABLE_TESTING: "true",
    };
    expect(getPlatformModeSetting(withOptional)).toBe("ticketing");
    expect(getProductionHosts(withOptional)).toEqual(["example.test", "www.example.test"]);
    expect(getPublicEnv(withOptional).enableTesting).toBe(true);
  });
});
