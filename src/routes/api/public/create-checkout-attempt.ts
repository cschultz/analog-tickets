/**
 * Private staging endpoint: create a pending synthetic checkout attempt and,
 * only after auth + strict CORS + server-side availability/pricing succeed,
 * prepare a hosted provider Checkout Session through the server-only adapter.
 *
 * Fail-closed: only confirmed reservation-linked attempts may create a
 * session. Any configuration/provider/network/malformed failure returns a
 * generic error. Linked attempts stay pending after uncertain provider outcomes
 * and recover only with their original request identity and saved monetary facts.
 * No order, ticket, inventory change, or provider session id is ever persisted.
 * Paid linked issuance belongs to the separately signed webhook handler.
 */
import { createFileRoute } from "@tanstack/react-router";

import { parseBearer, resolveCors } from "@/lib/transfer-otp-core";
import { planSessionDeadline } from "@/lib/checkout-deadline-policy";
import {
  buildProviderSessionInput,
  checkoutErrorResponse,
  checkoutExistingAttemptBody,
  checkoutJsonResponse,
  checkoutRedirectBody,
  evaluateReservationCorrelation,
  evaluateReservedTicketType,
  normalizeCheckoutFailure,
  parseCheckoutInput,
  resolveCheckoutConfig,
  type PricedAttempt,
} from "@/lib/checkout-core";

export const Route = createFileRoute("/api/public/create-checkout-attempt")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env["STAGING_ALLOWED_ORIGIN"],
        );
        if (!cors.allowed) return new Response(null, { status: 403, headers: cors.headers });
        return new Response(null, { status: 204, headers: cors.headers });
      },
      POST: async ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env["STAGING_ALLOWED_ORIGIN"],
        );
        if (!cors.allowed) return checkoutErrorResponse("forbidden", cors.headers);
        const headers = cors.headers;

        const config = resolveCheckoutConfig({
          PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
          PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
        });
        if (typeof config === "string") return checkoutErrorResponse(config, headers);

        const token = parseBearer(request.headers.get("authorization"));
        if (!token) return checkoutErrorResponse("unauthorized", headers);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return checkoutErrorResponse("invalid_request", headers);
        }
        const input = parseCheckoutInput(body);
        if (typeof input === "string") return checkoutErrorResponse(input, headers);
        // The legacy unlinked path cannot reconcile an ambiguous provider
        // timeout and could mint another payable session on retry.
        if (!input.reservationId) return checkoutErrorResponse("not_available", headers);

        let attemptId: string | null = null;

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const userId = await resolveUserId(createUserClient(token), token);
          if (!userId) return checkoutErrorResponse("unauthorized", headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {
            insertLinkedCheckoutAttempt,
            loadAttemptsForReservation,
            loadPendingCheckoutForRecovery,
            loadPendingDeadlineCheckoutForRecovery,
            loadReservationSnapshot,
            loadTicketTypeSnapshot,
          } = await import("@/lib/checkout.server");

          const snapshot = await loadTicketTypeSnapshot(supabaseAdmin, input.ticketTypeId);
          let priced: PricedAttempt | null = null;
          let deadlineContract:
            { requestVersion: 2; holdExpiresAt: string; expiresAtSeconds: number } | undefined;

          if (input.reservationId) {
            // Server-side correlation: the hold must exist, still be a live
            // confirmed hold for exactly this synthetic tier/event/quantity and
            // server-derived amount, belong to this caller, and have no other
            // live attempt. Anything else fails closed before provider work.
            const reservation = await loadReservationSnapshot(supabaseAdmin, input.reservationId);
            const linked = await loadAttemptsForReservation(supabaseAdmin, input.reservationId);
            if (!linked) return checkoutErrorResponse("server_error", headers);

            const evaluated = evaluateReservedTicketType({
              snapshot,
              reservation,
              linkedAttempts: linked,
              ticketTypeId: input.ticketTypeId,
              quantity: input.quantity,
              userId,
              nowMs: Date.now(),
            });
            if (typeof evaluated === "string") {
              if (input.resume) console.warn("checkout_resume", "reservation_not_available");
              return checkoutErrorResponse(evaluated, headers);
            }
            priced = evaluated.priced;
            if (evaluated.existingAttemptId) {
              if (!input.resume)
                return checkoutJsonResponse(checkoutExistingAttemptBody(), headers);
              attemptId = evaluated.existingAttemptId;
              const recoveryArgs = {
                attemptId,
                userId,
                reservationId: input.reservationId,
                eventId: priced.eventId,
                ticketTypeId: input.ticketTypeId,
                quantity: input.quantity,
              };
              const saved = await loadPendingCheckoutForRecovery(supabaseAdmin, recoveryArgs);
              if (!saved) {
                if (process.env["CHECKOUT_RECOVERY_SANDBOX_MODE"] !== "true")
                  return checkoutErrorResponse("not_available", headers);
                const facts = await loadPendingDeadlineCheckoutForRecovery(supabaseAdmin, {
                  ...recoveryArgs,
                  holdExpiresAt: reservation?.expiresAt ?? "",
                });
                if (!facts) {
                  console.warn("checkout_resume", "recovery_facts_unavailable");
                  return checkoutErrorResponse("not_available", headers);
                }
                const { lookupStripeTestCheckout } =
                  await import("@/lib/stripe-checkout-lookup.server");
                const { createStripeCheckoutReadTransport } =
                  await import("@/lib/stripe-transport.server");
                const observation = await lookupStripeTestCheckout({
                  facts,
                  visibilityGrace: true,
                  // Fixed enums only: never log auth, contacts, URLs or provider payloads.
                  diagnose: (reason) => console.warn("checkout_resume_lookup", reason),
                  env: {
                    PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
                    PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
                    STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
                    STAGING_ALLOWED_ORIGIN: process.env["STAGING_ALLOWED_ORIGIN"],
                  },
                  transport: createStripeCheckoutReadTransport(),
                });
                if (observation.status !== "open") {
                  console.warn("checkout_resume", "provider_not_open", observation.status);
                  return checkoutErrorResponse("not_available", headers);
                }
                // Provider read and SQL are not one transaction: recheck live local
                // ownership/status/deadline before handing back a redirect, never write.
                const latestHold = await loadReservationSnapshot(
                  supabaseAdmin,
                  input.reservationId,
                );
                const latestAttempts = await loadAttemptsForReservation(
                  supabaseAdmin,
                  input.reservationId,
                );
                const latestFacts = await loadPendingDeadlineCheckoutForRecovery(supabaseAdmin, {
                  ...recoveryArgs,
                  holdExpiresAt: latestHold?.expiresAt ?? "",
                });
                if (
                  !latestAttempts ||
                  !latestFacts ||
                  JSON.stringify(latestFacts) !== JSON.stringify(facts)
                ) {
                  console.warn("checkout_resume", "local_facts_changed");
                  return checkoutErrorResponse("not_available", headers);
                }
                const correlation = evaluateReservationCorrelation({
                  reservation: latestHold,
                  linkedAttempts: latestAttempts,
                  userId,
                  requested: {
                    ticketTypeId: input.ticketTypeId,
                    eventId: priced.eventId,
                    quantity: input.quantity,
                    amountCents: facts.amountCents,
                  },
                  unitPriceCents: facts.amountCents / input.quantity,
                  nowMs: Date.now(),
                });
                if (!correlation.ok || correlation.existingAttemptId !== attemptId) {
                  console.warn("checkout_resume", "local_correlation_changed");
                  return checkoutErrorResponse("not_available", headers);
                }
                return checkoutJsonResponse(checkoutRedirectBody(observation.redirectUrl), headers);
              }
              // This reader admits only version 1. Version-2 pending attempts
              // require independent provider lookup/reconciliation, not a v1 POST.
              priced = saved;
            } else {
              // Recovery must never mint a replacement attempt/session.
              if (input.resume) return checkoutErrorResponse("not_available", headers);

              // New linked requests must persist a v2 deadline before transport.
              // A short/old hold cannot silently fall back to the expiry-free v1 form.
              const holdExpiresAt = reservation?.expiresAt ?? "";
              const expiresAtSeconds = planSessionDeadline({
                requestVersion: 2,
                holdExpiresAt,
                nowMs: Date.now(),
              });
              if (expiresAtSeconds === null) return checkoutErrorResponse("not_available", headers);
              deadlineContract = { requestVersion: 2, holdExpiresAt, expiresAtSeconds };

              const linkedInsert = await insertLinkedCheckoutAttempt(supabaseAdmin, {
                userId,
                eventId: priced.eventId,
                ticketTypeId: input.ticketTypeId,
                reservationId: input.reservationId,
                quantity: input.quantity,
                unitPriceCents: priced.unitPriceCents,
                amountCents: priced.amountCents,
                currency: priced.currency,
                provider: config.provider,
                providerExpiresAtSeconds: expiresAtSeconds,
              });
              if (!linkedInsert) return checkoutErrorResponse("server_error", headers);
              // The database uniqueness guard may have collided with either a
              // pending retry or a just-settled attempt. Re-read after the
              // conflict: only a live attempt owned by this caller is a replay.
              if ("conflict" in linkedInsert) {
                const latestReservation = await loadReservationSnapshot(
                  supabaseAdmin,
                  input.reservationId,
                );
                const latestAttempts = await loadAttemptsForReservation(
                  supabaseAdmin,
                  input.reservationId,
                );
                if (!latestAttempts) return checkoutErrorResponse("server_error", headers);
                const latestCorrelation = evaluateReservationCorrelation({
                  reservation: latestReservation,
                  linkedAttempts: latestAttempts,
                  requested: {
                    ticketTypeId: input.ticketTypeId,
                    eventId: priced.eventId,
                    quantity: input.quantity,
                    amountCents: priced.amountCents,
                  },
                  unitPriceCents: priced.unitPriceCents,
                  userId,
                  nowMs: Date.now(),
                });
                if (!latestCorrelation.ok) {
                  return checkoutErrorResponse(latestCorrelation.code, headers);
                }
                if (latestCorrelation.existingAttemptId) {
                  return checkoutJsonResponse(checkoutExistingAttemptBody(), headers);
                }
                // A different unique constraint or a racing status transition
                // can also yield a conflict. Never claim a replay without a
                // currently visible pending attempt.
                return checkoutErrorResponse("server_error", headers);
              }
              attemptId = linkedInsert.id;
            }
          }
          if (!attemptId || !priced) return checkoutErrorResponse("server_error", headers);

          const { createStripeCheckoutSession } = await import("@/lib/stripe-checkout.server");
          const { createStripeFetchTransport } = await import("@/lib/stripe-transport.server");

          const outcome = await createStripeCheckoutSession({
            requestIdentity: attemptId,
            ...(deadlineContract ? { deadlineContract } : {}),
            env: {
              PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
              PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
              STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
              STAGING_ALLOWED_ORIGIN: process.env["STAGING_ALLOWED_ORIGIN"],
            },
            input: buildProviderSessionInput({
              attemptId,
              priced,
              quantity: input.quantity,
            }),
            transport: createStripeFetchTransport(),
          });

          if (!outcome.ok) {
            // A provider error or timeout does not prove that no session exists.
            // Keep linked outcomes pending for independent v2 provider lookup.
            return checkoutErrorResponse(outcome.code, headers);
          }

          // Redirect URL plus a generic state only: no provider payload,
          // key, session/customer id, or backend detail. Nothing persisted.
          return checkoutJsonResponse(checkoutRedirectBody(outcome.result.redirectUrl), headers);
        } catch (error) {
          return checkoutErrorResponse(normalizeCheckoutFailure(error), headers);
        }
      },
    },
  },
});
