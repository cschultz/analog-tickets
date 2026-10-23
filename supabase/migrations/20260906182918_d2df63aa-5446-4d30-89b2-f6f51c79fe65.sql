ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS is_refundable boolean NOT NULL DEFAULT false;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS refundable_at_issue boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tickets_guard_server_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user is distinct from 'service_role' then
    new.owner_user_id       := old.owner_user_id;
    new.order_id            := old.order_id;
    new.ticket_type_id      := old.ticket_type_id;
    new.event_id            := old.event_id;
    new.status              := old.status;
    new.checked_in_at       := old.checked_in_at;
    new.refundable_at_issue := old.refundable_at_issue;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_paid_checkout_attempt(p_attempt_id uuid)
 RETURNS TABLE(outcome text, order_id uuid, tickets_issued integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_order_id uuid;
  v_issued integer := 0;
  v_refundable boolean := false;
BEGIN
  IF p_attempt_id IS NULL THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, NULL::uuid, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt FROM public.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.status = 'completed' THEN
    RETURN QUERY SELECT 'idempotent_replay'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.status <> 'pending' THEN
    RETURN QUERY SELECT 'not_finalizable'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.reservation_id IS NULL THEN
    RETURN QUERY SELECT 'unlinked'::text, NULL::uuid, 0; RETURN;
  END IF;

  SELECT * INTO v_reservation
    FROM public.inventory_reservations
    WHERE id = v_attempt.reservation_id
    FOR UPDATE;

  IF NOT FOUND
     OR v_reservation.status <> 'confirmed'
     OR v_reservation.ticket_type_id <> v_attempt.ticket_type_id
     OR v_reservation.event_id <> v_attempt.event_id
     OR v_reservation.quantity <> v_attempt.quantity THEN
    RETURN QUERY SELECT 'not_finalizable'::text, NULL::uuid, 0; RETURN;
  END IF;

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable
    FROM public.ticket_types t
    WHERE t.id = v_attempt.ticket_type_id;
  v_refundable := COALESCE(v_refundable, false);

  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
  VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents);

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable
  FROM generate_series(1, v_attempt.quantity);
  GET DIAGNOSTICS v_issued = ROW_COUNT;

  IF v_issued <> v_attempt.quantity THEN
    RAISE EXCEPTION 'ticket_issuance_invariant_violation';
  END IF;

  UPDATE public.checkout_attempts
    SET status = 'completed', updated_at = now()
    WHERE id = v_attempt.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_finalization_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'finalized'::text, v_order_id, v_issued;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_checkout_attempt(uuid) TO service_role;