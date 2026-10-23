/** App-owned bearer attachment for TanStack server functions.
 * Lovable may regenerate files under src/integrations/supabase on import.
 */
import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "./public-supabase-client";

export function bearerHeaders(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    return next({ headers: bearerHeaders(data.session?.access_token) });
  },
);
