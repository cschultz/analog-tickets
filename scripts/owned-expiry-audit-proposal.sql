-- UNAPPLIED LOCAL DRAFT after guarded-v2-expiry-release-proposal.sql.
-- A recorded inventory release is NOT proof of payment failure or a webhook.
-- Trusted server callers must verify owner identity and exact fresh provider
-- evidence. No browser/table grants, provider IDs, contacts or raw payloads.
CREATE TABLE public.checkout_expiry_recoveries (
  attempt_id uuid PRIMARY KEY REFERENCES public.checkout_attempts(id),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.inventory_reservations(id),
  owner_user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  ticket_type_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents integer NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  hold_expires_at timestamptz NOT NULL CHECK (isfinite(hold_expires_at)),
  provider_expires_at_seconds bigint NOT NULL CHECK (provider_expires_at_seconds > 0),
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  evidence_contract text NOT NULL DEFAULT 'test_expired_unpaid_null_intent_v2'
    CHECK (evidence_contract='test_expired_unpaid_null_intent_v2'),
  CHECK (amount_cents::bigint=quantity::bigint*unit_price_cents),
  CHECK (floor(extract(epoch FROM hold_expires_at))=provider_expires_at_seconds),
  CHECK (observed_at>=hold_expires_at AND observed_at<=recorded_at)
);
-- PK and UNIQUE index both FK columns; there are no cascading deletions.
ALTER TABLE public.checkout_expiry_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.checkout_expiry_recoveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON TABLE public.checkout_expiry_recoveries TO service_role;
-- The captured hosted default ACL also grants SELECT/INSERT to sandbox_exec.
-- Remove that inherited access on this new table only; do not change the role
-- or project-wide default privileges. Local fixtures may not have this role.
DO $audit_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON TABLE public.checkout_expiry_recoveries FROM sandbox_exec;
  END IF;
END; $audit_grants$;

CREATE FUNCTION public.release_owned_expired_v2_checkout_attempt(
  p_attempt_id uuid, p_reservation_id uuid, p_owner_user_id uuid,
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_unit_price_cents integer, p_amount_cents integer, p_currency text,
  p_hold_expires_at timestamptz, p_provider_expires_at_seconds bigint,
  p_observed_expires_at_seconds bigint, p_observed_at timestamptz,
  p_observed_status text, p_observed_payment_status text, p_observed_intent_state text
) RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result record; audit public.checkout_expiry_recoveries%ROWTYPE;
BEGIN
  -- Delegate all evidence, tuple, deadline, payment protection and stock logic
  -- to the existing writer. Preserve attempt -> hold lock order. Both function
  -- calls and the audit INSERT are one SQL statement/transaction.
  SELECT * INTO STRICT result FROM public.release_expired_v2_checkout_attempt(
    p_attempt_id,p_reservation_id,p_owner_user_id,p_event_id,p_ticket_type_id,
    p_quantity,p_unit_price_cents,p_amount_cents,p_currency,p_hold_expires_at,
    p_provider_expires_at_seconds,p_observed_expires_at_seconds,p_observed_at,
    p_observed_status,p_observed_payment_status,p_observed_intent_state
  );
  IF result.outcome='released' AND result.released=1 THEN
    -- No upsert: an unexpected conflicting audit must roll back the release,
    -- never overwrite prior history or quietly claim success.
    INSERT INTO public.checkout_expiry_recoveries(
      attempt_id,reservation_id,owner_user_id,event_id,ticket_type_id,quantity,
      unit_price_cents,amount_cents,currency,hold_expires_at,
      provider_expires_at_seconds,observed_at
    ) VALUES (
      p_attempt_id,p_reservation_id,p_owner_user_id,p_event_id,p_ticket_type_id,
      p_quantity,p_unit_price_cents,p_amount_cents,p_currency,p_hold_expires_at,
      p_provider_expires_at_seconds,p_observed_at
    );
    RETURN QUERY SELECT 'release_recorded'::text,1; RETURN;
  ELSIF result.outcome='idempotent_replay' AND result.released=0 THEN
    SELECT * INTO audit FROM public.checkout_expiry_recoveries WHERE attempt_id=p_attempt_id;
    IF FOUND AND ROW(audit.reservation_id,audit.owner_user_id,audit.event_id,
      audit.ticket_type_id,audit.quantity,audit.unit_price_cents,audit.amount_cents,
      audit.currency,audit.hold_expires_at,audit.provider_expires_at_seconds)
      IS NOT DISTINCT FROM ROW(p_reservation_id,p_owner_user_id,p_event_id,
      p_ticket_type_id,p_quantity,p_unit_price_cents,p_amount_cents,p_currency,
      p_hold_expires_at,p_provider_expires_at_seconds) THEN
      RETURN QUERY SELECT 'recorded_replay'::text,0; RETURN;
    END IF;
    -- Existing unaudited/webhook release is not retroactively owner-audited.
    RETURN QUERY SELECT 'release_unrecorded'::text,0; RETURN;
  END IF;
  RETURN QUERY SELECT result.outcome::text,result.released::integer;
END; $$;
REVOKE ALL ON FUNCTION public.release_owned_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_owned_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) TO service_role;

-- Read-only, one-snapshot historical release projection. Never payment proof.
-- Caller owner MUST be verified by the server; not accepted from browser JSON.
CREATE FUNCTION public.read_owned_expiry_release_record(
  p_reservation_id uuid, p_owner_user_id uuid
) RETURNS TABLE(outcome text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.checkout_expiry_recoveries x
    JOIN public.checkout_attempts a ON a.id=x.attempt_id
    JOIN public.inventory_reservations r ON r.id=x.reservation_id
    WHERE x.reservation_id=p_reservation_id AND x.owner_user_id=p_owner_user_id
      AND a.reservation_id=r.id AND a.user_id=p_owner_user_id
      AND r.owner_user_id=p_owner_user_id
      AND a.status='abandoned' AND r.status='released'
      AND a.provider='stripe_test' AND a.provider_request_version=2
      AND a.payment_intent_id IS NULL
      AND x.evidence_contract='test_expired_unpaid_null_intent_v2'
      AND ROW(x.event_id,x.ticket_type_id,x.quantity,x.unit_price_cents,
        x.amount_cents,x.currency,x.provider_expires_at_seconds)
        IS NOT DISTINCT FROM ROW(a.event_id,a.ticket_type_id,a.quantity,
        a.unit_price_cents,a.amount_cents,a.currency,a.provider_expires_at_seconds)
      AND ROW(r.event_id,r.ticket_type_id,r.quantity,r.expires_at)
        IS NOT DISTINCT FROM ROW(x.event_id,x.ticket_type_id,x.quantity,x.hold_expires_at)
      AND a.created_at<=x.observed_at AND x.hold_expires_at<=x.observed_at
      AND x.observed_at<=x.recorded_at AND x.recorded_at<=statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM public.checkout_attempts other
        WHERE other.reservation_id=r.id AND other.id<>a.id)
      AND NOT EXISTS (SELECT 1 FROM public.payment_webhook_events paid
        WHERE paid.checkout_attempt_id=a.id AND paid.status='processed'
        AND paid.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded'))
  ) THEN 'release_recorded'::text ELSE 'unresolved'::text END;
$$;
REVOKE ALL ON FUNCTION public.read_owned_expiry_release_record(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_owned_expiry_release_record(uuid,uuid) TO service_role;
