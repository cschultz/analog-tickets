-- Gate 165 — approved canonical internal payment-correlation link.
-- Additive and backward compatible: one nullable column, one restrictive FK,
-- one uniqueness guarantee, one server-field guard, and a body-only writer
-- update. No backfill, no historical order is touched, no grant, role, policy,
-- view or client exposure changes.

-- 1. Canonical link column. Nullable: every historical order keeps NULL.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_attempt_id uuid;

-- 2. Restrictive delete behaviour: a checkout attempt that an order points at
--    can never be deleted out from under the correlation.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_checkout_attempt_id_fkey
  FOREIGN KEY (checkout_attempt_id)
  REFERENCES public.checkout_attempts(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- 3. An attempt cannot silently belong to more than one order. A partial
--    unique index leaves the many NULL historical orders unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_attempt_id_unique
  ON public.orders (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

-- 4. Server-field guard, mirroring public.tickets_guard_server_fields. A
--    non-service_role caller can never set, clear or repoint the link, on
--    INSERT or on UPDATE. Nothing else about an order is altered here.
CREATE OR REPLACE FUNCTION public.orders_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
begin
  if current_user is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      new.checkout_attempt_id := null;
    else
      new.checkout_attempt_id := old.checkout_attempt_id;
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS orders_guard_server_fields_trg ON public.orders;
CREATE TRIGGER orders_guard_server_fields_trg
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_server_fields();

-- 5. Writer: the paid-checkout finalization routine persists the creating
--    attempt id atomically with order creation. Body-only change; signature,
--    return shape, language, volatility, owner, SECURITY INVOKER mode, empty
--    search_path, grants, totals, outcomes and idempotency are all preserved.
CREATE OR REPLACE FUNCTION public.finalize_paid_checkout_attempt(p_attempt_id uuid)
 RETURNS TABLE(outcome text, order_id uuid, tickets_issued integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_order_id uuid;
  v_order_item_id uuid;
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

  -- Gate 165: the creating attempt id is written in the same INSERT as the
  -- order itself, so an order and its canonical payment correlation are
  -- created atomically or not at all. Totals remain the immutable paid record.
  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency, checkout_attempt_id)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency, v_attempt.id)
  RETURNING id INTO v_order_id;

  -- Authoritative line identity. The Gate 149c unique
  -- (order_id, ticket_type_id) invariant makes this deterministic.
  SELECT oi.id INTO v_order_item_id
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id
      AND oi.ticket_type_id = v_attempt.ticket_type_id
    FOR UPDATE;

  IF v_order_item_id IS NULL THEN
    INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
    VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents)
    RETURNING id INTO v_order_item_id;
  ELSE
    UPDATE public.order_items oi
      SET quantity = v_attempt.quantity,
          unit_price_cents = v_attempt.unit_price_cents
      WHERE oi.id = v_order_item_id;
  END IF;

  IF v_order_item_id IS NULL THEN
    RAISE EXCEPTION 'order_line_identity_invariant_violation';
  END IF;

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id
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