/**
 * Gate 91 — private staging admin contract: read-only per-ticket refund
 * eligibility.
 *
 * Ordering mirrors Gate 85 exactly: `requireSupabaseAuth` validates the bearer
 * token → the caller's `event_memberships` role is read with THEIR own
 * RLS-scoped client → only then is any privileged read performed. No UI, no
 * route, no write, no provider call, no reversal, no reconciliation.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./require-supabase-auth.server";
import {
  evaluateRefundEligibility,
  evaluateRefundEligibilityAuthorization,
  parseRefundEligibilityInput,
  REFUND_ELIGIBILITY_ERROR_MESSAGE,
  type RefundEligibilityErrorCode,
} from "@/lib/refund-eligibility-core";

function fail(code: RefundEligibilityErrorCode): never {
  throw new Error(REFUND_ELIGIBILITY_ERROR_MESSAGE[code]);
}

export const getTicketRefundEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => {
    const parsed = parseRefundEligibilityInput(data);
    if (typeof parsed === "string") fail(parsed);
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { loadCallerMemberships } = await import("@/lib/refund-policy.server");

    const memberships = await loadCallerMemberships(context.supabase, data.eventId);
    const decision = evaluateRefundEligibilityAuthorization({
      memberships,
      eventId: data.eventId,
      userId: context.userId,
    });
    if (!decision.ok) fail(decision.code);

    const { loadEligibilityTicketFacts } = await import("@/lib/refund-eligibility.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tickets = await loadEligibilityTicketFacts(supabaseAdmin, data.eventId, data.ticketIds);
    if (!tickets) fail("server_error");

    return {
      ok: true as const,
      results: evaluateRefundEligibility({
        eventId: data.eventId,
        ticketIds: data.ticketIds,
        tickets,
      }),
    };
  });
