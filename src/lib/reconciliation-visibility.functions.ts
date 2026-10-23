/**
 * Gate 96 — private staging admin contract: read-only reconciliation-needed
 * case visibility for one event.
 *
 * Ordering mirrors Gate 85/91 exactly: `requireSupabaseAuth` validates the
 * bearer token → the caller's `event_memberships` role is read with THEIR own
 * RLS-scoped client → only then is any privileged read performed.
 *
 * This contract cannot recover, retry, refund, restock, write, or contact any
 * payment provider. It is purely operational visibility.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./require-supabase-auth.server";
import {
  evaluateReconciliationVisibilityAuthorization,
  parseReconciliationVisibilityInput,
  projectReconciliationCases,
  RECONCILIATION_VISIBILITY_ERROR_MESSAGE,
  type ReconciliationVisibilityErrorCode,
} from "@/lib/reconciliation-visibility-core";

function fail(code: ReconciliationVisibilityErrorCode): never {
  throw new Error(RECONCILIATION_VISIBILITY_ERROR_MESSAGE[code]);
}

export const listEventReconciliationCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => {
    const parsed = parseReconciliationVisibilityInput(data);
    if (typeof parsed === "string") fail(parsed);
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { loadCallerMemberships } = await import("@/lib/refund-policy.server");

    const memberships = await loadCallerMemberships(context.supabase, data.eventId);
    const decision = evaluateReconciliationVisibilityAuthorization({
      memberships,
      eventId: data.eventId,
      userId: context.userId,
    });
    if (!decision.ok) fail(decision.code);

    const { loadReconciliationCases, loadEventTicketIds } =
      await import("@/lib/reconciliation-visibility.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cases = await loadReconciliationCases(supabaseAdmin);
    if (!cases) fail("server_error");

    const candidates = Array.from(new Set(cases.flatMap((record) => record.ticketIds)));
    const eventTicketIds = await loadEventTicketIds(supabaseAdmin, data.eventId, candidates);
    if (!eventTicketIds) fail("server_error");

    return {
      ok: true as const,
      cases: projectReconciliationCases({
        eventId: data.eventId,
        cases,
        eventTicketIds,
      }),
    };
  });
