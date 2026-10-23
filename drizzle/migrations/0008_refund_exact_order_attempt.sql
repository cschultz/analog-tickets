-- Draft only: exact order-to-attempt correlation for privileged refund reversal.
-- Historical orders without checkout_attempt_id fail closed. No schema, grants,
-- role, policy, provider, or data-row change. Do not apply without Chris review.

CREATE OR REPLACE FUNCTION public.reverse_refunded_tickets(p_ticket_ids uuid[], p_payment_intent_id text, p_provider_refund_reference text)
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
  v_line_id uuid;
  v_line_qty integer;
  v_unit_price integer;
  v_prior integer;
  v_amount_cents integer;
  v_currency text;
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

  SELECT count(DISTINCT t.order_id), count(DISTINCT t.ticket_type_id), count(DISTINCT t.event_id)
    INTO v_bad, v_found, v_matched
    FROM public.tickets t WHERE t.id = ANY(v_ids);
  IF v_bad <> 1 OR v_found <> 1 OR v_matched <> 1 THEN
    RETURN QUERY SELECT 'mixed_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT t.order_id, t.ticket_type_id, t.event_id
    INTO v_order_id, v_type_id, v_event_id
    FROM public.tickets t WHERE t.id = v_ids[1];

  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN QUERY SELECT 'order_not_paid'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt
    FROM public.checkout_attempts
    WHERE id = v_order.checkout_attempt_id
      AND payment_intent_id = p_payment_intent_id
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

  -- Authoritative immutable order line for this selection.
  SELECT oi.id, oi.quantity, oi.unit_price_cents
    INTO v_line_id, v_line_qty, v_unit_price
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id AND oi.ticket_type_id = v_type_id
    FOR UPDATE;

  -- A selected ticket already attributed to a different line is not a coherent
  -- single-line selection.
  IF v_line_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.tickets t
       WHERE t.id = ANY(v_ids)
         AND t.order_item_id IS NOT NULL
         AND t.order_item_id <> v_line_id) THEN
    RETURN QUERY SELECT 'mixed_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  -- Cumulative bound across every prior reversal of the same line.
  IF v_line_qty IS NOT NULL THEN
    SELECT count(*) INTO v_prior
      FROM public.ticket_refund_items i
      JOIN public.tickets t2 ON t2.id = i.ticket_id
      WHERE t2.order_id = v_order_id AND t2.ticket_type_id = v_type_id;
    IF v_prior + v_n > v_line_qty THEN
      RETURN QUERY SELECT 'selection_exceeds_payment'::text, NULL::uuid, 0, 0; RETURN;
    END IF;
  END IF;

  -- Money is authoritative from the immutable order line; order totals stay
  -- untouched as the paid record. Ambiguity is left NULL, never guessed.
  v_amount_cents := CASE WHEN v_unit_price IS NULL THEN NULL ELSE v_unit_price * v_n END;
  v_currency := CASE
    WHEN v_order.currency IS NOT NULL AND lower(v_order.currency) ~ '^[a-z]{3}$'
      THEN lower(v_order.currency)
    ELSE NULL
  END;

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_n
    WHERE id = v_type_id AND quantity_sold >= v_n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  INSERT INTO public.ticket_refunds(
    provider_refund_reference, payment_intent_id, order_id, event_id, ticket_type_id, ticket_count,
    order_item_id, amount_cents, currency)
  VALUES (p_provider_refund_reference, p_payment_intent_id, v_order_id, v_event_id, v_type_id, v_n,
    v_line_id, v_amount_cents, v_currency)
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
