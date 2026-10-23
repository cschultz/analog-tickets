/**
 * Private staging admin contract for the ticket-type refundability setting.
 *
 * Authorization is server-side only: the bearer token is validated by
 * `requireSupabaseAuth`, and the caller's admin membership is then read with
 * their own RLS-scoped client. Client claims, user metadata, and JWT
 * `user_metadata` are never consulted.
 *
 * This gate deliberately ships no UI. See docs/STAGING_REFUNDABILITY_POLICY.md.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./require-supabase-auth.server";
import {
  evaluateRefundPolicyAuthorization,
  isUuid,
  parseRefundPolicyInput,
  REFUND_POLICY_ERROR_MESSAGE,
  type RefundPolicyErrorCode,
} from "@/lib/refund-policy-core";

function fail(code: RefundPolicyErrorCode): never {
  throw new Error(REFUND_POLICY_ERROR_MESSAGE[code]);
}

export const setTicketTypeRefundPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => {
    const parsed = parseRefundPolicyInput(data);
    if (typeof parsed === "string") fail(parsed);
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { loadTicketTypePolicy, loadCallerMemberships, updateTicketTypeRefundable } =
      await import("@/lib/refund-policy.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const snapshot = await loadTicketTypePolicy(supabaseAdmin, data.ticketTypeId);
    if (!snapshot) fail("not_available");

    const memberships = await loadCallerMemberships(context.supabase, snapshot.eventId);
    const decision = evaluateRefundPolicyAuthorization({
      memberships,
      eventId: snapshot.eventId,
      userId: context.userId,
    });
    if (!decision.ok) fail(decision.code);

    const ok = await updateTicketTypeRefundable(
      supabaseAdmin,
      data.ticketTypeId,
      data.isRefundable,
    );
    if (!ok) fail("server_error");

    return { ok: true as const, isRefundable: data.isRefundable };
  });

/**
 * Gate 140 — read half of the same contract, for the private admin screen.
 *
 * SELECT only. Same authorization ordering as the write above: bearer token
 * validated by `requireSupabaseAuth`, then the caller's own RLS-scoped client
 * proves an `organizer`/`admin` membership on the ticket type's event. It never
 * reads an issued ticket and never touches `refundable_at_issue`.
 */
export const getTicketTypeRefundPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => {
    const raw = (data ?? {}) as Record<string, unknown>;
    if (!isUuid(raw["ticketTypeId"])) fail("invalid_request");
    return { ticketTypeId: raw["ticketTypeId"] as string };
  })
  .handler(async ({ data, context }) => {
    const { loadTicketTypePolicy, loadCallerMemberships } =
      await import("@/lib/refund-policy.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const snapshot = await loadTicketTypePolicy(supabaseAdmin, data.ticketTypeId);
    if (!snapshot) fail("not_available");

    const memberships = await loadCallerMemberships(context.supabase, snapshot.eventId);
    const decision = evaluateRefundPolicyAuthorization({
      memberships,
      eventId: snapshot.eventId,
      userId: context.userId,
    });
    if (!decision.ok) fail(decision.code);

    return { ok: true as const, isRefundable: snapshot.isRefundable === true };
  });
