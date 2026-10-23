CREATE TABLE public.ticket_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_refund_reference text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  ticket_count integer NOT NULL CHECK (ticket_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ticket_refunds TO service_role;
ALTER TABLE public.ticket_refunds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.ticket_refunds(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ticket_refund_items TO service_role;
ALTER TABLE public.ticket_refund_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX ticket_refund_items_refund_id_idx ON public.ticket_refund_items(refund_id);

CREATE TRIGGER ticket_refunds_set_updated_at
  BEFORE UPDATE ON public.ticket_refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ticket_refunds IS 'Private staging: idempotent per-ticket reversal ledger. Opaque test-mode provider references only; no PII.';

CREATE OR REPLACE FUNCTION public.reverse_refunded_tickets(
  p_ticket_ids uuid[],
  p_payment_intent_id text,
  p_provider_refund_reference text
)
RETURNS TABLE(outcome text, refund_id uuid, tickets_reversed integer, restocked integer)
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_ids uuid[];
  v_n integer;
  v_refund public.ticket_refunds%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_attempt public.checkout_attempts%ROWTYPE;
  v_order_id uuid;
  v_type_id uuid;
  v_event_id uuid;
  v_bad integer;
  v_found integer;
  v_matched integer;
  v_new_refund_id uuid;
  v_updated integer;
BEGIN
  IF p_provider_refund_reference IS NULL
     OR p_provider_refund_reference !~ '^re_[A-Za-z0-9_]{6,120}$' THEN
    RETURN QUERY SELECT 'invalid_reference'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF p_payment_intent_id IS NULL
     OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]{6,120}$' THEN
    RETURN QUERY SELECT 'invalid_payment_reference'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF p_ticket_ids IS NULL
     OR COALESCE(array_length(p_ticket_ids, 1), 0) = 0
     OR array_length(p_ticket_ids, 1) > 50
     OR array_position(p_ticket_ids, NULL) IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT array_agg(DISTINCT t) INTO v_ids FROM unnest(p_ticket_ids) AS t;
  IF cardinality(v_ids) <> array_length(p_ticket_ids, 1) THEN
    RETURN QUERY SELECT 'duplicate_ticket_ids'::text, NULL::uuid, 0, 0; RETURN;
  END IF;
  v_n := cardinality(v_ids);

  SELECT * INTO v_refund
    FROM public.ticket_refunds
    WHERE provider_refund_reference = p_provider_refund_reference
    FOR UPDATE;
  IF FOUND THEN
    SELECT count(*) INTO v_matched
      FROM public.ticket_refund_items i
      WHERE i.refund_id = v_refund.id AND i.ticket_id = ANY(v_ids);
    IF v_refund.ticket_count = v_n
       AND v_matched = v_n
       AND v_refund.payment_intent_id = p_payment_intent_id THEN
      RETURN QUERY SELECT 'idempotent_replay'::text, v_refund.id, 0, 0; RETURN;
    END IF;
    RETURN QUERY SELECT 'reference_conflict'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  PERFORM 1 FROM public.tickets WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_found FROM public.tickets WHERE id = ANY(v_ids);
  IF v_found <> v_n THEN
    RETURN QUERY SELECT 'unknown_ticket'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.tickets WHERE id = ANY(v_ids) AND checked_in_at IS NOT NULL;
  IF v_bad > 0 THEN
    RETURN QUERY SELECT 'checked_in_ticket'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.tickets WHERE id = ANY(v_ids) AND status <> 'issued';
  IF v_bad > 0 THEN
    RETURN QUERY SELECT 'ticket_not_issued'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.tickets WHERE id = ANY(v_ids) AND refundable_at_issue IS DISTINCT FROM true;
  IF v_bad > 0 THEN
    RETURN QUERY SELECT 'ticket_not_refundable'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticket_refund_items WHERE ticket_id = ANY(v_ids)) THEN
    RETURN QUERY SELECT 'ticket_already_reversed'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(DISTINCT order_id), count(DISTINCT ticket_type_id), count(DISTINCT event_id),
         min(order_id), min(ticket_type_id), min(event_id)
    INTO v_bad, v_found, v_matched, v_order_id, v_type_id, v_event_id
    FROM public.tickets WHERE id = ANY(v_ids);
  IF v_bad <> 1 OR v_found <> 1 OR v_matched <> 1 THEN
    RETURN QUERY SELECT 'mixed_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN QUERY SELECT 'order_not_paid'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt
    FROM public.checkout_attempts
    WHERE payment_intent_id = p_payment_intent_id
      AND status = 'completed'
      AND provider = 'stripe_test'
      AND user_id = v_order.user_id
      AND event_id = v_order.event_id
      AND ticket_type_id = v_type_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'payment_not_correlated'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF v_n > v_attempt.quantity THEN
    RETURN QUERY SELECT 'selection_exceeds_payment'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_n
    WHERE id = v_type_id AND quantity_sold >= v_n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  INSERT INTO public.ticket_refunds(
    provider_refund_reference, payment_intent_id, order_id, event_id, ticket_type_id, ticket_count)
  VALUES (p_provider_refund_reference, p_payment_intent_id, v_order_id, v_event_id, v_type_id, v_n)
  RETURNING id INTO v_new_refund_id;

  INSERT INTO public.ticket_refund_items(refund_id, ticket_id)
  SELECT v_new_refund_id, t FROM unnest(v_ids) AS t;

  UPDATE public.tickets
    SET status = 'void'
    WHERE id = ANY(v_ids) AND status = 'issued';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_n THEN
    RAISE EXCEPTION 'ticket_reversal_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'reversed'::text, v_new_refund_id, v_n, v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) TO service_role;