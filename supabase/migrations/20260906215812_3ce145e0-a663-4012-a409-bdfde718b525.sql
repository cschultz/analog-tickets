CREATE TABLE public.refund_coordination_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL,
  ticket_ids uuid[] NOT NULL,
  ticket_count integer NOT NULL CHECK (ticket_count > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','provider_refunded','reversed','reconciliation_needed','failed')),
  provider_refund_reference text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.refund_coordination_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.refund_coordination_attempts TO service_role;
ALTER TABLE public.refund_coordination_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX refund_coordination_attempts_state_idx
  ON public.refund_coordination_attempts(state);

CREATE TRIGGER refund_coordination_attempts_set_updated_at
  BEFORE UPDATE ON public.refund_coordination_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.refund_coordination_attempts IS 'Private staging: server-only refund coordination ledger. Opaque test-mode references only; no PII. RLS enabled with no policies by design (service_role only).';