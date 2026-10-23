ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS payment_intent_id text;

COMMENT ON COLUMN public.checkout_attempts.payment_intent_id IS
  'Opaque Stripe test-mode PaymentIntent id captured at signed paid finalization. Correlation only: never card, customer, email, secret, or URL data.';

CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_payment_intent_id_key
  ON public.checkout_attempts (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;