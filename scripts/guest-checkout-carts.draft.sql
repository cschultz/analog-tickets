-- REVIEW/LOCAL TEST ONLY. Not an installer step or migration; never apply hosted without approval.
-- Requires the current portable candidate, including prepare_owned_ticket_reservation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.guest_checkout_carts (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  buyer_name text NOT NULL CHECK (length(buyer_name) BETWEEN 1 AND 120 AND buyer_name = btrim(buyer_name)),
  buyer_email text NOT NULL CHECK (length(buyer_email) BETWEEN 3 AND 254 AND buyer_email = btrim(buyer_email)),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.inventory_reservations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (buyer_name !~ '[[:cntrl:]]' AND buyer_email !~ '[[:cntrl:]]')
);
CREATE INDEX guest_checkout_carts_owner_idx ON public.guest_checkout_carts(owner_user_id);
CREATE INDEX guest_checkout_carts_tier_idx ON public.guest_checkout_carts(ticket_type_id);
ALTER TABLE public.guest_checkout_carts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guest_checkout_carts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.guest_checkout_carts TO service_role;

CREATE FUNCTION public.prepare_guest_checkout_cart(
  p_owner_user_id uuid, p_cart_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_buyer_name text, p_buyer_email text
) RETURNS TABLE(outcome text, cart_id uuid, reservation_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $cart$
DECLARE
  v_cart public.guest_checkout_carts%ROWTYPE;
  v_hold record;
BEGIN
  IF p_owner_user_id IS NULL OR p_cart_id IS NULL OR p_ticket_type_id IS NULL
     OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 10
     OR p_buyer_name IS NULL OR length(p_buyer_name) NOT BETWEEN 1 AND 120
     OR p_buyer_name <> btrim(p_buyer_name) OR p_buyer_name ~ '[[:cntrl:]]'
     OR p_buyer_email IS NULL OR length(p_buyer_email) NOT BETWEEN 3 AND 254
     OR p_buyer_email <> btrim(p_buyer_email) OR p_buyer_email ~ '[[:cntrl:]]'
     OR p_buyer_email !~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$'
     OR lower(p_buyer_email) NOT LIKE '%@example.test' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;

  -- One cart is one immutable purchase intent; no provider I/O under this lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'analog-guest-cart:' || p_cart_id::text, 0));
  -- Cart rows are immutable; the advisory key serializes creation/replay.
  -- No UPDATE privilege is needed merely to lock a read-only cart row.
  SELECT c.* INTO v_cart FROM public.guest_checkout_carts c WHERE c.id=p_cart_id;
  IF FOUND AND (
    v_cart.owner_user_id <> p_owner_user_id OR v_cart.ticket_type_id <> p_ticket_type_id
    OR v_cart.quantity <> p_quantity OR v_cart.buyer_name <> p_buyer_name
    OR v_cart.buyer_email <> p_buyer_email
  ) THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;

  -- Existing atomic allocator derives event/availability and owns the deadline.
  -- The cart UUID is also the stable reservation idempotency key.
  SELECT * INTO v_hold FROM public.prepare_owned_ticket_reservation(
    p_owner_user_id,p_ticket_type_id,p_quantity,p_cart_id);
  IF v_hold.outcome IS DISTINCT FROM 'ready' THEN
    RETURN QUERY SELECT v_hold.outcome,NULL::uuid,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  IF v_cart.id IS NULL THEN
    INSERT INTO public.guest_checkout_carts(
      id,owner_user_id,ticket_type_id,quantity,buyer_name,buyer_email,reservation_id)
    VALUES(p_cart_id,p_owner_user_id,p_ticket_type_id,p_quantity,p_buyer_name,p_buyer_email,v_hold.reservation_id);
  ELSIF v_cart.reservation_id IS DISTINCT FROM v_hold.reservation_id THEN
    RAISE EXCEPTION 'guest_cart_reservation_invariant' USING ERRCODE='23514';
  END IF;
  RETURN QUERY SELECT 'ready'::text,p_cart_id,v_hold.reservation_id,v_hold.expires_at;
END;
$cart$;
REVOKE ALL ON FUNCTION public.prepare_guest_checkout_cart(uuid,uuid,uuid,integer,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_guest_checkout_cart(uuid,uuid,uuid,integer,text,text)
  TO service_role;
COMMIT;
