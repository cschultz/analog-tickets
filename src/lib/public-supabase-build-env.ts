/** Only these already-public values may cross from server build env to Vite. */
import { isSafePublicSupabaseUrl } from "./public-supabase-config";

export function publicSupabaseBuildEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const url = env["SUPABASE_URL"];
  const key = env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return {};
  if (!isSafePublicSupabaseUrl(url)) return {};

  return {
    ...(!env["VITE_SUPABASE_URL"] ? { VITE_SUPABASE_URL: url } : {}),
    ...(!env["VITE_SUPABASE_PUBLISHABLE_KEY"] ? { VITE_SUPABASE_PUBLISHABLE_KEY: key } : {}),
  };
}
