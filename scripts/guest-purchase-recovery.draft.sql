-- LOCAL/REVIEW ONLY. Requires guest-checkout-carts.draft.sql and current installer.
-- Not a migration, installer step, or permission to apply to a hosted backend.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX guest_cart_contact_recovery_idx ON public.guest_checkout_carts(lower(buyer_email),created_at DESC);
CREATE TABLE public.guest_purchase_deliveries (
  cart_id uuid PRIMARY KEY REFERENCES public.guest_checkout_carts(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','uncertain')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_id uuid, lease_expires_at timestamptz,
  proof_digest text UNIQUE CHECK(proof_digest ~ '^[0-9a-f]{64}$'),
  proof_expires_at timestamptz, consumed_at timestamptz,
  send_count integer NOT NULL DEFAULT 0 CHECK(send_count BETWEEN 0 AND 5),
  window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at timestamptz
);
CREATE INDEX guest_delivery_pending_idx ON public.guest_purchase_deliveries(requested_at) WHERE state='pending';
CREATE TABLE public.guest_purchase_sessions (
  session_digest text PRIMARY KEY CHECK(session_digest ~ '^[0-9a-f]{64}$'),
  cart_id uuid NOT NULL REFERENCES public.guest_checkout_carts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '1 hour'),
  revoked_at timestamptz
);
CREATE INDEX guest_purchase_sessions_cart_idx ON public.guest_purchase_sessions(cart_id);
ALTER TABLE public.guest_purchase_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_purchase_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_purchase_deliveries,public.guest_purchase_sessions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.guest_purchase_deliveries,public.guest_purchase_sessions TO service_role;

-- Same transaction as issuance: delivery work survives a buyer who never returns.
CREATE FUNCTION public.queue_guest_purchase_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.guest_purchase_deliveries(cart_id)
      SELECT c.id FROM public.guest_checkout_carts c
      WHERE c.reservation_id=NEW.reservation_id AND c.owner_user_id=NEW.user_id
      ON CONFLICT(cart_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guest_purchase_receipt_queue AFTER UPDATE OF status ON public.checkout_attempts
FOR EACH ROW EXECUTE FUNCTION public.queue_guest_purchase_receipt();

-- Digest and lease come only from a server CSPRNG. No mail/network call under locks.
CREATE FUNCTION public.claim_guest_purchase_delivery(p_cart_id uuid,p_lease_id uuid,p_proof_digest text)
RETURNS TABLE(cart_id uuid,owner_id uuid,buyer_email text) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.guest_checkout_carts%ROWTYPE; d public.guest_purchase_deliveries%ROWTYPE;
BEGIN
  IF p_cart_id IS NULL OR p_lease_id IS NULL OR p_proof_digest IS NULL OR p_proof_digest !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
  SELECT g.* INTO c FROM public.guest_checkout_carts g WHERE g.id=p_cart_id;
  IF NOT FOUND OR lower(c.buyer_email) NOT LIKE '%@example.test' OR NOT EXISTS (
    SELECT 1 FROM public.checkout_attempts a JOIN public.orders o ON o.checkout_attempt_id=a.id
    WHERE a.reservation_id=c.reservation_id AND a.user_id=c.owner_user_id
      AND a.ticket_type_id=c.ticket_type_id AND a.quantity=c.quantity AND a.status='completed'
      AND a.provider='stripe_test' AND a.provider_request_version=2
      AND o.user_id=c.owner_user_id AND o.event_id=a.event_id AND o.status IN ('paid','refunded')
  ) THEN RETURN; END IF;
  INSERT INTO public.guest_purchase_deliveries(cart_id) VALUES(p_cart_id) ON CONFLICT DO NOTHING;
  SELECT g.* INTO d FROM public.guest_purchase_deliveries g WHERE g.cart_id=p_cart_id FOR UPDATE;
  -- Never automatically resend a sent/uncertain or abandoned leased attempt.
  IF d.state<>'pending' THEN RETURN; END IF;
  IF d.window_start<=clock_timestamp()-interval '1 hour' THEN d.send_count:=0; d.window_start:=clock_timestamp(); END IF;
  IF d.send_count>=5 THEN RETURN; END IF;
  UPDATE public.guest_purchase_deliveries g SET state='sending',lease_id=p_lease_id,
    lease_expires_at=clock_timestamp()+interval '1 minute',proof_digest=p_proof_digest,
    proof_expires_at=clock_timestamp()+interval '15 minutes',consumed_at=NULL,
    send_count=d.send_count+1,window_start=d.window_start WHERE g.cart_id=p_cart_id;
  RETURN QUERY SELECT c.id,c.owner_user_id,c.buyer_email;
END; $$;

CREATE FUNCTION public.finish_guest_purchase_delivery(p_cart_id uuid,p_lease_id uuid,p_delivered boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_delivered IS NULL THEN RETURN false; END IF;
  UPDATE public.guest_purchase_deliveries g SET state=CASE WHEN p_delivered THEN 'sent' ELSE 'uncertain' END,
    delivered_at=CASE WHEN p_delivered THEN clock_timestamp() ELSE NULL END,
    lease_expires_at=NULL
    WHERE g.cart_id=p_cart_id AND g.lease_id=p_lease_id AND g.state='sending';
  RETURN FOUND;
END; $$;

-- Generic HTTP acknowledgment must never expose these service-only matches.
-- Bounded latest-five purchases; each cart has a 60-second cooldown and 5/hour cap.
CREATE FUNCTION public.request_guest_purchase_recovery(p_email text,p_cart_id uuid DEFAULT NULL)
RETURNS TABLE(cart_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c record;
BEGIN
  IF p_email IS NULL OR length(p_email)>254 OR p_email<>btrim(p_email)
    OR p_email ~ '[[:cntrl:][:space:]]' OR p_email !~ '^[^@]+@example[.]test$' THEN RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guest-mail:'||p_email,0));
  FOR c IN SELECT g.id FROM public.guest_checkout_carts g
    WHERE lower(g.buyer_email)=p_email AND (p_cart_id IS NULL OR g.id=p_cart_id) AND EXISTS(
      SELECT 1 FROM public.checkout_attempts a JOIN public.orders o ON o.checkout_attempt_id=a.id
      WHERE a.reservation_id=g.reservation_id AND a.user_id=g.owner_user_id
        AND a.status='completed' AND a.provider='stripe_test' AND a.provider_request_version=2
        AND o.user_id=g.owner_user_id AND o.status IN ('paid','refunded'))
    ORDER BY g.created_at DESC,g.id DESC LIMIT 5
  LOOP
    INSERT INTO public.guest_purchase_deliveries(cart_id) VALUES(c.id) ON CONFLICT DO NOTHING;
    UPDATE public.guest_purchase_deliveries d SET state='pending',requested_at=clock_timestamp()
      WHERE d.cart_id=c.id AND d.requested_at<=clock_timestamp()-interval '60 seconds'
      AND (d.lease_expires_at IS NULL OR d.lease_expires_at<=clock_timestamp())
      AND (d.send_count<5 OR d.window_start<=clock_timestamp()-interval '1 hour');
    IF FOUND THEN RETURN QUERY SELECT c.id; END IF;
  END LOOP;
END; $$;

CREATE FUNCTION public.redeem_guest_purchase_proof(p_proof_digest text,p_session_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_cart uuid;
BEGIN
  IF p_proof_digest IS NULL OR p_proof_digest !~ '^[0-9a-f]{64}$'
    OR p_session_digest IS NULL OR p_session_digest !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  UPDATE public.guest_purchase_deliveries d SET consumed_at=clock_timestamp()
    WHERE d.proof_digest=p_proof_digest AND d.proof_expires_at>clock_timestamp() AND d.consumed_at IS NULL
    RETURNING d.cart_id INTO v_cart;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.guest_purchase_sessions(session_digest,cart_id) VALUES(p_session_digest,v_cart);
  RETURN true;
END; $$;
CREATE FUNCTION public.resolve_guest_purchase_session(p_session_digest text)
RETURNS TABLE(cart_id uuid,owner_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT c.id,c.owner_user_id FROM public.guest_purchase_sessions s
    JOIN public.guest_checkout_carts c ON c.id=s.cart_id
    WHERE s.session_digest=p_session_digest AND s.expires_at>clock_timestamp() AND s.revoked_at IS NULL;
$$;
CREATE FUNCTION public.revoke_guest_purchase_session(p_session_digest text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE public.guest_purchase_sessions SET revoked_at=clock_timestamp() WHERE session_digest=p_session_digest;
$$;
REVOKE ALL ON FUNCTION public.queue_guest_purchase_receipt(),public.claim_guest_purchase_delivery(uuid,uuid,text),
 public.finish_guest_purchase_delivery(uuid,uuid,boolean),public.request_guest_purchase_recovery(text,uuid),
 public.redeem_guest_purchase_proof(text,text),public.resolve_guest_purchase_session(text),public.revoke_guest_purchase_session(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_guest_purchase_receipt(),public.claim_guest_purchase_delivery(uuid,uuid,text),
 public.finish_guest_purchase_delivery(uuid,uuid,boolean),public.request_guest_purchase_recovery(text,uuid),
 public.redeem_guest_purchase_proof(text,text),public.resolve_guest_purchase_session(text),public.revoke_guest_purchase_session(text)
 TO service_role;
COMMIT;
