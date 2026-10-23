-- UNAPPLIED proposal. Not a migration. Install neither half independently.
-- Local synthetic testing only until Chris reviews and separately approves installation.

CREATE OR REPLACE FUNCTION public.guard_checkout_reservation_link()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
       AND NEW.ticket_type_id IS NOT DISTINCT FROM OLD.ticket_type_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN RETURN NEW; END IF;
  END IF;
  -- Serializes new links with exact orphan cleanup. FK key-share locking alone
  -- cannot prevent attaching to a released-but-still-existing hold.
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE id = NEW.reservation_id FOR UPDATE;
  IF NOT FOUND OR v_hold.status <> 'confirmed' OR v_hold.expires_at <= clock_timestamp()
     OR v_hold.event_id <> NEW.event_id OR v_hold.ticket_type_id <> NEW.ticket_type_id
     OR v_hold.quantity <> NEW.quantity THEN
    RAISE EXCEPTION 'reservation_not_linkable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_checkout_reservation_link() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checkout_reservation_link() TO service_role;
CREATE TRIGGER checkout_attempts_guard_reservation_link
  BEFORE INSERT OR UPDATE OF reservation_id, event_id, ticket_type_id, quantity
  ON public.checkout_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_reservation_link();

CREATE OR REPLACE FUNCTION public.release_expired_orphan_reservation(
  p_reservation_id uuid, p_idempotency_key uuid, p_event_id uuid,
  p_ticket_type_id uuid, p_quantity integer, p_expires_at timestamptz
) RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_idempotency_key IS NULL OR p_event_id IS NULL
     OR p_ticket_type_id IS NULL OR p_quantity IS NULL OR p_expires_at IS NULL THEN
    RETURN QUERY SELECT 'invalid_request'::text, 0; RETURN;
  END IF;
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_reservation'::text, 0; RETURN; END IF;
  IF v_hold.idempotency_key <> p_idempotency_key OR v_hold.event_id <> p_event_id
     OR v_hold.ticket_type_id <> p_ticket_type_id OR v_hold.quantity <> p_quantity
     OR v_hold.expires_at <> p_expires_at THEN
    RETURN QUERY SELECT 'mismatch'::text, 0; RETURN;
  END IF;
  -- Every attempt status protects the hold, not just pending/paid.
  IF EXISTS (SELECT 1 FROM public.checkout_attempts WHERE reservation_id = v_hold.id) THEN
    RETURN QUERY SELECT 'linked_attempt'::text, 0; RETURN;
  END IF;
  IF v_hold.status = 'released' THEN
    RETURN QUERY SELECT 'already_released'::text, 0; RETURN;
  END IF;
  IF v_hold.status <> 'confirmed' THEN
    RETURN QUERY SELECT 'not_confirmed'::text, 0; RETURN;
  END IF;
  IF v_hold.expires_at > clock_timestamp() THEN RETURN QUERY SELECT 'not_due'::text, 0; RETURN; END IF;
  UPDATE public.ticket_types SET quantity_sold = quantity_sold - v_hold.quantity
    WHERE id = v_hold.ticket_type_id AND quantity_sold >= v_hold.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status = 'released', released_at = now()
    WHERE id = v_hold.id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_cleanup_invariant_violation'; END IF;
  RETURN QUERY SELECT 'released'::text, 1;
END; $$;
REVOKE ALL ON FUNCTION public.release_expired_orphan_reservation(uuid,uuid,uuid,uuid,integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_orphan_reservation(uuid,uuid,uuid,uuid,integer,timestamptz)
  TO service_role;
