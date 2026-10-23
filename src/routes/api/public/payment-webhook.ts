/**
 * Private staging endpoint: accept a **Stripe test-mode** Checkout webhook and
 * reconcile one server-owned checkout attempt.
 *
 * Fail-closed. Without test-mode configuration and `STRIPE_TEST_WEBHOOK_SECRET`,
 * and without a valid `Stripe-Signature` over the exact raw body, nothing is
 * read or written. Only the Stripe event id, its type, and a processing status
 * are stored — never the raw payload, card, customer, token, or session data.
 *
 * Paid linked attempts use atomic finalization only after signature, test-mode,
 * paid status, attempt state and immutable amount/currency/provider correlation.
 * Expiry and refund branches retain their separate bounded effects.
 *
 * The previous generic `x-payment-signature` harness path has been removed: it
 * accepted arbitrary event ids under a shared secret and would have weakened
 * the Stripe path if kept alongside it.
 */
import { createFileRoute } from "@tanstack/react-router";

import { resolveCors } from "@/lib/transfer-otp-core";
import {
  checkoutErrorResponse,
  checkoutJsonResponse,
  decideIdempotency,
  normalizeCheckoutFailure,
  resolveCheckoutConfig,
  resolveWebhookConfig,
} from "@/lib/checkout-core";
import {
  STRIPE_SIGNATURE_HEADER,
  classifyStripeEvent,
  decideAbandonReconciliation,
  decideAttemptReconciliation,
  decideFinalizationEffect,
  extractPaymentCorrelation,
  parseStripeAsyncFailureEvent,
  parseRefundCandidateEvent,
  parseStripeCompletionEvent,
  parseStripeExpiryEvent,
  refundCandidateAckBody,
  stripeExpiryAckBody,
  stripeWebhookAckBody,
  verifyStripeSignature,
  validatePaidCheckoutAmount,
} from "@/lib/stripe-webhook-core";
import {
  decideRefundEventReconciliation,
  parseStripeRefundEvent,
  refundEventLedgerStatus,
  refundReconciliationAckBody,
} from "@/lib/refund-webhook-core";

async function deliverGuestReceipt(attemptId: string) {
  if (process.env["GUEST_RECOVERY_SANDBOX_MODE"] !== "true") return;
  try {
    const { deliverGuestReceiptForAttempt } = await import("@/lib/guest-recovery-runtime.server");
    await deliverGuestReceiptForAttempt(attemptId);
  } catch {
    /* Durable delivery queue is independent of payment acknowledgment. */
  }
}

export const Route = createFileRoute("/api/public/payment-webhook")({
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
        const pricingEnabled = process.env["PROMOTION_PRICING_SANDBOX_MODE"] === "true";
        const env = {
          PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
          PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
          STRIPE_TEST_WEBHOOK_SECRET: process.env["STRIPE_TEST_WEBHOOK_SECRET"],
        };
        const config = resolveCheckoutConfig(env);
        if (typeof config === "string") return checkoutErrorResponse(config);
        const webhookConfig = resolveWebhookConfig(env);
        if (typeof webhookConfig === "string") return checkoutErrorResponse(webhookConfig);

        let rawBody: string;
        try {
          rawBody = await request.text();
        } catch {
          return checkoutErrorResponse("invalid_request");
        }

        const verified = await verifyStripeSignature({
          secret: webhookConfig.secret,
          header: request.headers.get(STRIPE_SIGNATURE_HEADER),
          rawBody,
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        if (!verified) return checkoutErrorResponse("unauthorized");

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return checkoutErrorResponse("invalid_request");
        }
        // A delayed failure is audit evidence only. It cannot complete an
        // attempt or prove that its held inventory is safe to release.
        if (classifyStripeEvent(parsed) === "async_failure") {
          const failure = parseStripeAsyncFailureEvent(parsed);
          if (failure === "unsupported") {
            return checkoutJsonResponse({ ok: true, duplicate: false, status: "ignored" });
          }
          if (typeof failure === "string") return checkoutErrorResponse(failure);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const {
              findWebhookEvent,
              loadCheckoutAttemptStatus,
              markWebhookEventStatus,
              recordWebhookEvent,
            } = await import("@/lib/checkout.server");
            const existing = await findWebhookEvent(supabaseAdmin, failure.externalEventId);
            const decision = decideIdempotency(existing);
            if (decision.action === "skip") {
              return checkoutJsonResponse({ ok: true, duplicate: true, status: "ignored" });
            }
            const attempt = await loadCheckoutAttemptStatus(
              supabaseAdmin,
              failure.attemptId,
              pricingEnabled,
            );
            if (!attempt || attempt.id !== failure.attemptId)
              return checkoutErrorResponse("not_available");
            const moneyError = validatePaidCheckoutAmount(parsed, attempt, pricingEnabled);
            if (moneyError) return checkoutErrorResponse(moneyError);
            if (decision.action === "insert") {
              const inserted = await recordWebhookEvent(supabaseAdmin, {
                provider: config.provider,
                externalEventId: failure.externalEventId,
                eventType: failure.eventType,
                status: "ignored",
                checkoutAttemptId: failure.attemptId,
              });
              return checkoutJsonResponse({ ok: true, duplicate: !inserted, status: "ignored" });
            }
            const updated = await markWebhookEventStatus(
              supabaseAdmin,
              failure.externalEventId,
              "ignored",
            );
            if (!updated) return checkoutErrorResponse("server_error");
            return checkoutJsonResponse({ ok: true, duplicate: true, status: "ignored" });
          } catch (error) {
            return checkoutErrorResponse(normalizeCheckoutFailure(error));
          }
        }
        // Gate 80: a signed, unpaid, test-mode expiry event reaps exactly one
        // pending synthetic attempt and returns its confirmed pre-payment hold.
        if (classifyStripeEvent(parsed) === "expiry") {
          const expiry = parseStripeExpiryEvent(parsed);
          if (expiry === "unsupported") {
            return checkoutJsonResponse({
              ok: true,
              duplicate: false,
              status: "ignored",
              abandoned: false,
              released: false,
            });
          }
          if (typeof expiry === "string") return checkoutErrorResponse(expiry);

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const {
              reconcileSignedCheckoutExpiry,
              findWebhookEvent,
              loadCheckoutAttemptStatus,
              markWebhookEventStatus,
              recordWebhookEvent,
            } = await import("@/lib/checkout.server");

            const existing = await findWebhookEvent(supabaseAdmin, expiry.externalEventId);
            const decision = decideIdempotency(existing);
            // Replay of a terminal delivery: acknowledge, write nothing.
            if (decision.action === "skip") {
              return checkoutJsonResponse(
                stripeExpiryAckBody({ duplicate: true, abandoned: false, released: false }),
              );
            }

            const attempt = await loadCheckoutAttemptStatus(
              supabaseAdmin,
              expiry.attemptId,
              pricingEnabled,
            );
            const reconciliation = decideAbandonReconciliation(attempt);

            let abandoned = false;
            let released = false;
            let reconciledReplay = false;
            if (
              reconciliation.action === "abandon" ||
              (process.env["PROMOTION_PRICING_SANDBOX_MODE"] === "true" &&
                attempt?.status === "abandoned")
            ) {
              const result = await reconcileSignedCheckoutExpiry(
                supabaseAdmin,
                parsed,
                expiry.attemptId,
                Date.now(),
                process.env["CHECKOUT_EXPIRY_RECOVERY_SANDBOX_MODE"] === "true" ||
                  process.env["PROMOTION_PRICING_SANDBOX_MODE"] === "true"
                  ? {
                      enabled: process.env["CHECKOUT_EXPIRY_RECOVERY_SANDBOX_MODE"],
                      promotionEnabled: process.env["PROMOTION_PRICING_SANDBOX_MODE"],
                      env: {
                        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
                        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
                        STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
                        STAGING_ALLOWED_ORIGIN: process.env["STAGING_ALLOWED_ORIGIN"],
                      },
                      loadTransport: async () => {
                        const { createStripeCheckoutReadTransport } =
                          await import("@/lib/stripe-transport.server");
                        return createStripeCheckoutReadTransport();
                      },
                    }
                  : undefined,
              );
              if (result.outcome === "error") return checkoutErrorResponse("server_error");
              abandoned = result.outcome === "abandoned" || result.outcome === "abandoned_released";
              released = result.released > 0;
              reconciledReplay = result.outcome === "idempotent_replay";
            }

            // A replay proves prior reconciliation, even if its ledger insert
            // beats the releasing delivery's delayed response. It has no new
            // release effect, but must not downgrade that event to ignored.
            const ledgerStatus = abandoned || reconciledReplay ? "processed" : "ignored";
            if (decision.action === "insert") {
              const inserted = await recordWebhookEvent(supabaseAdmin, {
                provider: config.provider,
                externalEventId: expiry.externalEventId,
                eventType: expiry.eventType,
                status: ledgerStatus,
                // Gate 167: the internal attempt reference this delivery was
                // already validated to carry, written atomically with the row.
                checkoutAttemptId: expiry.attemptId,
              });
              return checkoutJsonResponse(
                stripeExpiryAckBody({ duplicate: !inserted, abandoned, released }),
              );
            }

            const updated = await markWebhookEventStatus(
              supabaseAdmin,
              expiry.externalEventId,
              ledgerStatus,
            );
            if (!updated) return checkoutErrorResponse("server_error");
            return checkoutJsonResponse(
              stripeExpiryAckBody({ duplicate: true, abandoned, released }),
            );
          } catch (error) {
            return checkoutErrorResponse(normalizeCheckoutFailure(error));
          }
        }

        // Gate 86/89: a signed, test-mode refund event is recorded exactly
        // once. When it carries an opaque correlation pair it may additionally
        // reconcile ONE pre-existing Gate 88 coordination record. There is no
        // refund execution path here: no provider call, order, ticket, hold,
        // capacity, eligibility snapshot, or mail is reachable from this
        // branch, and nothing can start a refund.
        if (classifyStripeEvent(parsed) === "refund_candidate") {
          const candidate = parseRefundCandidateEvent(parsed);
          if (candidate === "unsupported") {
            return checkoutJsonResponse(refundCandidateAckBody({ duplicate: false }));
          }
          if (typeof candidate === "string") return checkoutErrorResponse(candidate);

          const correlated = parseStripeRefundEvent(parsed);

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { findWebhookEvent, recordWebhookEvent } = await import("@/lib/checkout.server");

            const existing = await findWebhookEvent(supabaseAdmin, candidate.externalEventId);

            // Uncorrelated deliveries keep the pre-existing behaviour exactly.
            if (typeof correlated === "string") {
              if (existing)
                return checkoutJsonResponse(refundCandidateAckBody({ duplicate: true }));
              const inserted = await recordWebhookEvent(supabaseAdmin, {
                provider: config.provider,
                externalEventId: candidate.externalEventId,
                eventType: candidate.eventType,
                status: "ignored",
                // Gate 167: a refund-candidate delivery carries no internal
                // attempt reference. It stays NULL; nothing is inferred.
                checkoutAttemptId: null,
              });
              return checkoutJsonResponse(refundCandidateAckBody({ duplicate: !inserted }));
            }

            const { flagRefundReconciliationNeeded, loadRefundCoordinationRecord } =
              await import("@/lib/refund-reconciliation.server");

            const record = await loadRefundCoordinationRecord(supabaseAdmin, {
              paymentIntentId: correlated.paymentIntentId,
              refundReference: correlated.refundReference,
            });
            const decision = decideRefundEventReconciliation({ event: correlated, record });

            // Replay of a delivery already seen: decide nothing further, and
            // above all never repeat an effect.
            if (existing) {
              return checkoutJsonResponse(
                refundReconciliationAckBody({ duplicate: true, decision }),
              );
            }

            if (decision.action === "flag_reconciliation_needed" && record) {
              // Fail closed: if the guarded reconciliation flag cannot be
              // durably recorded, return a generic server error BEFORE the
              // delivery is ledgered or acknowledged. Stripe's normal retry
              // can then deliver the event again safely.
              const flagged = await flagRefundReconciliationNeeded(supabaseAdmin, record.id);
              if (!flagged) return checkoutErrorResponse("server_error");
            }

            const inserted = await recordWebhookEvent(supabaseAdmin, {
              provider: config.provider,
              externalEventId: candidate.externalEventId,
              eventType: candidate.eventType,
              status: refundEventLedgerStatus(decision),
              // Gate 167: still no internal attempt reference on this branch.
              checkoutAttemptId: null,
            });
            return checkoutJsonResponse(
              refundReconciliationAckBody({ duplicate: !inserted, decision }),
            );
          } catch (error) {
            return checkoutErrorResponse(normalizeCheckoutFailure(error));
          }
        }

        const event = parseStripeCompletionEvent(parsed);

        // A signed but unsupported event is acknowledged without any write, so
        // Stripe does not retry it forever.
        if (event === "unsupported") {
          return checkoutJsonResponse({
            ok: true,
            duplicate: false,
            status: "ignored",
            reconciled: false,
          });
        }
        if (typeof event === "string") return checkoutErrorResponse(event);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {
            completePendingCheckoutAttempt,
            finalizePaidCheckoutAttempt,
            findWebhookEvent,
            loadCheckoutAttemptStatus,
            markWebhookEventStatus,
            recordAttemptPaymentCorrelation,
            recordWebhookEvent,
            recordUnfulfilledPaidReview,
          } = await import("@/lib/checkout.server");

          const existing = await findWebhookEvent(supabaseAdmin, event.externalEventId);
          const decision = decideIdempotency(existing);

          // Pricing mode must prove the exact saved quote even on replay,
          // before a duplicate event can trigger pending receipt delivery.
          // Keep the legacy skip path free of new-schema reads when off.
          const attempt =
            pricingEnabled || decision.action !== "skip"
              ? await loadCheckoutAttemptStatus(supabaseAdmin, event.attemptId, pricingEnabled)
              : null;
          const amountError = attempt
            ? validatePaidCheckoutAmount(parsed, attempt, pricingEnabled)
            : "not_available";
          if (pricingEnabled && amountError) return checkoutErrorResponse(amountError);

          // Payment replay: no payment/issuance write. A separately gated,
          // still-pending guest receipt may be dispatched from its durable queue.
          if (decision.action === "skip") {
            await deliverGuestReceipt(event.attemptId);
            return checkoutJsonResponse(
              stripeWebhookAckBody({ duplicate: true, reconciled: false, issued: false }),
            );
          }

          const reconciliation = decideAttemptReconciliation(attempt);
          if (!attempt) return checkoutErrorResponse("not_available");
          if (amountError) return checkoutErrorResponse(amountError);
          const recordReview = () =>
            recordUnfulfilledPaidReview(supabaseAdmin, {
              externalEventId: event.externalEventId,
              eventType: event.eventType,
              checkoutAttemptId: event.attemptId,
            });
          if (reconciliation.action === "reject") {
            if (attempt.status === "abandoned" || attempt.status === "failed") await recordReview();
            return checkoutErrorResponse(reconciliation.code);
          }

          let reconciled = false;
          let issued = false;
          if (reconciliation.action === "complete") {
            // Gate 82: one atomic step completes the pending linked attempt and
            // issues exactly its confirmed hold's order/line/tickets. Nothing is
            // created unless the routine reports a real finalization.
            const finalize = await finalizePaidCheckoutAttempt(supabaseAdmin, event.attemptId);
            const effect = decideFinalizationEffect(finalize.outcome);
            if (effect.action === "reject") {
              if (finalize.outcome === "not_finalizable") await recordReview();
              return checkoutErrorResponse(effect.code);
            }
            if (effect.action === "issued") {
              reconciled = true;
              issued = finalize.ticketsIssued > 0;
            } else if (effect.action === "complete_only") {
              const result = await completePendingCheckoutAttempt(supabaseAdmin, event.attemptId);
              if (result.error) return checkoutErrorResponse("server_error");
              reconciled = result.updated;
            }

            // Gate 86: only now — after signature, test-mode, paid/complete and
            // attempt correlation have all passed — persist the single opaque
            // PaymentIntent reference. Write-once; failure never fails the
            // delivery and never changes issuance.
            const paymentIntentId = extractPaymentCorrelation(parsed);
            if (paymentIntentId) {
              await recordAttemptPaymentCorrelation(
                supabaseAdmin,
                event.attemptId,
                paymentIntentId,
              );
            }
          }

          if (decision.action === "insert") {
            const inserted = await recordWebhookEvent(supabaseAdmin, {
              provider: config.provider,
              externalEventId: event.externalEventId,
              eventType: event.eventType,
              status: "processed",
              // Gate 167: same verified internal attempt reference.
              checkoutAttemptId: event.attemptId,
            });
            // A unique-violation race means another delivery won; that is a
            // successful idempotent outcome, not an error.
            await deliverGuestReceipt(event.attemptId);
            return checkoutJsonResponse(
              stripeWebhookAckBody({ duplicate: !inserted, reconciled, issued }),
            );
          }

          const updated = await markWebhookEventStatus(
            supabaseAdmin,
            event.externalEventId,
            "processed",
          );
          if (!updated) return checkoutErrorResponse("server_error");
          await deliverGuestReceipt(event.attemptId);
          return checkoutJsonResponse(
            stripeWebhookAckBody({ duplicate: true, reconciled, issued }),
          );
        } catch (error) {
          return checkoutErrorResponse(normalizeCheckoutFailure(error));
        }
      },
    },
  },
});
