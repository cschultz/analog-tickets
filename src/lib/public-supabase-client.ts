/**
 * Browser-safe app client. Keep this outside Lovable's generated integration:
 * a remix can replace that file and remove our runtime configuration setter.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { brokeredPreviewStorage } from "./preview-auth-storage";
import { parsePublicSupabaseConfig, type PublicSupabaseConfig } from "./public-supabase-config";

let runtimeConfig: PublicSupabaseConfig | null = null;
let client: ReturnType<typeof createPublicSupabaseClient> | undefined;

export function setPublicSupabaseConfig(value: unknown): void {
  const config = parsePublicSupabaseConfig(value);
  if (!config) throw new Error("Public Supabase configuration unavailable");
  if (client) {
    if (runtimeConfig?.url === config.url && runtimeConfig.publishableKey === config.publishableKey)
      return;
    throw new Error("Public Supabase configuration cannot change after initialization");
  }
  runtimeConfig = config;
}

function createSupabaseFetch(publishableKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));

    // Opaque publishable keys belong in apikey, not a JWT Bearer header.
    if (headers.get("Authorization") === `Bearer ${publishableKey}`)
      headers.delete("Authorization");
    headers.set("apikey", publishableKey);
    return fetch(input, { ...init, headers });
  };
}

function createPublicSupabaseClient() {
  const buildConfig = parsePublicSupabaseConfig({
    url: import.meta.env["VITE_SUPABASE_URL"],
    publishableKey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  });
  const config = buildConfig || runtimeConfig;
  if (!config) throw new Error("Public Supabase configuration unavailable");

  return createClient<Database>(config.url, config.publishableKey, {
    global: { fetch: createSupabaseFetch(config.publishableKey) },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/** Defer construction until the root has loaded the browser-safe config. */
export const supabase = new Proxy({} as ReturnType<typeof createPublicSupabaseClient>, {
  get(_, prop, receiver) {
    if (!client) client = createPublicSupabaseClient();
    return Reflect.get(client, prop, receiver);
  },
});
