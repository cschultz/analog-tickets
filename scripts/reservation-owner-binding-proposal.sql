-- UNWIRED LOCAL DRAFT. Not a migration or authorization to install.
-- p_owner_user_id MUST come from server-verified authentication, never request JSON.
ALTER TABLE public.inventory_reservations
  ADD COLUMN owner_user_id uuid REFERENCES auth.users(id);

CREATE FUNCTION public.guard_reservation_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'reservation_owner_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_reservation_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reservation_owner_immutable BEFORE UPDATE OF owner_user_id
ON public.inventory_reservations FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_owner();

CREATE FUNCTION public.reserve_owned_ticket_inventory(
  p_owner_user_id uuid, p_event_id uuid, p_slug text, p_quantity integer,
  p_idempotency_key uuid, p_expires_at timestamptz
) RETURNS TABLE(outcome text, reservation_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_ticket public.ticket_types%ROWTYPE;
  v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_owner_user_id IS NULL OR p_event_id IS NULL OR p_slug IS NULL
     OR p_idempotency_key IS NULL OR p_quantity IS NULL OR p_expires_at IS NULL
     OR p_quantity NOT BETWEEN 1 AND 10 OR p_expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid; RETURN;
  END IF;
  -- Serialize this new API's same-key creations, including across different tiers.
  -- Hash collisions only reduce concurrency; ownership still uses exact UUID equality.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'analog-owned-reservation:' || p_idempotency_key::text, 0));
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    -- Legacy unowned rows cannot be retroactively claimed, even by the first caller.
    IF v_hold.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
      RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
    END IF;
    IF v_hold.event_id <> p_event_id OR v_hold.quantity <> p_quantity
       OR v_hold.expires_at <> p_expires_at OR NOT EXISTS (
         SELECT 1 FROM public.ticket_types WHERE id = v_hold.ticket_type_id
           AND event_id = p_event_id AND slug = p_slug
       ) THEN
      RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid; RETURN;
    END IF;
    IF v_hold.status NOT IN ('held','confirmed') OR v_hold.expires_at <= clock_timestamp() THEN
      RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
    END IF;
    RETURN QUERY SELECT 'idempotent_replay'::text, v_hold.id; RETURN;
  END IF;
  SELECT * INTO v_ticket FROM public.ticket_types
    WHERE event_id = p_event_id AND slug = p_slug FOR UPDATE;
  IF NOT FOUND OR NOT v_ticket.is_active OR v_ticket.quantity_total IS NULL THEN
    RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
  END IF;
  -- Recheck the deadline after the capacity lock wait.
  IF p_expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
  END IF;
  IF p_quantity > v_ticket.max_per_order THEN
    RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid; RETURN;
  END IF;
  IF v_ticket.quantity_sold + p_quantity > v_ticket.quantity_total THEN
    RETURN QUERY SELECT 'over_capacity'::text, NULL::uuid; RETURN;
  END IF;
  UPDATE public.ticket_types SET quantity_sold = quantity_sold + p_quantity WHERE id = v_ticket.id;
  INSERT INTO public.inventory_reservations
    (idempotency_key,event_id,ticket_type_id,quantity,status,expires_at,owner_user_id)
    VALUES (p_idempotency_key,p_event_id,v_ticket.id,p_quantity,'held',p_expires_at,p_owner_user_id)
    RETURNING * INTO v_hold;
  RETURN QUERY SELECT 'reserved'::text, v_hold.id;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_owned_ticket_inventory(uuid,uuid,text,integer,uuid,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_owned_ticket_inventory(uuid,uuid,text,integer,uuid,timestamptz)
  TO service_role;

CREATE FUNCTION public.guard_checkout_reservation_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
       AND NEW.ticket_type_id IS NOT DISTINCT FROM OLD.ticket_type_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE id = NEW.reservation_id FOR UPDATE;
  IF NOT FOUND OR v_hold.owner_user_id IS NULL
     OR v_hold.owner_user_id IS DISTINCT FROM NEW.user_id
     OR v_hold.status <> 'confirmed' OR v_hold.expires_at <= clock_timestamp()
     OR v_hold.event_id <> NEW.event_id OR v_hold.ticket_type_id <> NEW.ticket_type_id
     OR v_hold.quantity <> NEW.quantity THEN
    RAISE EXCEPTION 'reservation_not_linkable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_checkout_reservation_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER checkout_reservation_owner BEFORE INSERT OR UPDATE OF
  reservation_id,user_id,event_id,ticket_type_id,quantity ON public.checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_reservation_owner();
