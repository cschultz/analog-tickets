-- UNAPPLIED LOCAL DRAFT after the v2 deadline proposal. Not a migration.
-- Evidence inputs MUST come from a signature-verified exact session or a trusted
-- exact provider retrieve, never caller JSON or a discovery candidate alone.
CREATE FUNCTION public.release_expired_v2_checkout_attempt(
  p_attempt_id uuid, p_reservation_id uuid, p_owner_user_id uuid,
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_unit_price_cents integer, p_amount_cents integer, p_currency text,
  p_hold_expires_at timestamptz, p_provider_expires_at_seconds bigint,
  p_observed_expires_at_seconds bigint, p_observed_at timestamptz,
  p_observed_status text, p_observed_payment_status text, p_observed_intent_state text
) RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.checkout_attempts%ROWTYPE; r public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL OR p_reservation_id IS NULL OR p_owner_user_id IS NULL
    OR p_event_id IS NULL OR p_ticket_type_id IS NULL OR p_quantity IS NULL
    OR p_unit_price_cents IS NULL OR p_amount_cents IS NULL OR p_currency IS NULL
    OR p_hold_expires_at IS NULL OR NOT isfinite(p_hold_expires_at)
    OR p_provider_expires_at_seconds IS NULL OR p_observed_expires_at_seconds IS NULL
    OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
    OR p_quantity NOT BETWEEN 1 AND 10 OR p_unit_price_cents < 0
    OR p_amount_cents::bigint <> p_unit_price_cents::bigint*p_quantity
    OR p_currency !~ '^[a-z]{3}$' OR p_provider_expires_at_seconds <= 0
    OR p_observed_expires_at_seconds <> p_provider_expires_at_seconds
    OR p_observed_status IS DISTINCT FROM 'expired'
    OR p_observed_payment_status IS DISTINCT FROM 'unpaid'
    OR p_observed_intent_state IS DISTINCT FROM 'none' THEN
    RETURN QUERY SELECT 'invalid_evidence'::text,0; RETURN;
  END IF;
  -- Same lock order as paid finalization. Recheck clocks after lock waits.
  SELECT * INTO a FROM public.checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_attempt'::text,0; RETURN; END IF;
  IF a.provider_request_version IS DISTINCT FROM 2 OR a.provider <> 'stripe_test'
    OR a.reservation_id IS DISTINCT FROM p_reservation_id
    OR a.user_id IS DISTINCT FROM p_owner_user_id OR a.event_id IS DISTINCT FROM p_event_id
    OR a.ticket_type_id IS DISTINCT FROM p_ticket_type_id OR a.quantity IS DISTINCT FROM p_quantity
    OR a.unit_price_cents IS DISTINCT FROM p_unit_price_cents
    OR a.amount_cents IS DISTINCT FROM p_amount_cents OR a.currency IS DISTINCT FROM p_currency
    OR a.provider_expires_at_seconds IS DISTINCT FROM p_provider_expires_at_seconds THEN
    RETURN QUERY SELECT 'mismatch'::text,0; RETURN;
  END IF;
  SELECT * INTO r FROM public.inventory_reservations WHERE id=a.reservation_id FOR UPDATE;
  IF NOT FOUND OR r.owner_user_id IS DISTINCT FROM a.user_id
    OR r.event_id IS DISTINCT FROM a.event_id OR r.ticket_type_id IS DISTINCT FROM a.ticket_type_id
    OR r.quantity IS DISTINCT FROM a.quantity OR r.expires_at IS DISTINCT FROM p_hold_expires_at
    OR NOT isfinite(r.expires_at)
    OR floor(extract(epoch FROM r.expires_at)) <> a.provider_expires_at_seconds THEN
    RETURN QUERY SELECT 'mismatch'::text,0; RETURN;
  END IF;
  -- All other linked attempts protect this hold, including terminal ones. The
  -- hold lock serializes new links with the existing link/owner insert guards.
  IF EXISTS (SELECT 1 FROM public.checkout_attempts other
    WHERE other.reservation_id=r.id AND other.id <> a.id) THEN
    RETURN QUERY SELECT 'other_attempt_protected'::text,0; RETURN;
  END IF;
  -- A stored correlation or processed paid delivery protects unresolved/fulfilled
  -- payment. Atomic finalization's completed state also protects fulfillment.
  IF a.payment_intent_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.payment_webhook_events e WHERE e.checkout_attempt_id=a.id
      AND e.status='processed' AND e.event_type IN (
        'checkout.session.completed','checkout.session.async_payment_succeeded')) THEN
    RETURN QUERY SELECT 'payment_protected'::text,0; RETURN;
  END IF;
  IF a.status='abandoned' AND r.status='released' THEN
    RETURN QUERY SELECT 'idempotent_replay'::text,0; RETURN;
  END IF;
  IF a.status <> 'pending' OR r.status <> 'confirmed' THEN
    RETURN QUERY SELECT 'not_releasable'::text,0; RETURN;
  END IF;
  IF r.expires_at > clock_timestamp()
    OR a.provider_expires_at_seconds > extract(epoch FROM clock_timestamp())
    OR p_observed_at > clock_timestamp() OR p_observed_at < r.expires_at
    OR p_observed_at < clock_timestamp()-interval '5 minutes' THEN
    RETURN QUERY SELECT 'not_due_or_stale'::text,0; RETURN;
  END IF;
  UPDATE public.ticket_types SET quantity_sold=quantity_sold-r.quantity
    WHERE id=r.ticket_type_id AND quantity_sold>=r.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status='released',released_at=now(),updated_at=now()
    WHERE id=r.id AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_cleanup_invariant_violation'; END IF;
  UPDATE public.checkout_attempts SET status='abandoned',updated_at=now()
    WHERE id=a.id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_cleanup_invariant_violation'; END IF;
  RETURN QUERY SELECT 'released'::text,1;
END; $$;
REVOKE ALL ON FUNCTION public.release_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) TO service_role;

-- Close the old UUID-only v2 bypass; preserve captured legacy behavior exactly.
CREATE OR REPLACE FUNCTION public.abandon_expired_checkout_attempt(p_attempt_id uuid)
RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.checkout_attempts%ROWTYPE; r public.inventory_reservations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_attempt'::text,0; RETURN; END IF;
  IF a.provider_request_version=2 THEN
    RETURN QUERY SELECT 'not_abandonable'::text,0; RETURN;
  END IF;
  IF a.status='abandoned' THEN RETURN QUERY SELECT 'idempotent_replay'::text,0; RETURN; END IF;
  IF a.status <> 'pending' THEN RETURN QUERY SELECT 'not_abandonable'::text,0; RETURN; END IF;
  UPDATE public.checkout_attempts SET status='abandoned',updated_at=now() WHERE id=a.id AND status='pending';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_abandonable'::text,0; RETURN; END IF;
  IF a.reservation_id IS NULL THEN RETURN QUERY SELECT 'abandoned'::text,0; RETURN; END IF;
  SELECT * INTO r FROM public.inventory_reservations WHERE id=a.reservation_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'confirmed' OR r.ticket_type_id <> a.ticket_type_id
    OR r.event_id <> a.event_id THEN RETURN QUERY SELECT 'abandoned'::text,0; RETURN; END IF;
  UPDATE public.ticket_types SET quantity_sold=quantity_sold-r.quantity
    WHERE id=r.ticket_type_id AND quantity_sold>=r.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status='released',released_at=now()
    WHERE id=r.id AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  RETURN QUERY SELECT 'abandoned_released'::text,1;
END; $$;
REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_expired_checkout_attempt(uuid) TO service_role;
