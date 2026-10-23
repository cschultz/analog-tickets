/**
 * Server-only helpers for the private staging transfer-OTP endpoints.
 * Loaded via dynamic import inside route handlers only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

function isNewApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** Supabase client acting as the bearer-token user (RLS applies). */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  const url = process.env['SUPABASE_URL']!;
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY']!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${accessToken}`);
        if (isNewApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.set("Authorization", `Bearer ${accessToken}`);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Returns the authenticated user id, or null when the token is not valid.
 * Validates the explicit bearer token; no persisted server session exists.
 */
export async function resolveUserId(
  client: SupabaseClient<Database>,
  accessToken: string,
): Promise<string | null> {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}
