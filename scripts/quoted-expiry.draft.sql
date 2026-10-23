-- LOCAL REVIEW ONLY, after quote storage/quoted checkout; before guest promo reader.
-- No installer/migration or hosted application. Trusted server GET evidence only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.ticket_quote_expiry_records (
  quote_id uuid PRIMARY KEY REFERENCES public.ticket_price_quotes(id) ON DELETE RESTRICT,
  cart_id uuid NOT NULL UNIQUE REFERENCES public.guest_checkout_carts(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.inventory_reservations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attempt_id uuid UNIQUE REFERENCES public.checkout_attempts(id) ON DELETE RESTRICT,
  hold_expires_at timestamptz NOT NULL CHECK(isfinite(hold_expires_at)),
  evidence_kind text NOT NULL CHECK(evidence_kind IN ('never_started','start_window_closed','request_never_sent','test_expired_unpaid_null_intent')),
  observed_at timestamptz CHECK(observed_at IS NULL OR isfinite(observed_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
  CHECK((evidence_kind IN ('never_started','start_window_closed') AND attempt_id IS NULL AND observed_at IS NULL)
    OR (evidence_kind='request_never_sent' AND attempt_id IS NOT NULL AND observed_at IS NULL)
    OR (evidence_kind='test_expired_unpaid_null_intent' AND attempt_id IS NOT NULL AND observed_at IS NOT NULL AND observed_at<=recorded_at))
);
ALTER TABLE public.ticket_quote_expiry_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX ticket_quote_expiry_owner_idx ON public.ticket_quote_expiry_records(owner_user_id);
REVOKE ALL ON public.ticket_quote_expiry_records FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.ticket_quote_expiry_records TO service_role;
CREATE TRIGGER ticket_quote_expiry_immutable BEFORE UPDATE OR DELETE ON public.ticket_quote_expiry_records
FOR EACH ROW EXECUTE FUNCTION public.guard_immutable_ticket_quote();
-- Older orphan/expiry helpers must not strand a reserved promo by freeing only
-- stock. Paid/refunded orders retain their existing lifecycle, not expiry logic.
CREATE FUNCTION public.guard_quoted_hold_release() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE;
BEGIN
  IF OLD.status='confirmed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT x.* INTO q FROM public.ticket_price_quotes x JOIN public.guest_checkout_carts c ON c.id=x.cart_id
      WHERE c.reservation_id=OLD.id;
    IF FOUND AND NOT EXISTS(SELECT 1 FROM public.checkout_attempts a JOIN public.orders o ON o.checkout_attempt_id=a.id WHERE a.price_quote_id=q.id)
      AND NOT EXISTS(SELECT 1 FROM public.ticket_quote_expiry_records x WHERE x.quote_id=q.id
        AND x.reservation_id=OLD.id AND x.owner_user_id=OLD.owner_user_id AND x.hold_expires_at=OLD.expires_at) THEN
      RAISE EXCEPTION 'quoted_hold_requires_atomic_release' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER quoted_hold_release BEFORE UPDATE OF status ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_quoted_hold_release();
REVOKE ALL ON FUNCTION public.guard_quoted_hold_release() FROM PUBLIC,anon,authenticated;
-- A durable quoted request marker is required to distinguish "never started"
-- from a possibly sent/uncertain provider request. It cannot be cleared/deleted.
CREATE FUNCTION public.guard_quoted_attempt_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.price_quote_id IS NOT NULL THEN
    RAISE EXCEPTION 'quoted_attempt_history_required' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER quoted_attempt_history BEFORE DELETE ON public.checkout_attempts
FOR EACH ROW EXECUTE FUNCTION public.guard_quoted_attempt_delete();
REVOKE ALL ON FUNCTION public.guard_quoted_attempt_delete() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.release_priced_guest_cart(p_owner uuid,p_cart uuid,
  p_quote uuid DEFAULT NULL,p_attempt uuid DEFAULT NULL,p_deadline bigint DEFAULT NULL,
  p_amount integer DEFAULT NULL,p_currency text DEFAULT NULL,p_observed_at timestamptz DEFAULT NULL,
  p_state text DEFAULT NULL)
RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.guest_checkout_carts%ROWTYPE; q public.ticket_price_quotes%ROWTYPE;
  a public.checkout_attempts%ROWTYPE; h public.inventory_reservations%ROWTYPE;
  x public.ticket_quote_expiry_records%ROWTYPE; v_now timestamptz; v_settled text;
BEGIN
  IF p_owner IS NULL OR p_cart IS NULL THEN RETURN QUERY SELECT 'not_available'::text; RETURN; END IF;
  -- Serialize never-started release with initial provider-attempt creation.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analog-promo-cart:'||p_cart::text,0));
  SELECT * INTO c FROM public.guest_checkout_carts WHERE id=p_cart AND owner_user_id=p_owner;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE cart_id=c.id AND owner_user_id=p_owner;
  IF q.id IS NULL OR q.ticket_type_id<>c.ticket_type_id OR q.quantity<>c.quantity THEN
    RETURN QUERY SELECT 'not_available'::text; RETURN;
  END IF;
  -- Existing attempts follow the same attempt -> hold -> tier -> promotion order as issuance.
  SELECT * INTO a FROM public.checkout_attempts WHERE price_quote_id=q.id FOR UPDATE;
  SELECT * INTO h FROM public.inventory_reservations WHERE id=c.reservation_id FOR UPDATE;
  IF h.id IS NULL OR ROW(h.owner_user_id,h.event_id,h.ticket_type_id,h.quantity)
    IS DISTINCT FROM ROW(p_owner,q.event_id,q.ticket_type_id,q.quantity) OR NOT isfinite(h.expires_at)
    OR q.expires_at>h.expires_at OR (SELECT count(*) FROM public.ticket_quote_allocations WHERE quote_id=q.id)<>q.quantity
    OR EXISTS(SELECT 1 FROM public.checkout_attempts z WHERE z.reservation_id=h.id AND z.id IS DISTINCT FROM a.id)
    OR (a.id IS NOT NULL AND (ROW(a.user_id,a.reservation_id,a.event_id,a.ticket_type_id,a.quantity,
      a.unit_price_cents,a.amount_cents,a.currency,a.provider,a.provider_request_version,a.provider_expires_at_seconds)
      IS DISTINCT FROM ROW(p_owner,h.id,q.event_id,q.ticket_type_id,q.quantity,q.unit_price_cents,q.total_cents,
        q.currency,'stripe_test'::text,2::smallint,floor(extract(epoch FROM q.expires_at))::bigint)
      OR a.payment_intent_id IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public.orders o WHERE o.checkout_attempt_id=a.id)
    OR EXISTS(SELECT 1 FROM public.payment_webhook_events e WHERE e.checkout_attempt_id=a.id
      AND e.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded')) THEN
    RETURN QUERY SELECT 'not_available'::text; RETURN;
  END IF;
  SELECT * INTO x FROM public.ticket_quote_expiry_records WHERE quote_id=q.id;
  IF FOUND THEN
    IF x.cart_id=c.id AND x.reservation_id=h.id AND x.owner_user_id=p_owner
      AND x.attempt_id IS NOT DISTINCT FROM a.id AND x.hold_expires_at=h.expires_at
      AND h.status='released' AND (a.id IS NULL OR a.status='abandoned')
      AND (x.recorded_at>=q.expires_at OR x.evidence_kind IN ('start_window_closed','request_never_sent')) AND x.recorded_at<=clock_timestamp()
      AND (q.promotion_id IS NULL OR EXISTS(SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='released')) THEN
      RETURN QUERY SELECT 'already_released'::text; RETURN;
    END IF;
    RETURN QUERY SELECT 'not_available'::text; RETURN;
  END IF;
  v_now:=clock_timestamp();
  IF h.status IS DISTINCT FROM 'confirmed' OR (a.id IS NOT NULL AND a.status IS DISTINCT FROM 'pending') THEN
    RETURN QUERY SELECT 'not_available'::text; RETURN;
  END IF;
  IF a.id IS NULL THEN
    IF p_quote IS NOT NULL OR p_attempt IS NOT NULL OR p_deadline IS NOT NULL OR p_amount IS NOT NULL
      OR p_currency IS NOT NULL OR p_observed_at IS NOT NULL
      OR (p_state IS NOT NULL AND p_state IS DISTINCT FROM 'start_window_closed')
      OR (p_state IS NULL AND q.expires_at>v_now)
      OR (p_state='start_window_closed' AND floor(extract(epoch FROM q.expires_at))-ceil(extract(epoch FROM v_now))>=1816) THEN
      RETURN QUERY SELECT 'not_available'::text; RETURN;
    END IF;
  ELSIF p_state='request_never_sent' THEN
    -- Trusted first dispatcher only, after the adapter returned and its
    -- transport was NEVER entered. This is not absence/discovery evidence.
    IF p_attempt IS DISTINCT FROM a.id OR p_quote IS NOT NULL OR p_deadline IS NOT NULL
      OR p_amount IS NOT NULL OR p_currency IS NOT NULL OR p_observed_at IS NOT NULL THEN
      RETURN QUERY SELECT 'not_available'::text; RETURN;
    END IF;
  ELSE
    IF q.expires_at>v_now THEN RETURN QUERY SELECT 'not_available'::text; RETURN; END IF;
    IF p_quote IS NULL AND p_attempt IS NULL AND p_deadline IS NULL AND p_amount IS NULL
      AND p_currency IS NULL AND p_observed_at IS NULL AND p_state IS NULL THEN
      RETURN QUERY SELECT 'evidence_required'::text; RETURN;
    END IF;
    IF p_quote IS DISTINCT FROM q.id OR p_attempt IS DISTINCT FROM a.id
      OR p_deadline IS DISTINCT FROM a.provider_expires_at_seconds OR p_amount IS DISTINCT FROM q.total_cents
      OR p_currency IS DISTINCT FROM q.currency OR p_state IS DISTINCT FROM 'test_expired_unpaid_null_intent'
      OR p_observed_at IS NULL OR NOT isfinite(p_observed_at) OR p_observed_at<q.expires_at
      OR p_observed_at>v_now OR p_observed_at<v_now-interval '5 minutes' THEN
      RETURN QUERY SELECT 'not_available'::text; RETURN;
    END IF;
  END IF;
  PERFORM 1 FROM public.ticket_types WHERE id=q.ticket_type_id FOR UPDATE;
  IF q.promotion_id IS NOT NULL THEN
    PERFORM 1 FROM public.ticket_promotions WHERE id=q.promotion_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='reserved') THEN
      RETURN QUERY SELECT 'not_available'::text; RETURN;
    END IF;
  END IF;
  -- Recheck freshness after any tier/promotion lock wait, before the first write.
  IF p_observed_at IS NOT NULL AND (p_observed_at>clock_timestamp() OR p_observed_at<clock_timestamp()-interval '5 minutes') THEN
    RETURN QUERY SELECT 'not_available'::text; RETURN;
  END IF;
  IF a.id IS NOT NULL THEN
    UPDATE public.checkout_attempts SET status='abandoned',updated_at=clock_timestamp() WHERE id=a.id AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'quote_expiry_attempt_invariant'; END IF;
  END IF;
  IF q.promotion_id IS NOT NULL THEN
    SELECT public.settle_ticket_promotion(p_owner,q.id,'released') INTO v_settled;
    IF v_settled<>'settled' THEN RAISE EXCEPTION 'quote_expiry_promotion_invariant'; END IF;
  END IF;
  INSERT INTO public.ticket_quote_expiry_records(quote_id,cart_id,reservation_id,owner_user_id,attempt_id,
    hold_expires_at,evidence_kind,observed_at)
  VALUES(q.id,c.id,h.id,p_owner,a.id,h.expires_at,CASE WHEN p_state IN ('start_window_closed','request_never_sent') THEN p_state
    WHEN a.id IS NULL THEN 'never_started' ELSE 'test_expired_unpaid_null_intent' END,p_observed_at);
  UPDATE public.ticket_types SET quantity_sold=quantity_sold-h.quantity WHERE id=h.ticket_type_id AND quantity_sold>=h.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote_expiry_inventory_invariant'; END IF;
  UPDATE public.inventory_reservations SET status='released',released_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=h.id AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'quote_expiry_hold_invariant'; END IF;
  RETURN QUERY SELECT 'released'::text;
END; $$;
REVOKE ALL ON FUNCTION public.release_priced_guest_cart(uuid,uuid,uuid,uuid,bigint,integer,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_priced_guest_cart(uuid,uuid,uuid,uuid,bigint,integer,text,timestamptz,text) TO service_role;
DO $sandbox_acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON public.ticket_quote_expiry_records FROM sandbox_exec;
    REVOKE ALL ON FUNCTION public.release_priced_guest_cart(uuid,uuid,uuid,uuid,bigint,integer,text,timestamptz,text) FROM sandbox_exec;
    REVOKE ALL ON FUNCTION public.guard_quoted_hold_release() FROM sandbox_exec;
    REVOKE ALL ON FUNCTION public.guard_quoted_attempt_delete() FROM sandbox_exec;
  END IF;
END; $sandbox_acl$;
COMMIT;
