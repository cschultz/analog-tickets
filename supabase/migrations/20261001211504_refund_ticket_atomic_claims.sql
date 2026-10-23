-- A coordination key identifies one exact selection, not every selection
-- containing a ticket. Persist a per-ticket claim before any provider call.
-- A collision aborts the ledger INSERT and its claims in one transaction.
CREATE TABLE public.refund_ticket_claims (
  ticket_id uuid PRIMARY KEY,
  coordination_attempt_id uuid NOT NULL
    REFERENCES public.refund_coordination_attempts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refund_ticket_claims_attempt_idx
  ON public.refund_ticket_claims(coordination_attempt_id);

-- Clear inherited/default service grants too; this append-only claim ledger
-- needs SELECT and INSERT, not UPDATE or DELETE.
REVOKE ALL ON public.refund_ticket_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.refund_ticket_claims TO service_role;
ALTER TABLE public.refund_ticket_claims ENABLE ROW LEVEL SECURITY;

-- Existing claims must be unique too. If historical attempts overlap, this
-- migration fails closed for operator reconciliation rather than picking one.
INSERT INTO public.refund_ticket_claims(ticket_id, coordination_attempt_id)
SELECT ticket_id, a.id
FROM public.refund_coordination_attempts AS a
CROSS JOIN LATERAL unnest(a.ticket_ids) AS claim(ticket_id);

CREATE FUNCTION public.claim_refund_tickets_on_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.ticket_count <> cardinality(NEW.ticket_ids) THEN
    RAISE EXCEPTION 'refund ticket claim count mismatch' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.refund_ticket_claims(ticket_id, coordination_attempt_id)
  SELECT ticket_id, NEW.id FROM unnest(NEW.ticket_ids) AS claim(ticket_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_refund_tickets_on_attempt_insert()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_tickets_on_attempt_insert()
  TO service_role;

CREATE TRIGGER refund_coordination_attempt_claim_tickets
  AFTER INSERT ON public.refund_coordination_attempts
  FOR EACH ROW EXECUTE FUNCTION public.claim_refund_tickets_on_attempt_insert();

COMMENT ON TABLE public.refund_ticket_claims IS
  'Private test-mode refund overlap guard. One durable claim per ticket, including failed and uncertain attempts; service role only.';
