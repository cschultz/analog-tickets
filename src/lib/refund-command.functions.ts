/**
 * Gate 93 — private staging authenticated refund command.
 *
 * Ordering mirrors Gate 85/91 exactly: `requireSupabaseAuth` validates the
 * bearer token → `loadCallerMemberships` reads the caller's `event_memberships`
 * with THEIR OWN RLS-scoped client → only organizer/admin passes → only then is
 * any privileged ticket or payment data read.
 *
 * The command accepts `{ eventId, ticketIds[] }` and nothing else. Eligibility,
 * payment correlation, and amount are always re-derived server-side. It never
 * contacts Stripe, the Gate 87 reversal routine, or the Gate 89 reconciliation
 * helpers directly: the Gate 88 coordinator is the only delegate, so its stable
 * idempotency and replay behaviour is preserved unchanged.
 *
 * No route, no button, no UI wiring.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./require-supabase-auth.server";
import {
  commandResult,
  parseRefundCommandInput,
  type RefundCommandResult,
} from "@/lib/refund-command-core";

export const executeTicketRefundCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => data)
  .handler(async ({ data, context }): Promise<RefundCommandResult> => {
    const parsed = parseRefundCommandInput(data);
    if (typeof parsed === "string") return commandResult(parsed);

    const { loadCallerMemberships } = await import("@/lib/refund-policy.server");
    const memberships = await loadCallerMemberships(context.supabase, parsed.eventId);

    const { authorizeRefundCommand, executeAuthorizedRefundCommand } =
      await import("@/lib/refund-command.server");
    const decision = authorizeRefundCommand({
      memberships,
      eventId: parsed.eventId,
      userId: context.userId,
    });
    if (!decision.ok) return commandResult(decision.code);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createStripeFetchTransport } = await import("@/lib/stripe-transport.server");

    return executeAuthorizedRefundCommand({
      admin: supabaseAdmin,
      env: {
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
        STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
        PROMOTION_PRICING_SANDBOX_MODE: process.env["PROMOTION_PRICING_SANDBOX_MODE"],
      },
      transport: createStripeFetchTransport(),
      input: parsed,
    });
  });
