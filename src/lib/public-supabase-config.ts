export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

/** Local Supabase has no TLS; never allow plain HTTP for a network host. */
export function isSafePublicSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    return (
      (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback)) &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/** A publishable key is browser-safe; secret and service-role keys are not. */
export function parsePublicSupabaseConfig(value: unknown): PublicSupabaseConfig | null {
  if (!value || typeof value !== "object") return null;
  const { url, publishableKey } = value as Record<string, unknown>;
  if (typeof url !== "string" || typeof publishableKey !== "string") return null;
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) return null;
  if (!isSafePublicSupabaseUrl(url)) return null;

  return { url, publishableKey };
}

export function publicSupabaseConfigResponse(env: Record<string, string | undefined>): Response {
  const config = parsePublicSupabaseConfig({
    url: env["SUPABASE_URL"],
    publishableKey: env["SUPABASE_PUBLISHABLE_KEY"],
  });
  return Response.json(config ?? { error: "public_config_unavailable" }, {
    status: config ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
