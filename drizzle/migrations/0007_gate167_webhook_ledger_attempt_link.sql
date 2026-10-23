-- Gate 167 — approved private staging webhook-ledger-to-checkout-attempt link.
-- Exactly the Gate 166 preflight candidate: one nullable column, one
-- restrictive foreign key, one NON-unique index. No backfill, no historical
-- ledger row altered, no grant, policy, role, view, trigger or exposure added.

-- 1. Correlation column. Nullable with no default: every historical ledger row
--    and every delivery without a validated internal attempt reference stays
--    NULL.
ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS checkout_attempt_id uuid;

-- 2. Restrictive behaviour: an attempt a ledger row claims can never be
--    deleted or repointed out from under the correlation.
ALTER TABLE public.payment_webhook_events
  ADD CONSTRAINT payment_webhook_events_checkout_attempt_id_fkey
  FOREIGN KEY (checkout_attempt_id)
  REFERENCES public.checkout_attempts(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- 3. Deliberately NON-unique: several deliveries (completion, expiry, retries
--    across distinct event ids) may legitimately concern one attempt. The
--    partial index skips the many NULL rows.
CREATE INDEX IF NOT EXISTS payment_webhook_events_checkout_attempt_id_idx
  ON public.payment_webhook_events (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;
