-- LOCAL SYNTHETIC DRAFT ONLY, after checkout-recovery-version-proposal.sql.
-- Not a migration runner. No default, backfill, legacy promotion, or new grants.
ALTER TABLE public.checkout_attempts
  DROP CONSTRAINT checkout_attempts_provider_request_version_check,
  ADD CONSTRAINT checkout_attempts_provider_request_version_check
    CHECK (provider_request_version IS NULL OR provider_request_version IN (1,2)),
  ADD COLUMN provider_expires_at_seconds bigint,
  ADD CONSTRAINT checkout_provider_deadline_shape CHECK (
    (COALESCE(provider_request_version,0) IN (0,1) AND provider_expires_at_seconds IS NULL)
    OR (COALESCE(provider_request_version,0)=2 AND provider_expires_at_seconds IS NOT NULL
      AND provider_expires_at_seconds > 0));

CREATE FUNCTION public.guard_checkout_provider_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.inventory_reservations%ROWTYPE; remaining numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.provider_expires_at_seconds IS DISTINCT FROM OLD.provider_expires_at_seconds
      OR (OLD.provider_request_version=2 AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.event_id IS DISTINCT FROM OLD.event_id
        OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id
        OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
        OR NEW.quantity IS DISTINCT FROM OLD.quantity
        OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
        OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.provider IS DISTINCT FROM OLD.provider)) THEN
      RAISE EXCEPTION 'provider request facts immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.provider_request_version IS DISTINCT FROM 2 THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  remaining := NEW.provider_expires_at_seconds - ceil(extract(epoch FROM clock_timestamp()));
  IF NOT FOUND OR r.status <> 'confirmed' OR NEW.status <> 'pending'
    OR NEW.provider <> 'stripe_test' OR r.owner_user_id IS DISTINCT FROM NEW.user_id
    OR r.event_id IS DISTINCT FROM NEW.event_id OR r.ticket_type_id IS DISTINCT FROM NEW.ticket_type_id
    OR r.quantity IS DISTINCT FROM NEW.quantity OR NOT isfinite(r.expires_at)
    OR NEW.provider_expires_at_seconds IS NULL
    OR NEW.provider_expires_at_seconds <> floor(extract(epoch FROM r.expires_at))
    OR remaining < 1816 OR remaining > 86400 THEN
    RAISE EXCEPTION 'invalid provider deadline contract' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_checkout_provider_deadline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checkout_provider_deadline() TO service_role;
CREATE TRIGGER checkout_provider_deadline_guard BEFORE INSERT OR UPDATE ON public.checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_provider_deadline();

CREATE FUNCTION public.guard_linked_provider_hold_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND EXISTS (
    SELECT 1 FROM public.checkout_attempts WHERE reservation_id=OLD.id AND provider_request_version=2
  ) THEN
    RAISE EXCEPTION 'linked provider hold deadline immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_linked_provider_hold_deadline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_linked_provider_hold_deadline() TO service_role;
CREATE TRIGGER linked_provider_hold_deadline_guard BEFORE UPDATE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_linked_provider_hold_deadline();
