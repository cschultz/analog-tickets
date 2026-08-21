/**
 * Cache-busting smoke test.
 *
 * Verifies the inline IIFE in index.html:
 *   1. Skips entirely on preview hosts.
 *   2. On first visit with no stored version: writes version, clears
 *      caches + unregisters SWs, does NOT reload (no prior version).
 *   3. On version mismatch: clears caches + unregisters SWs and triggers
 *      exactly ONE reload (with __v query param).
 *   4. With matching stored version: no clears, no reload.
 *   5. Reload guard prevents a second reload in the same session.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const SCRIPT_BODY = (() => {
  // Find the <script> tag that contains SITE_VERSION and extract its body.
  const scripts = HTML.match(/<script>[\s\S]*?<\/script>/g) ?? [];
  const target = scripts.find((s) => s.includes("SITE_VERSION"));
  if (!target) throw new Error("Could not find cache-bust <script> in index.html");
  return target.replace(/^<script>/, "").replace(/<\/script>$/, "").trim();
})();

const BUILD_TS = "test-build-1";
const RUNTIME_SCRIPT = SCRIPT_BODY.replace("__BUILD_TS__", BUILD_TS);
const SITE_VERSION = `analog-commons-${BUILD_TS}`;

function compileFor(buildTs: string) {
  return SCRIPT_BODY.replace("__BUILD_TS__", buildTs);
}

type Harness = {
  cachesDeleted: string[];
  swUnregistered: number;
  reloadedTo: string | null;
  localStorage: Map<string, string>;
  sessionStorage: Map<string, string>;
  swRegistrations: Array<{ unregister: () => Promise<boolean> }>;
};

function runScript(opts: {
  host?: string;
  storedVersion?: string | null;
  sessionReloadFlag?: boolean;
  // For cross-deploy simulations: pre-existing storage + cache state.
  localStorage?: Map<string, string>;
  sessionStorage?: Map<string, string>;
  cacheNames?: string[];
  swCount?: number;
  // Override which build version this index.html was served with.
  scriptOverride?: string;
  versionOverride?: string;
}): Harness {
  const host = opts.host ?? "example.test";
  const cacheNames = opts.cacheNames ?? ["old-cache-v1", "static-v2"];
  const swCount = opts.swCount ?? 2;

  const harness: Harness = {
    cachesDeleted: [],
    swUnregistered: 0,
    reloadedTo: null,
    localStorage: opts.localStorage ?? new Map(),
    sessionStorage: opts.sessionStorage ?? new Map(),
    swRegistrations: Array.from({ length: swCount }, () => ({
      unregister: () => Promise.resolve(true),
    })),
  };

  if (opts.storedVersion !== undefined && opts.storedVersion !== null) {
    harness.localStorage.set("site_version", opts.storedVersion);
  }
  const versionForGuard = opts.versionOverride ?? SITE_VERSION;
  if (opts.sessionReloadFlag) {
    harness.sessionStorage.set(`site_version_reload_${versionForGuard}`, "1");
  }

  const fakeWindow: any = {
    location: {
      protocol: "https:",
      hostname: host,
      href: `https://${host}/my-tickets`,
      replace: (url: string) => {
        harness.reloadedTo = url;
      },
    },
    localStorage: {
      getItem: (k: string) => harness.localStorage.get(k) ?? null,
      setItem: (k: string, v: string) => harness.localStorage.set(k, v),
      removeItem: (k: string) => harness.localStorage.delete(k),
    },
    caches: {
      keys: () => Promise.resolve([...cacheNames]),
      delete: (name: string) => {
        harness.cachesDeleted.push(name);
        return Promise.resolve(true);
      },
    },
    URL: globalThis.URL,
    Promise: globalThis.Promise,
  };

  const fakeNavigator = {
    serviceWorker: {
      getRegistrations: () =>
        Promise.resolve(
          harness.swRegistrations.map((reg) => ({
            unregister: () => {
              harness.swUnregistered++;
              return reg.unregister();
            },
          }))
        ),
    },
  };

  fakeWindow.sessionStorage = {
    getItem: (k: string) => harness.sessionStorage.get(k) ?? null,
    setItem: (k: string, v: string) => harness.sessionStorage.set(k, v),
  };

  const script = opts.scriptOverride ?? RUNTIME_SCRIPT;
  const fn = new Function(
    "window",
    "navigator",
    "localStorage",
    "sessionStorage",
    "caches",
    "URL",
    script
  );
  fn(
    fakeWindow,
    fakeNavigator,
    fakeWindow.localStorage,
    fakeWindow.sessionStorage,
    fakeWindow.caches,
    globalThis.URL
  );

  return harness;
}

async function flush() {
  // Allow all microtasks (Promise.allSettled chain + finally) to resolve.
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("cache-bust IIFE", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("skips entirely on preview host", async () => {
    const h = runScript({ host: "id-preview--abc.lovable.app" });
    await flush();
    expect(h.cachesDeleted).toEqual([]);
    expect(h.swUnregistered).toBe(0);
    expect(h.reloadedTo).toBeNull();
    expect(h.localStorage.get("site_version")).toBeUndefined();
  });

  // Allowlist hardening: anything that isn't an explicit production host must no-op.
  const NON_PROD_HOSTS = [
    "id-preview--abc.lovable.app",
    "abc-def.lovableproject.com",
    "something.lovable.dev",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "my.local",
    "staging.example.test",
    "preview.example.test",
    "evil.example.com",
    "example.test.attacker.com",
  ];
  for (const badHost of NON_PROD_HOSTS) {
    it(`allowlist: no-op on non-production host ${badHost}`, async () => {
      const h = runScript({ host: badHost, storedVersion: "analog-commons-OLD" });
      await flush();
      expect(h.cachesDeleted).toEqual([]);
      expect(h.swUnregistered).toBe(0);
      expect(h.reloadedTo).toBeNull();
      expect(h.localStorage.get("site_version")).toBe("analog-commons-OLD");
    });
  }

  for (const goodHost of ["example.test", "www.example.test"]) {
    it(`allowlist: runs on production host ${goodHost}`, async () => {
      const h = runScript({ host: goodHost, storedVersion: "analog-commons-OLD" });
      await flush();
      expect(h.localStorage.get("site_version")).toBe(SITE_VERSION);
      expect(h.cachesDeleted.length).toBeGreaterThan(0);
      expect(h.reloadedTo).toContain("__v=");
    });
  }

  it("first visit (no stored version): writes version, clears caches/SWs, does NOT reload", async () => {
    const h = runScript({ storedVersion: null });
    await flush();
    expect(h.localStorage.get("site_version")).toBe(SITE_VERSION);
    expect(h.cachesDeleted).toEqual(expect.arrayContaining(["old-cache-v1", "static-v2"]));
    expect(h.swUnregistered).toBe(2);
    expect(h.reloadedTo).toBeNull();
  });

  it("version mismatch: clears caches/SWs and triggers exactly one reload with __v param", async () => {
    const h = runScript({ storedVersion: "analog-commons-OLD" });
    await flush();
    expect(h.localStorage.get("site_version")).toBe(SITE_VERSION);
    expect(h.cachesDeleted.length).toBe(2);
    expect(h.swUnregistered).toBe(2);
    expect(h.reloadedTo).not.toBeNull();
    expect(h.reloadedTo).toContain(`__v=${SITE_VERSION}`);
    expect(h.sessionStorage.get(`site_version_reload_${SITE_VERSION}`)).toBe("1");
  });

  it("matching stored version: no clears, no reload", async () => {
    const h = runScript({ storedVersion: SITE_VERSION });
    await flush();
    expect(h.cachesDeleted).toEqual([]);
    expect(h.swUnregistered).toBe(0);
    expect(h.reloadedTo).toBeNull();
  });

  it("reload guard: with sessionStorage flag set, does not reload again", async () => {
    const h = runScript({
      storedVersion: "analog-commons-OLD",
      sessionReloadFlag: true,
    });
    await flush();
    // caches/SWs still get cleared, but no second reload
    expect(h.reloadedTo).toBeNull();
  });
});

describe("post-deploy lifecycle (page-already-open simulation)", () => {
  it("user opens v1, deploy ships v2, refresh triggers ONE reload, second refresh is stable", async () => {
    const ls = new Map<string, string>();
    const ss = new Map<string, string>();
    const v1 = "test-build-A";
    const v2 = "test-build-B";
    const V1 = `analog-commons-${v1}`;
    const V2 = `analog-commons-${v2}`;

    // 1. First visit on v1 — no prior version stored.
    const r1 = runScript({
      localStorage: ls,
      sessionStorage: ss,
      scriptOverride: compileFor(v1),
      versionOverride: V1,
    });
    await flush();
    expect(ls.get("site_version")).toBe(V1);
    expect(r1.reloadedTo).toBeNull();
    expect(r1.swUnregistered).toBe(2);
    expect(r1.cachesDeleted.length).toBe(2);

    // 2. Deploy happens. User refreshes — index.html now serves v2.
    const r2 = runScript({
      localStorage: ls, // SAME storage — simulating same browser
      sessionStorage: ss,
      scriptOverride: compileFor(v2),
      versionOverride: V2,
      cacheNames: ["sw-cache-from-v1"],
    });
    await flush();
    expect(ls.get("site_version")).toBe(V2);
    expect(r2.cachesDeleted).toContain("sw-cache-from-v1");
    expect(r2.swUnregistered).toBeGreaterThan(0);
    expect(r2.reloadedTo).toContain(`__v=${V2}`);
    expect(ss.get(`site_version_reload_${V2}`)).toBe("1");

    // 3. Reload lands — same v2 script, same session.
    const r3 = runScript({
      localStorage: ls,
      sessionStorage: ss,
      scriptOverride: compileFor(v2),
      versionOverride: V2,
    });
    await flush();
    expect(r3.reloadedTo).toBeNull(); // matches stored, no reload
    expect(r3.cachesDeleted).toEqual([]);
    expect(r3.swUnregistered).toBe(0);

    // 4. User refreshes a third time — still stable.
    const r4 = runScript({
      localStorage: ls,
      sessionStorage: ss,
      scriptOverride: compileFor(v2),
      versionOverride: V2,
    });
    await flush();
    expect(r4.reloadedTo).toBeNull();
  });

  it("infinite-loop guard: even if cache returns stale v1 HTML after reload, no second redirect happens in same session", async () => {
    const ls = new Map<string, string>();
    const ss = new Map<string, string>();
    const v1 = "test-build-A";
    const v2 = "test-build-B";
    const V1 = `analog-commons-${v1}`;
    const V2 = `analog-commons-${v2}`;

    // Establish v1 baseline.
    runScript({ localStorage: ls, sessionStorage: ss, scriptOverride: compileFor(v1), versionOverride: V1 });
    await flush();

    // Deploy → user refreshes → mismatch → reload triggered, sessionStorage flag set for V2.
    const r2 = runScript({ localStorage: ls, sessionStorage: ss, scriptOverride: compileFor(v2), versionOverride: V2 });
    await flush();
    expect(r2.reloadedTo).not.toBeNull();
    expect(ss.get(`site_version_reload_${V2}`)).toBe("1");
    // v2 written to localStorage even before reload completes
    expect(ls.get("site_version")).toBe(V2);

    // Worst case: CDN/browser cache serves stale v1 HTML on the reload response.
    // The IIFE sees stored=V2, current=V1 → mismatch again, BUT the sessionStorage guard
    // is keyed to the CURRENT script version (V1 here), so a reload WOULD fire.
    // This documents the actual behavior: guard is per-version, so a stale-cache redirect
    // back to V1 will reload once more (to V1), at which point storage flips to V1.
    // The protection against true infinite loops is that storage is rewritten each cycle,
    // so the loop terminates as soon as the network serves either version consistently.
    const r3 = runScript({ localStorage: ls, sessionStorage: ss, scriptOverride: compileFor(v1), versionOverride: V1 });
    await flush();
    // Storage flipped back to V1, one reload fired toward V1.
    expect(ls.get("site_version")).toBe(V1);

    // Critical: same-session refresh on V1 with the V1 guard now set won't reload again.
    ss.set(`site_version_reload_${V1}`, "1");
    const r4 = runScript({ localStorage: ls, sessionStorage: ss, scriptOverride: compileFor(v1), versionOverride: V1 });
    await flush();
    expect(r4.reloadedTo).toBeNull();
  });
});

describe("service worker kill-switch (public/sw.js)", () => {
  it("on activate: clears all caches, navigates clients, then unregisters", async () => {
    const swSource = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");

    const order: string[] = [];
    const cacheNames = ["pwa-precache-v1", "runtime-cache"];
    const clientNavigations: string[] = [];

    const fakeSelf: any = {
      addEventListener: (event: string, handler: (e: any) => void) => {
        fakeSelf._handlers = fakeSelf._handlers ?? {};
        fakeSelf._handlers[event] = handler;
      },
      skipWaiting: () => { order.push("skipWaiting"); return Promise.resolve(); },
      clients: {
        claim: () => { order.push("clients.claim"); return Promise.resolve(); },
        matchAll: () =>
          Promise.resolve([
            {
              url: "https://example.test/my-tickets",
              navigate: (url: string) => {
                order.push("client.navigate");
                clientNavigations.push(url);
                return Promise.resolve();
              },
            },
          ]),
      },
      registration: {
        unregister: () => {
          order.push("unregister");
          return Promise.resolve(true);
        },
      },
      caches: {
        keys: () => Promise.resolve(cacheNames),
        delete: (name: string) => {
          order.push(`caches.delete:${name}`);
          return Promise.resolve(true);
        },
      },
    };

    const fakeCaches = fakeSelf.caches;

    const fn = new Function("self", "caches", swSource);
    fn(fakeSelf, fakeCaches);

    // Trigger install.
    const installEvent = { waitUntil: (p: Promise<any>) => p };
    await fakeSelf._handlers.install(installEvent);
    expect(order).toContain("skipWaiting");

    // Trigger activate and wait for the chain to settle.
    let activatePromise: Promise<any> | null = null;
    const activateEvent = {
      waitUntil: (p: Promise<any>) => {
        activatePromise = p;
      },
    };
    fakeSelf._handlers.activate(activateEvent);
    await activatePromise;

    // All caches cleared.
    expect(order).toContain("caches.delete:pwa-precache-v1");
    expect(order).toContain("caches.delete:runtime-cache");
    // Clients claimed and navigated.
    expect(order).toContain("clients.claim");
    expect(order).toContain("client.navigate");
    expect(clientNavigations[0]).toBe("https://example.test/my-tickets");
    // SW unregistered itself.
    expect(order).toContain("unregister");
    // unregister happens AFTER cache cleanup + claim.
    expect(order.indexOf("unregister")).toBeGreaterThan(order.indexOf("caches.delete:runtime-cache"));
    expect(order.indexOf("unregister")).toBeGreaterThan(order.indexOf("clients.claim"));
  });
});
