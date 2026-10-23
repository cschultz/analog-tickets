-- REVIEW / LOCAL ONLY. Not a migration or installer step. Requires guest carts.
-- No existing checkout, issuance or refund routine is changed by this draft.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE public.ticket_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  enabled boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > starts_at),
  kind text NOT NULL CHECK (kind IN ('fixed','percentage')),
  value integer NOT NULL CHECK (value > 0 AND
    ((kind='fixed' AND value<=99999999) OR (kind='percentage' AND value<=10000))),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency='usd'),
  max_redemptions integer CHECK (max_redemptions>0),
  UNIQUE(event_id,code)
);
CREATE TABLE public.ticket_price_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL UNIQUE REFERENCES public.guest_checkout_carts(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents BETWEEN 0 AND 99999999),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents BETWEEN 0 AND 99999999),
  discount_cents integer NOT NULL CHECK (discount_cents BETWEEN 0 AND subtotal_cents),
  total_cents integer NOT NULL CHECK (total_cents BETWEEN 50 AND 99999999),
  currency text NOT NULL CHECK (currency='usd'),
  fee_cents integer NOT NULL DEFAULT 0 CHECK (fee_cents=0),
  tax_mode text NOT NULL DEFAULT 'not_calculated' CHECK (tax_mode='not_calculated'),
  promotion_id uuid REFERENCES public.ticket_promotions(id) ON DELETE RESTRICT,
  promotion_version integer,
  promotion_code text,
  promotion_kind text,
  promotion_value integer,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at>created_at),
  CHECK (subtotal_cents::bigint=unit_price_cents::bigint*quantity),
  CHECK (total_cents=subtotal_cents-discount_cents),
  CHECK ((promotion_id IS NULL AND promotion_version IS NULL AND promotion_code IS NULL
    AND promotion_kind IS NULL AND promotion_value IS NULL AND discount_cents=0)
    OR (promotion_id IS NOT NULL AND promotion_version IS NOT NULL AND promotion_version>0
      AND promotion_code IS NOT NULL AND promotion_kind IS NOT NULL
      AND promotion_kind IN ('fixed','percentage') AND promotion_value IS NOT NULL AND promotion_value>0))
);
CREATE TABLE public.ticket_quote_allocations (
  quote_id uuid NOT NULL REFERENCES public.ticket_price_quotes(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 9),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents>=0),
  discount_cents integer NOT NULL CHECK (discount_cents BETWEEN 0 AND subtotal_cents),
  paid_cents integer NOT NULL CHECK (paid_cents=subtotal_cents-discount_cents),
  PRIMARY KEY(quote_id,ordinal)
);
CREATE TABLE public.promotion_redemptions (
  quote_id uuid PRIMARY KEY REFERENCES public.ticket_price_quotes(id) ON DELETE RESTRICT,
  promotion_id uuid NOT NULL REFERENCES public.ticket_promotions(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('reserved','consumed','released')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX promotion_redemptions_limit_idx ON public.promotion_redemptions(promotion_id,state);
CREATE INDEX ticket_price_quotes_owner_idx ON public.ticket_price_quotes(owner_user_id);
ALTER TABLE public.ticket_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_price_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_quote_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_promotions,public.ticket_price_quotes,
  public.ticket_quote_allocations,public.promotion_redemptions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ticket_promotions,public.promotion_redemptions TO service_role;
GRANT SELECT,INSERT ON public.ticket_price_quotes,public.ticket_quote_allocations TO service_role;

CREATE FUNCTION public.guard_immutable_ticket_quote() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'immutable_ticket_quote' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER ticket_quote_immutable BEFORE UPDATE OR DELETE ON public.ticket_price_quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_immutable_ticket_quote();
CREATE TRIGGER ticket_allocation_immutable BEFORE UPDATE OR DELETE ON public.ticket_quote_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_immutable_ticket_quote();

CREATE FUNCTION public.guard_ticket_quote_allocation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE; d integer;
BEGIN
  SELECT * INTO q FROM public.ticket_price_quotes WHERE id=NEW.quote_id;
  IF NOT FOUND OR NEW.ordinal<0 OR NEW.ordinal>=q.quantity THEN
    RAISE EXCEPTION 'invalid_ticket_quote_allocation' USING ERRCODE='23514';
  END IF;
  d:=q.discount_cents/q.quantity+CASE WHEN NEW.ordinal<q.discount_cents%q.quantity THEN 1 ELSE 0 END;
  IF NEW.subtotal_cents IS DISTINCT FROM q.unit_price_cents OR NEW.discount_cents IS DISTINCT FROM d
    OR NEW.paid_cents IS DISTINCT FROM q.unit_price_cents-d THEN
    RAISE EXCEPTION 'invalid_ticket_quote_allocation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ticket_allocation_value BEFORE INSERT ON public.ticket_quote_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_quote_allocation();

CREATE FUNCTION public.guard_ticket_promotion_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.event_id<>OLD.event_id OR NEW.code<>OLD.code
    OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id OR NEW.version<>OLD.version+1
    OR (NEW.max_redemptions IS NOT NULL AND NEW.max_redemptions < (
      SELECT count(*) FROM public.promotion_redemptions r
      WHERE r.promotion_id=OLD.id AND r.state IN ('reserved','consumed'))) THEN
    RAISE EXCEPTION 'promotion_version_conflict' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ticket_promotion_version BEFORE UPDATE ON public.ticket_promotions
FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_promotion_version();

CREATE FUNCTION public.guard_promotion_redemption() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.quote_id<>OLD.quote_id OR NEW.promotion_id<>OLD.promotion_id
    OR OLD.state<>'reserved' OR NEW.state NOT IN ('consumed','released') THEN
    RAISE EXCEPTION 'promotion_redemption_terminal' USING ERRCODE='23514';
  END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END; $$;
CREATE TRIGGER promotion_redemption_terminal BEFORE UPDATE ON public.promotion_redemptions
FOR EACH ROW EXECUTE FUNCTION public.guard_promotion_redemption();

CREATE FUNCTION public.reserve_ticket_price_quote(p_owner uuid,p_cart uuid,p_code text)
RETURNS TABLE(outcome text,quote_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $reserve$
DECLARE
  c public.guest_checkout_carts%ROWTYPE;
  h public.inventory_reservations%ROWTYPE;
  t public.ticket_types%ROWTYPE;
  p public.ticket_promotions%ROWTYPE;
  q public.ticket_price_quotes%ROWTYPE;
  v_code text; v_now timestamptz; v_expiry timestamptz;
  v_subtotal bigint; v_discount integer:=0; v_used bigint;
BEGIN
  IF p_owner IS NULL OR p_cart IS NULL OR (p_code IS NOT NULL AND
    btrim(p_code) !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid; RETURN;
  END IF;
  v_code:=upper(btrim(p_code));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analog-promo-cart:'||p_cart::text,0));
  SELECT * INTO c FROM public.guest_checkout_carts WHERE id=p_cart;
  IF c.id IS NULL OR c.owner_user_id<>p_owner THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE cart_id=p_cart;
  IF FOUND THEN
    IF q.owner_user_id<>p_owner OR q.promotion_code IS DISTINCT FROM v_code OR EXISTS(
      SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='released') THEN
      RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN;
    END IF;
    -- Resume reads the saved snapshot, even after a promotion edit or deadline.
    -- It does NOT authorize a new provider request or late payment by itself.
    RETURN QUERY SELECT 'existing'::text,q.id; RETURN;
  END IF;
  SELECT * INTO h FROM public.inventory_reservations WHERE id=c.reservation_id FOR UPDATE;
  SELECT * INTO t FROM public.ticket_types WHERE id=c.ticket_type_id FOR SHARE;
  v_now:=clock_timestamp();
  IF h.id IS NULL OR t.id IS NULL OR NOT isfinite(h.expires_at)
    OR h.owner_user_id IS DISTINCT FROM p_owner OR h.status<>'confirmed'
    OR h.expires_at<=v_now OR h.ticket_type_id<>t.id OR h.event_id<>t.event_id
    OR h.quantity<>c.quantity OR NOT t.is_active OR t.currency<>'usd'
    OR NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=t.event_id AND e.is_published)
    OR EXISTS(SELECT 1 FROM public.checkout_attempts a WHERE a.reservation_id=h.id) THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN;
  END IF;
  v_subtotal:=t.price_cents::bigint*c.quantity;
  v_expiry:=h.expires_at;
  IF v_subtotal>99999999 THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid; RETURN;
  END IF;
  IF v_code IS NOT NULL THEN
    SELECT * INTO p FROM public.ticket_promotions
      WHERE event_id=t.event_id AND code=v_code FOR UPDATE;
    -- Evaluate time after any promotion-row lock wait.
    v_now:=clock_timestamp();
    IF p.id IS NULL OR NOT p.enabled OR p.starts_at>v_now OR p.expires_at<=v_now
      OR h.expires_at<=v_now OR (p.ticket_type_id IS NOT NULL AND p.ticket_type_id<>t.id) THEN
      RETURN QUERY SELECT 'promotion_unavailable'::text,NULL::uuid; RETURN;
    END IF;
    SELECT count(*) INTO v_used FROM public.promotion_redemptions r
      WHERE r.promotion_id=p.id AND r.state IN ('reserved','consumed');
    IF p.max_redemptions IS NOT NULL AND v_used>=p.max_redemptions THEN
      RETURN QUERY SELECT 'promotion_unavailable'::text,NULL::uuid; RETURN;
    END IF;
    v_discount:=CASE WHEN p.kind='fixed' THEN least(p.value,v_subtotal)::integer
      ELSE (v_subtotal*p.value/10000)::integer END;
    -- Offer expiry stops NEW quotes; accepted terms use the original stock
    -- hold deadline, not a too-short provider session tied to the offer date.
  END IF;
  IF v_subtotal-v_discount<50 THEN
    RETURN QUERY SELECT 'unsupported_paid_total'::text,NULL::uuid; RETURN;
  END IF;
  INSERT INTO public.ticket_price_quotes(cart_id,owner_user_id,event_id,ticket_type_id,quantity,
    unit_price_cents,subtotal_cents,discount_cents,total_cents,currency,promotion_id,
    promotion_version,promotion_code,promotion_kind,promotion_value,created_at,expires_at)
  VALUES(c.id,p_owner,t.event_id,t.id,c.quantity,t.price_cents,v_subtotal,v_discount,
    v_subtotal-v_discount,'usd',p.id,p.version,v_code,p.kind,p.value,v_now,v_expiry) RETURNING * INTO q;
  INSERT INTO public.ticket_quote_allocations(quote_id,ordinal,subtotal_cents,discount_cents,paid_cents)
    SELECT q.id,i,t.price_cents,v_discount/c.quantity+CASE WHEN i<v_discount%c.quantity THEN 1 ELSE 0 END,
      t.price_cents-(v_discount/c.quantity+CASE WHEN i<v_discount%c.quantity THEN 1 ELSE 0 END)
    FROM generate_series(0,c.quantity-1) AS i;
  IF p.id IS NOT NULL THEN
    INSERT INTO public.promotion_redemptions(quote_id,promotion_id,state) VALUES(q.id,p.id,'reserved');
  END IF;
  RETURN QUERY SELECT 'ready'::text,q.id;
END;
$reserve$;

-- INTERNAL trusted lifecycle primitive. Integration must call only after exact
-- paid correlation or verified terminal/no-provider outcome, NEVER wall-clock expiry.
CREATE FUNCTION public.settle_ticket_promotion(p_owner uuid,p_quote uuid,p_state text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE; r public.promotion_redemptions%ROWTYPE;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('consumed','released') THEN RETURN 'invalid_request'; END IF;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE id=p_quote AND owner_user_id=p_owner;
  IF q.id IS NULL OR q.promotion_id IS NULL THEN RETURN 'not_available'; END IF;
  -- All redemption transitions share the reserve path's promotion lock.
  PERFORM 1 FROM public.ticket_promotions WHERE id=q.promotion_id FOR UPDATE;
  SELECT * INTO r FROM public.promotion_redemptions WHERE quote_id=q.id FOR UPDATE;
  IF r.quote_id IS NULL THEN RETURN 'not_available'; END IF;
  IF r.state=p_state THEN RETURN 'existing'; END IF;
  IF r.state<>'reserved' THEN RETURN 'not_available'; END IF;
  UPDATE public.promotion_redemptions SET state=p_state,updated_at=clock_timestamp() WHERE quote_id=q.id;
  RETURN 'settled';
END; $$;
REVOKE ALL ON FUNCTION public.guard_immutable_ticket_quote(),public.guard_ticket_promotion_version(),
  public.guard_promotion_redemption(),public.guard_ticket_quote_allocation(),
  public.reserve_ticket_price_quote(uuid,uuid,text),public.settle_ticket_promotion(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ticket_price_quote(uuid,uuid,text),
  public.settle_ticket_promotion(uuid,uuid,text) TO service_role;
-- Some hosted copies inherit direct sandbox_exec default ACLs. Revoke only on
-- these new objects; never alter an external role or its global defaults.
DO $sandbox_acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON public.ticket_promotions,public.ticket_price_quotes,
      public.ticket_quote_allocations,public.promotion_redemptions FROM sandbox_exec;
    REVOKE ALL ON FUNCTION public.guard_immutable_ticket_quote(),public.guard_ticket_promotion_version(),
      public.guard_promotion_redemption(),public.guard_ticket_quote_allocation(),public.reserve_ticket_price_quote(uuid,uuid,text),
      public.settle_ticket_promotion(uuid,uuid,text) FROM sandbox_exec;
  END IF;
END; $sandbox_acl$;
COMMIT;
