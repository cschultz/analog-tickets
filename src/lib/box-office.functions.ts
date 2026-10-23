/**
 * Gate 104 — private staging contract that decides whether the optional Box
 * Office surface may render anything useful.
 *
 * Ordering matches every other staff surface: `requireSupabaseAuth` validates
 * the bearer token first, then the caller's OWN RLS-scoped client reads
 * `event_memberships`. No privileged client is used; only the eligible event
 * IDs are read to enforce the single-event pilot limit. No ticket, attendee,
 * order, or pass data is read, and the response is two booleans.
 *
 * The module flag is read from the server environment inside the handler, so
 * the optional surface is off by default: a new remix must explicitly enable
 * Box Office, and a legacy project that never sets the flag keeps its existing
 * behaviour untouched.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./require-supabase-auth.server";
import { BOX_OFFICE_ROLES, isBoxOfficeModuleEnabled } from "@/lib/box-office-core";
import { pilotBoxOfficeSurfaceState } from "@/lib/box-office-surface.server";

export const getBoxOfficeSurfaceState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => {
    const enabled = isBoxOfficeModuleEnabled(process.env["BOX_OFFICE_MODULE"]);
    return pilotBoxOfficeSurfaceState(enabled, () =>
      // The caller's own client: RLS returns only their memberships.
      context.supabase
        .from("event_memberships")
        .select("event_id")
        .eq("user_id", context.userId)
        .in("role", [...BOX_OFFICE_ROLES]),
    );
  });
