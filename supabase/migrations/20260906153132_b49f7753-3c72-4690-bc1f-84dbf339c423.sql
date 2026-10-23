ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.inventory_reservations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.abandon_expired_checkout_attempt(p_attempt_id uuid)
RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt FROM public.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, 0; RETURN;
  END IF;

  IF v_attempt.status = 'abandoned' THEN
    RETURN QUERY SELECT 'idempotent_replay'::text, 0; RETURN;
  END IF;

  IF v_attempt.status <> 'pending' THEN
    RETURN QUERY SELECT 'not_abandonable'::text, 0; RETURN;
  END IF;

  UPDATE public.checkout_attempts
    SET status = 'abandoned', updated_at = now()
    WHERE id = v_attempt.id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_abandonable'::text, 0; RETURN;
  END IF;

  IF v_attempt.reservation_id IS NULL THEN
    RETURN QUERY SELECT 'abandoned'::text, 0; RETURN;
  END IF;

  SELECT * INTO v_reservation
    FROM public.inventory_reservations
    WHERE id = v_attempt.reservation_id
    FOR UPDATE;

  IF NOT FOUND OR v_reservation.status <> 'confirmed' THEN
    RETURN QUERY SELECT 'abandoned'::text, 0; RETURN;
  END IF;

  IF v_reservation.ticket_type_id <> v_attempt.ticket_type_id
     OR v_reservation.event_id <> v_attempt.event_id THEN
    RETURN QUERY SELECT 'abandoned'::text, 0; RETURN;
  END IF;

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_reservation.quantity
    WHERE id = v_reservation.ticket_type_id
      AND quantity_sold >= v_reservation.quantity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  UPDATE public.inventory_reservations
    SET status = 'released', released_at = now()
    WHERE id = v_reservation.id AND status = 'confirmed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'abandoned_released'::text, 1;
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_expired_checkout_attempt(uuid) TO service_role;