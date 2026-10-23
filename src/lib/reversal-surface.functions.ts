/**
 * Gate 107 — private staging contract deciding whether the optional check-in
 * reversal surface may render anything useful.
 *
 * Ordering matches every other staff surface: `requireSupabaseAuth` validates
 * the bearer token first, then the caller's OWN RLS-scoped client reads
 * `event_memberships`. No privileged client is used, no ticket, attendee,
 * order, event, audit, or pass data is read, and the response is two booleans.
 *
 * The same Gate 104 `BOX_OFFICE_MODULE` flag is read from the server
 * environment inside the handler, so the surface is off by default and legacy
 * projects are unaffected. Only organizer/admin qualify — box_office does not.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./require-supabase-auth.server";
import { isBoxOfficeModuleEnabled } from "@/lib/box-office-core";
import { REVERSAL_ROLES } from "@/lib/reversal-surface-core";

export const getReversalSurfaceState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const enabled = isBoxOfficeModuleEnabled(process.env["BOX_OFFICE_MODULE"]);
    if (!enabled) return { enabled: false as const, authorized: false as const };

    // The caller's own client: RLS returns only their memberships.
    const { data, error } = await context.supabase
      .from("event_memberships")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", [...REVERSAL_ROLES]);

    if (error) return { enabled: true as const, authorized: false as const };
    return { enabled: true as const, authorized: (data?.length ?? 0) > 0 };
  });
