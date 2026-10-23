-- LOCAL DRAFT ONLY. Requires reservation-owner-binding-proposal.sql; not a migration.
-- Owner is supplied only by the server after verified authentication.
CREATE FUNCTION public.prepare_owned_ticket_reservation(
  p_owner_user_id uuid, p_ticket_type_id uuid, p_quantity integer, p_idempotency_key uuid
) RETURNS TABLE(outcome text, reservation_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_hold public.inventory_reservations%ROWTYPE;
  v_ticket public.ticket_types%ROWTYPE;
  v_result record;
  v_expiry timestamptz;
BEGIN
  IF p_owner_user_id IS NULL OR p_ticket_type_id IS NULL OR p_quantity IS NULL
     OR p_quantity NOT BETWEEN 1 AND 10 OR p_idempotency_key IS NULL THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'analog-owned-reservation:' || p_idempotency_key::text, 0));
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_hold.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_hold.ticket_type_id <> p_ticket_type_id OR v_hold.quantity <> p_quantity
       OR v_hold.status NOT IN ('held','confirmed') OR v_hold.expires_at <= clock_timestamp() THEN
      RETURN QUERY SELECT 'not_available'::text,NULL::uuid,NULL::timestamptz; RETURN;
    END IF;
    v_expiry := v_hold.expires_at; -- replay never extends the original deadline
  ELSE
    -- Approved source-only contract: new holds allow a matching provider expiry.
    -- Existing holds above retain their exact deadline; this is not a backfill.
    v_expiry := clock_timestamp() + interval '35 minutes';
  END IF;
  SELECT t.* INTO v_ticket FROM public.ticket_types t JOIN public.events e ON e.id=t.event_id
    WHERE t.id=p_ticket_type_id AND t.is_active AND e.is_published;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v_result FROM public.reserve_owned_ticket_inventory(
    p_owner_user_id,v_ticket.event_id,v_ticket.slug,p_quantity,p_idempotency_key,v_expiry);
  IF v_result.outcome NOT IN ('reserved','idempotent_replay') THEN
    RETURN QUERY SELECT v_result.outcome,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  -- The nested reservation routine already locks the hold. Check again after waits.
  UPDATE public.inventory_reservations r SET status='confirmed'
    WHERE r.id=v_result.reservation_id AND r.owner_user_id=p_owner_user_id
      AND r.ticket_type_id=p_ticket_type_id AND r.quantity=p_quantity
      AND r.status IN ('held','confirmed') AND r.expires_at>clock_timestamp()
      AND EXISTS (SELECT 1 FROM public.ticket_types t JOIN public.events e ON e.id=t.event_id
        WHERE t.id=p_ticket_type_id AND t.is_active AND e.is_published)
    RETURNING r.* INTO v_hold;
  IF NOT FOUND THEN
    -- Roll back the nested inventory allocation too; never commit a half-prepared hold.
    RAISE EXCEPTION 'reservation_preparation_invariant' USING ERRCODE='23514';
  END IF;
  RETURN QUERY SELECT 'ready'::text,v_hold.id,v_hold.expires_at;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_owned_ticket_reservation(uuid,uuid,integer,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_owned_ticket_reservation(uuid,uuid,integer,uuid)
  TO service_role;
