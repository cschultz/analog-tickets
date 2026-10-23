-- LOCAL/REVIEW ONLY. Requires guest cart/recovery drafts; not an applied migration.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
CREATE TABLE public.guest_purchase_account_links (
 cart_id uuid PRIMARY KEY REFERENCES public.guest_checkout_carts(id) ON DELETE RESTRICT,
 account_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 recovery_session_digest text NOT NULL REFERENCES public.guest_purchase_sessions(session_digest) ON DELETE RESTRICT,
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX guest_account_library_idx ON public.guest_purchase_account_links(account_user_id,linked_at DESC,cart_id DESC);
CREATE INDEX guest_account_proof_audit_idx ON public.guest_purchase_account_links(recovery_session_digest);
ALTER TABLE public.guest_purchase_account_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_purchase_account_links FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.guest_purchase_account_links TO service_role;

-- p_account_id MUST be a server-verified nonanonymous, confirmed Auth user.
-- The expiring mailbox-proof session and permanent destination are independent.
CREATE FUNCTION public.attach_guest_purchase_account(p_session_digest text,p_account_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_cart uuid; v_existing uuid;
BEGIN
 IF p_session_digest IS NULL OR p_session_digest !~ '^[0-9a-f]{64}$' OR p_account_id IS NULL THEN RETURN 'unavailable'; END IF;
 SELECT s.cart_id INTO v_cart FROM public.guest_purchase_sessions s
  WHERE s.session_digest=p_session_digest AND s.expires_at>clock_timestamp() AND s.revoked_at IS NULL
  FOR UPDATE;
 IF NOT FOUND THEN RETURN 'unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guest-account:'||v_cart::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.guest_checkout_carts c JOIN public.checkout_attempts a ON a.reservation_id=c.reservation_id
  JOIN public.orders o ON o.checkout_attempt_id=a.id
  WHERE c.id=v_cart AND a.user_id=c.owner_user_id AND a.status='completed' AND a.provider='stripe_test'
   AND a.provider_request_version=2 AND a.ticket_type_id=c.ticket_type_id AND a.quantity=c.quantity
   AND o.user_id=c.owner_user_id AND o.event_id=a.event_id AND o.status IN ('paid','refunded')) THEN RETURN 'unavailable'; END IF;
 SELECT l.account_user_id INTO v_existing FROM public.guest_purchase_account_links l WHERE l.cart_id=v_cart;
 IF FOUND THEN RETURN CASE WHEN v_existing=p_account_id THEN 'saved' ELSE 'conflict' END; END IF;
 INSERT INTO public.guest_purchase_account_links(cart_id,account_user_id,recovery_session_digest)
 VALUES(v_cart,p_account_id,p_session_digest);
 -- No buyer, owner, order, ticket, pass, transfer, refund or audit row is rewritten.
 RETURN 'saved';
END; $$;
CREATE FUNCTION public.resolve_guest_account_purchase(p_account_id uuid,p_cart_id uuid)
RETURNS TABLE(cart_id uuid,owner_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.id,c.owner_user_id FROM public.guest_purchase_account_links l JOIN public.guest_checkout_carts c ON c.id=l.cart_id
 WHERE l.account_user_id=p_account_id AND l.cart_id=p_cart_id;
$$;
CREATE FUNCTION public.list_guest_account_purchases(p_account_id uuid,p_offset integer)
RETURNS TABLE(cart_id uuid,quantity integer,event_name text,ticket_type_name text,linked_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.id,c.quantity,e.name,t.name,l.linked_at FROM public.guest_purchase_account_links l
 JOIN public.guest_checkout_carts c ON c.id=l.cart_id JOIN public.ticket_types t ON t.id=c.ticket_type_id
 JOIN public.events e ON e.id=t.event_id
 WHERE l.account_user_id=p_account_id AND p_offset BETWEEN 0 AND 10000
 ORDER BY l.linked_at DESC,l.cart_id DESC LIMIT 21 OFFSET greatest(0,p_offset);
$$;
REVOKE ALL ON FUNCTION public.attach_guest_purchase_account(text,uuid),public.resolve_guest_account_purchase(uuid,uuid),public.list_guest_account_purchases(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_guest_purchase_account(text,uuid),public.resolve_guest_account_purchase(uuid,uuid),public.list_guest_account_purchases(uuid,integer) TO service_role;
COMMIT;
