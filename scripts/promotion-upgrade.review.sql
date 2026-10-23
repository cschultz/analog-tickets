-- Current app TEST upgrade from the exact 45-step guest baseline. Not approval to apply.
-- Quiesce writers; preserve rows, role identities, existing grants and defaults.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_advisory_xact_lock(hashtextextended('analog-promotion-release-install',0));
DO $promotion_upgrade_preflight$ DECLARE actual jsonb; tables text; BEGIN
  IF to_regclass('public.events') IS NULL OR (SELECT relowner FROM pg_class WHERE oid=to_regclass('public.events'))<>current_user::regrole::oid
  THEN RAISE EXCEPTION 'upgrade requires the original guest installer role'; END IF;
  SELECT string_agg(format('public.%I',c.relname),',' ORDER BY c.relname) INTO tables FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');
  EXECUTE 'LOCK TABLE '||tables||' IN SHARE ROW EXCLUSIVE MODE';
  SELECT jsonb_build_object('roles',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) row),
'relations',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
    c.relreplident,c.reloptions,c.relowner=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass) AS same_owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') row),
'columns',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
    a.attcollation::regcollation::text AS collation,
    a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped) row),
'constraints',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,con.conname,con.convalidated,pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND con.contype <> 'n') row),
'indexes',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname AS table_name,idx.relname AS index_name,pg_get_indexdef(i.indexrelid) AS definition,
    i.indisvalid,i.indisready,i.indislive
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class idx ON idx.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') row),
'triggers',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal) row),
'policies',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') row),
'routines',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT p.proname,oidvectortypes(p.proargtypes) AS arguments,md5(pg_get_functiondef(p.oid)) AS definition,
    p.prosecdef,p.proconfig,p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass) AS same_owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') row),
'types',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT t.typname,t.typtype,t.typcategory,format_type(t.typbasetype,t.typtypmod) AS base_type,
    (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') row),
'tablePrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,role_name,privilege_name,has_table_privilege(role_name,c.oid,privilege_name) AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege_name
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) row),
'columnPrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,a.attname,role_name,privilege_name,
    has_column_privilege(role_name,c.oid,a.attname,privilege_name) AS allowed
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege_name
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped) row),
'routinePrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT p.proname,oidvectortypes(p.proargtypes) AS arguments,role_name,
    has_function_privilege(role_name,p.oid,'EXECUTE') AS allowed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name WHERE n.nspname='public') row),
'defaultPrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT coalesce(n.nspname,'<global>') AS scope,d.defaclobjtype,x.privilege_type,x.is_grantable,
    CASE WHEN x.grantee=d.defaclrole THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
    CASE WHEN x.grantor=d.defaclrole THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END AS grantor
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    WHERE d.defaclrole=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass)
      AND (d.defaclnamespace=0 OR n.nspname='public')) row),
'directPrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT object_name,grantee,grantor,privilege_type,is_grantable FROM (
    SELECT 'relation:'||c.relname AS object_name,
      CASE WHEN x.grantee=c.relowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
      CASE WHEN x.grantor=c.relowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END AS grantor,x.privilege_type,x.is_grantable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE n.nspname='public'
    UNION ALL
    SELECT 'column:'||c.relname||'.'||a.attname,
      CASE WHEN x.grantee=c.relowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      CASE WHEN x.grantor=c.relowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END,x.privilege_type,x.is_grantable
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'routine:'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
      CASE WHEN x.grantee=p.proowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      CASE WHEN x.grantor=p.proowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END,x.privilege_type,x.is_grantable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE n.nspname='public'
    ) acl) row)) INTO actual;
  IF NOT (actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"e502788b6855042f831e6fc5cce43ba3","columns":"ee7fef083e2ae24d354fc3c5ab7c998d","indexes":"82161b0a65c86aea8ced23b4fd70b8ed","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"a0e0c4e4d0fda7a7d426bb46029e0a1e","triggers":"9cb80bac9a34c1993df37d179478737d","relations":"af1601b7eb0146d7b9a33e8621696fa2","constraints":"14dc86a36eed9bc6079f5e95c3cc076c","tablePrivileges":"a67cf766dc0ee3ee6887f6bd85c8ecf8","columnPrivileges":"2a4b2adca5423594e33f1f5a99dd5a34","directPrivileges":"7d5018809e2ba0af78db019a598877d2","defaultPrivileges":"24997da7a62a87df38a61fe29cfa2f8d","routinePrivileges":"e5430c773bae2ab6dacf36c348eb9a24"}'::jsonb OR actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"e502788b6855042f831e6fc5cce43ba3","columns":"ee7fef083e2ae24d354fc3c5ab7c998d","indexes":"82161b0a65c86aea8ced23b4fd70b8ed","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"a0e0c4e4d0fda7a7d426bb46029e0a1e","triggers":"9cb80bac9a34c1993df37d179478737d","relations":"af1601b7eb0146d7b9a33e8621696fa2","constraints":"14dc86a36eed9bc6079f5e95c3cc076c","tablePrivileges":"a67cf766dc0ee3ee6887f6bd85c8ecf8","columnPrivileges":"2a4b2adca5423594e33f1f5a99dd5a34","directPrivileges":"20c18880f025d4173a184d4cdddae8ab","defaultPrivileges":"465ff8a86dbfe51e0281f3c45a45bfae","routinePrivileges":"2400bffc47dbe48450adee6bfa5f8cc5"}'::jsonb OR actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"e502788b6855042f831e6fc5cce43ba3","columns":"ee7fef083e2ae24d354fc3c5ab7c998d","indexes":"82161b0a65c86aea8ced23b4fd70b8ed","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"a0e0c4e4d0fda7a7d426bb46029e0a1e","triggers":"9cb80bac9a34c1993df37d179478737d","relations":"af1601b7eb0146d7b9a33e8621696fa2","constraints":"14dc86a36eed9bc6079f5e95c3cc076c","tablePrivileges":"a67cf766dc0ee3ee6887f6bd85c8ecf8","columnPrivileges":"2a4b2adca5423594e33f1f5a99dd5a34","directPrivileges":"821b218caa0ed484b7dd1c5f320ceb91","defaultPrivileges":"04b3b4f857ba9ac3c67c63ed2948bffb","routinePrivileges":"2400bffc47dbe48450adee6bfa5f8cc5"}'::jsonb) THEN
    RAISE EXCEPTION '45-step guest catalog/permissions differ; upgrade refused'; END IF;
  
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles
    WHERE rolname IN ('anon','authenticated','service_role','sandbox_exec'))) THEN
    RAISE EXCEPTION 'application role inheritance differs'; END IF;
  IF actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"e502788b6855042f831e6fc5cce43ba3","columns":"ee7fef083e2ae24d354fc3c5ab7c998d","indexes":"82161b0a65c86aea8ced23b4fd70b8ed","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"a0e0c4e4d0fda7a7d426bb46029e0a1e","triggers":"9cb80bac9a34c1993df37d179478737d","relations":"af1601b7eb0146d7b9a33e8621696fa2","constraints":"14dc86a36eed9bc6079f5e95c3cc076c","tablePrivileges":"a67cf766dc0ee3ee6887f6bd85c8ecf8","columnPrivileges":"2a4b2adca5423594e33f1f5a99dd5a34","directPrivileges":"821b218caa0ed484b7dd1c5f320ceb91","defaultPrivileges":"04b3b4f857ba9ac3c67c63ed2948bffb","routinePrivileges":"2400bffc47dbe48450adee6bfa5f8cc5"}'::jsonb AND NOT EXISTS(SELECT 1 FROM pg_roles
    WHERE rolname='sandbox_exec' AND rolcanlogin AND rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'managed platform role differs'; END IF;
END $promotion_upgrade_preflight$;
-- Product step 46/51: scripts/promotion-quotes.draft.sql
-- REVIEW / LOCAL ONLY. Not a migration or installer step. Requires guest carts.
-- No existing checkout, issuance or refund routine is changed by this draft.

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

-- Product step 47/51: scripts/quoted-checkout.draft.sql
-- Review/local integration only. No external installation.

-- LOCAL REVIEW ONLY, after promotion-quotes.draft.sql. Not an installed migration.
-- buildQuotedCheckoutDraft appends narrowly patched baseline writer bodies.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.checkout_attempts ADD COLUMN price_quote_id uuid UNIQUE
  REFERENCES public.ticket_price_quotes(id) ON DELETE RESTRICT;
ALTER TABLE public.tickets
  ADD COLUMN price_quote_id uuid,
  ADD COLUMN price_quote_ordinal integer,
  ADD CONSTRAINT ticket_quote_pair CHECK ((price_quote_id IS NULL)=(price_quote_ordinal IS NULL)),
  ADD CONSTRAINT ticket_quote_allocation_fkey FOREIGN KEY(price_quote_id,price_quote_ordinal)
    REFERENCES public.ticket_quote_allocations(quote_id,ordinal) ON DELETE RESTRICT,
  ADD CONSTRAINT ticket_quote_one_issuance UNIQUE(price_quote_id,price_quote_ordinal);

CREATE FUNCTION public.guard_checkout_price_quote() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE; c public.guest_checkout_carts%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.price_quote_id IS DISTINCT FROM OLD.price_quote_id THEN
      RAISE EXCEPTION 'immutable_checkout_quote' USING ERRCODE='23514';
    END IF;
    RETURN NEW; -- Existing v2 guard freezes the remaining request facts.
  END IF;
  -- Serialize both quoted and legacy insertion with quote creation on this hold.
  IF NEW.reservation_id IS NOT NULL THEN
    PERFORM 1 FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  END IF;
  IF NEW.price_quote_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.ticket_price_quotes x JOIN public.guest_checkout_carts g ON g.id=x.cart_id
      WHERE g.reservation_id=NEW.reservation_id) THEN
      RAISE EXCEPTION 'quoted_checkout_required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE id=NEW.price_quote_id;
  SELECT * INTO c FROM public.guest_checkout_carts WHERE id=q.cart_id;
  IF q.id IS NULL OR c.id IS NULL OR q.owner_user_id IS DISTINCT FROM NEW.user_id
    OR q.event_id IS DISTINCT FROM NEW.event_id OR q.ticket_type_id IS DISTINCT FROM NEW.ticket_type_id
    OR q.quantity IS DISTINCT FROM NEW.quantity OR q.unit_price_cents IS DISTINCT FROM NEW.unit_price_cents
    OR q.total_cents IS DISTINCT FROM NEW.amount_cents OR q.currency IS DISTINCT FROM NEW.currency
    OR c.reservation_id IS DISTINCT FROM NEW.reservation_id OR NEW.provider<>'stripe_test'
    OR NEW.provider_request_version IS DISTINCT FROM 2 OR q.expires_at<=clock_timestamp()
    OR (SELECT count(*) FROM public.ticket_quote_allocations WHERE quote_id=q.id)<>q.quantity
    OR EXISTS(SELECT 1 FROM public.checkout_attempts a WHERE a.reservation_id=NEW.reservation_id) THEN
    RAISE EXCEPTION 'invalid_checkout_quote' USING ERRCODE='23514';
  END IF;
  IF q.promotion_id IS NOT NULL THEN
    PERFORM 1 FROM public.ticket_promotions WHERE id=q.promotion_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='reserved') THEN
      RAISE EXCEPTION 'promotion_not_reserved' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER checkout_price_quote_guard BEFORE INSERT OR UPDATE ON public.checkout_attempts
FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_price_quote();

CREATE FUNCTION public.guard_ticket_quote_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE expected uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.price_quote_id IS DISTINCT FROM OLD.price_quote_id
      OR NEW.price_quote_ordinal IS DISTINCT FROM OLD.price_quote_ordinal THEN
      RAISE EXCEPTION 'immutable_ticket_quote' USING ERRCODE='23514';
    END IF;
    RETURN NEW; -- Transfer/holder edits retain the original paid share.
  END IF;
  SELECT a.price_quote_id INTO expected FROM public.orders o
    JOIN public.checkout_attempts a ON a.id=o.checkout_attempt_id
    JOIN public.order_items oi ON oi.id=NEW.order_item_id AND oi.order_id=o.id
      AND oi.ticket_type_id=NEW.ticket_type_id
    WHERE o.id=NEW.order_id AND o.event_id=NEW.event_id
      AND a.ticket_type_id=NEW.ticket_type_id AND a.event_id=NEW.event_id
      AND a.user_id=NEW.owner_user_id;
  IF NEW.price_quote_id IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ticket_quote_not_correlated' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ticket_quote_identity BEFORE INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_quote_identity();

CREATE FUNCTION public.guard_linked_promotion_release() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.state='released' AND EXISTS(SELECT 1 FROM public.checkout_attempts a
    WHERE a.price_quote_id=NEW.quote_id AND a.status<>'abandoned') THEN
    RAISE EXCEPTION 'checkout_outcome_unresolved' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER promotion_linked_release BEFORE UPDATE ON public.promotion_redemptions
FOR EACH ROW EXECUTE FUNCTION public.guard_linked_promotion_release();

-- Single-snapshot exact paid-share reader for the trusted refund coordinator.
-- Eligibility and durable claims are still required before any provider call.
CREATE FUNCTION public.read_quoted_refund_amount(p_attempt uuid,p_ticket_ids uuid[])
RETURNS TABLE(amount_cents integer,currency text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT sum(x.paid_cents)::integer,q.currency
  FROM public.checkout_attempts a
  JOIN public.ticket_price_quotes q ON q.id=a.price_quote_id
  JOIN public.orders o ON o.checkout_attempt_id=a.id AND o.status='paid'
    AND o.user_id=a.user_id AND o.event_id=a.event_id
  JOIN public.tickets t ON t.order_id=o.id AND t.id=ANY(p_ticket_ids)
    AND t.price_quote_id=q.id AND t.event_id=a.event_id AND t.ticket_type_id=a.ticket_type_id
    AND t.status='issued' AND t.checked_in_at IS NULL AND t.refundable_at_issue
  JOIN public.ticket_quote_allocations x ON x.quote_id=q.id AND x.ordinal=t.price_quote_ordinal
  JOIN public.order_items oi ON oi.id=t.order_item_id AND oi.order_id=o.id
    AND oi.ticket_type_id=a.ticket_type_id AND oi.quantity=q.quantity AND oi.unit_price_cents=q.unit_price_cents
  WHERE a.id=p_attempt AND a.status='completed' AND a.provider='stripe_test'
    AND a.user_id=q.owner_user_id AND a.event_id=q.event_id AND a.ticket_type_id=q.ticket_type_id
    AND a.amount_cents=q.total_cents AND a.currency=q.currency AND a.quantity=q.quantity
    AND a.unit_price_cents=q.unit_price_cents AND o.total_cents=q.total_cents AND o.subtotal_cents=q.subtotal_cents
    AND o.currency=q.currency
    AND cardinality(p_ticket_ids) BETWEEN 1 AND 10
    AND NOT EXISTS(SELECT 1 FROM public.ticket_refund_items ri WHERE ri.ticket_id=ANY(p_ticket_ids))
  GROUP BY q.id,q.currency
  HAVING count(*)=cardinality(p_ticket_ids) AND count(DISTINCT t.id)=cardinality(p_ticket_ids)
    AND sum(x.paid_cents)>=0 AND sum(x.paid_cents)<=max(q.total_cents);
$$;

REVOKE ALL ON FUNCTION public.guard_checkout_price_quote(),public.guard_ticket_quote_identity(),
  public.guard_linked_promotion_release(),public.read_quoted_refund_amount(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_quoted_refund_amount(uuid,uuid[]) TO service_role;
DO $sandbox_acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.guard_checkout_price_quote(),public.guard_ticket_quote_identity(),
      public.guard_linked_promotion_release(),public.read_quoted_refund_amount(uuid,uuid[]) FROM sandbox_exec;
  END IF;
END; $sandbox_acl$;
CREATE OR REPLACE FUNCTION public.finalize_paid_checkout_attempt(p_attempt_id uuid)
 RETURNS TABLE(outcome text, order_id uuid, tickets_issued integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_order_id uuid;
  v_order_item_id uuid;
  v_issued integer := 0;
  v_refundable boolean := false;
  v_quote public.ticket_price_quotes%ROWTYPE;
  v_settled text;
  v_buyer_name text;
  v_buyer_email text;
BEGIN
  IF p_attempt_id IS NULL THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, NULL::uuid, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt FROM public.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.status = 'completed' THEN
    RETURN QUERY SELECT 'idempotent_replay'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.status <> 'pending' THEN
    RETURN QUERY SELECT 'not_finalizable'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.reservation_id IS NULL THEN
    RETURN QUERY SELECT 'unlinked'::text, NULL::uuid, 0; RETURN;
  END IF;

  SELECT * INTO v_reservation
    FROM public.inventory_reservations
    WHERE id = v_attempt.reservation_id
    FOR UPDATE;

  IF NOT FOUND
     OR v_reservation.status <> 'confirmed'
     OR v_reservation.ticket_type_id <> v_attempt.ticket_type_id
     OR v_reservation.event_id <> v_attempt.event_id
     OR v_reservation.quantity <> v_attempt.quantity THEN
    RETURN QUERY SELECT 'not_finalizable'::text, NULL::uuid, 0; RETURN;
  END IF;

  IF v_attempt.price_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.ticket_price_quotes WHERE id=v_attempt.price_quote_id;
    IF v_quote.id IS NULL OR ROW(v_quote.owner_user_id,v_quote.event_id,v_quote.ticket_type_id,
      v_quote.quantity,v_quote.unit_price_cents,v_quote.total_cents,v_quote.currency)
      IS DISTINCT FROM ROW(v_attempt.user_id,v_attempt.event_id,v_attempt.ticket_type_id,
        v_attempt.quantity,v_attempt.unit_price_cents,v_attempt.amount_cents,v_attempt.currency)
      OR (SELECT count(*) FROM public.ticket_quote_allocations WHERE quote_id=v_quote.id)<>v_quote.quantity THEN
      RETURN QUERY SELECT 'not_finalizable'::text,NULL::uuid,0; RETURN;
    END IF;
    IF v_quote.promotion_id IS NOT NULL THEN
      SELECT public.settle_ticket_promotion(v_attempt.user_id,v_quote.id,'consumed') INTO v_settled;
      IF v_settled<>'settled' THEN
        RAISE EXCEPTION 'promotion_not_consumable' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable
    FROM public.ticket_types t
    WHERE t.id = v_attempt.ticket_type_id;
  v_refundable := COALESCE(v_refundable, false);

  -- Gate 165: the creating attempt id is written in the same INSERT as the
  -- order itself, so an order and its canonical payment correlation are
  -- created atomically or not at all. Totals remain the immutable paid record.
  -- The guest cart is immutable and unique per reservation. Copy only the
  -- exact linked buyer contact at insertion; never backfill old orders or infer
  -- ticket-holder identities. Non-guest owned purchases keep null contact.
  SELECT c.buyer_name,c.buyer_email INTO v_buyer_name,v_buyer_email
    FROM public.guest_checkout_carts c
    WHERE c.reservation_id=v_attempt.reservation_id AND c.owner_user_id=v_attempt.user_id
      AND c.ticket_type_id=v_attempt.ticket_type_id AND c.quantity=v_attempt.quantity;
  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency,checkout_attempt_id,buyer_name,buyer_email)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', COALESCE(v_quote.subtotal_cents,v_attempt.amount_cents), v_attempt.amount_cents, v_attempt.currency,v_attempt.id,v_buyer_name,v_buyer_email)
  RETURNING id INTO v_order_id;

  -- Authoritative line identity. The Gate 149c unique
  -- (order_id, ticket_type_id) invariant makes this deterministic.
  SELECT oi.id INTO v_order_item_id
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id
      AND oi.ticket_type_id = v_attempt.ticket_type_id
    FOR UPDATE;

  IF v_order_item_id IS NULL THEN
    INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
    VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents)
    RETURNING id INTO v_order_item_id;
  ELSE
    UPDATE public.order_items oi
      SET quantity = v_attempt.quantity,
          unit_price_cents = v_attempt.unit_price_cents
      WHERE oi.id = v_order_item_id;
  END IF;

  IF v_order_item_id IS NULL THEN
    RAISE EXCEPTION 'order_line_identity_invariant_violation';
  END IF;

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id,price_quote_id,price_quote_ordinal)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id,
    v_attempt.price_quote_id,CASE WHEN v_attempt.price_quote_id IS NOT NULL THEN i-1 ELSE NULL END
  FROM generate_series(1, v_attempt.quantity) AS i;
  GET DIAGNOSTICS v_issued = ROW_COUNT;

  IF v_issued <> v_attempt.quantity THEN
    RAISE EXCEPTION 'ticket_issuance_invariant_violation';
  END IF;

  UPDATE public.checkout_attempts
    SET status = 'completed', updated_at = now()
    WHERE id = v_attempt.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_finalization_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'finalized'::text, v_order_id, v_issued;
END;
$function$;
CREATE OR REPLACE FUNCTION public.reverse_refunded_tickets(p_ticket_ids uuid[], p_payment_intent_id text, p_provider_refund_reference text)
 RETURNS TABLE(outcome text, refund_id uuid, tickets_reversed integer, restocked integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_ids uuid[];
  v_n integer;
  v_refund public.ticket_refunds%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_attempt public.checkout_attempts%ROWTYPE;
  v_order_id uuid;
  v_type_id uuid;
  v_event_id uuid;
  v_bad integer;
  v_found integer;
  v_matched integer;
  v_new_refund_id uuid;
  v_updated integer;
  v_line_id uuid;
  v_line_qty integer;
  v_unit_price integer;
  v_prior integer;
  v_amount_cents integer;
  v_currency text;
  v_quote public.ticket_price_quotes%ROWTYPE;
BEGIN
  IF p_provider_refund_reference IS NULL
     OR p_provider_refund_reference !~ '^re_[A-Za-z0-9_]{6,120}$' THEN
    RETURN QUERY SELECT 'invalid_reference'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF p_payment_intent_id IS NULL
     OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]{6,120}$' THEN
    RETURN QUERY SELECT 'invalid_payment_reference'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF p_ticket_ids IS NULL
     OR COALESCE(array_length(p_ticket_ids, 1), 0) = 0
     OR array_length(p_ticket_ids, 1) > 50
     OR array_position(p_ticket_ids, NULL) IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT array_agg(DISTINCT t) INTO v_ids FROM unnest(p_ticket_ids) AS t;
  IF cardinality(v_ids) <> array_length(p_ticket_ids, 1) THEN
    RETURN QUERY SELECT 'duplicate_ticket_ids'::text, NULL::uuid, 0, 0; RETURN;
  END IF;
  v_n := cardinality(v_ids);

  SELECT * INTO v_refund
    FROM public.ticket_refunds
    WHERE provider_refund_reference = p_provider_refund_reference
    FOR UPDATE;
  IF FOUND THEN
    SELECT count(*) INTO v_matched
      FROM public.ticket_refund_items i
      WHERE i.refund_id = v_refund.id AND i.ticket_id = ANY(v_ids);
    IF v_refund.ticket_count = v_n
       AND v_matched = v_n
       AND v_refund.payment_intent_id = p_payment_intent_id THEN
      RETURN QUERY SELECT 'idempotent_replay'::text, v_refund.id, 0, 0; RETURN;
    END IF;
    RETURN QUERY SELECT 'reference_conflict'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  PERFORM 1 FROM public.tickets WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_found FROM public.tickets WHERE id = ANY(v_ids);
  IF v_found <> v_n THEN
    RETURN QUERY SELECT 'unknown_ticket'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.tickets WHERE id = ANY(v_ids) AND checked_in_at IS NOT NULL;
  IF v_bad > 0 THEN
    RETURN QUERY SELECT 'checked_in_ticket'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.tickets WHERE id = ANY(v_ids) AND status <> 'issued';
  IF v_bad > 0 THEN
    RETURN QUERY SELECT 'ticket_not_issued'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.tickets WHERE id = ANY(v_ids) AND refundable_at_issue IS DISTINCT FROM true;
  IF v_bad > 0 THEN
    RETURN QUERY SELECT 'ticket_not_refundable'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticket_refund_items WHERE ticket_id = ANY(v_ids)) THEN
    RETURN QUERY SELECT 'ticket_already_reversed'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT count(DISTINCT t.order_id), count(DISTINCT t.ticket_type_id), count(DISTINCT t.event_id)
    INTO v_bad, v_found, v_matched
    FROM public.tickets t WHERE t.id = ANY(v_ids);
  IF v_bad <> 1 OR v_found <> 1 OR v_matched <> 1 THEN
    RETURN QUERY SELECT 'mixed_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT t.order_id, t.ticket_type_id, t.event_id
    INTO v_order_id, v_type_id, v_event_id
    FROM public.tickets t WHERE t.id = v_ids[1];

  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN QUERY SELECT 'order_not_paid'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt
    FROM public.checkout_attempts
    WHERE id = v_order.checkout_attempt_id
      AND payment_intent_id = p_payment_intent_id
      AND status = 'completed'
      AND provider = 'stripe_test'
      AND user_id = v_order.user_id
      AND event_id = v_order.event_id
      AND ticket_type_id = v_type_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'payment_not_correlated'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  IF v_n > v_attempt.quantity THEN
    RETURN QUERY SELECT 'selection_exceeds_payment'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  -- Authoritative immutable order line for this selection.
  SELECT oi.id, oi.quantity, oi.unit_price_cents
    INTO v_line_id, v_line_qty, v_unit_price
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id AND oi.ticket_type_id = v_type_id
    FOR UPDATE;

  -- A selected ticket already attributed to a different line is not a coherent
  -- single-line selection.
  IF v_line_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.tickets t
       WHERE t.id = ANY(v_ids)
         AND t.order_item_id IS NOT NULL
         AND t.order_item_id <> v_line_id) THEN
    RETURN QUERY SELECT 'mixed_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  -- Cumulative bound across every prior reversal of the same line.
  IF v_line_qty IS NOT NULL THEN
    SELECT count(*) INTO v_prior
      FROM public.ticket_refund_items i
      JOIN public.tickets t2 ON t2.id = i.ticket_id
      WHERE t2.order_id = v_order_id AND t2.ticket_type_id = v_type_id;
    IF v_prior + v_n > v_line_qty THEN
      RETURN QUERY SELECT 'selection_exceeds_payment'::text, NULL::uuid, 0, 0; RETURN;
    END IF;
  END IF;

  -- Money is authoritative from the immutable order line; order totals stay
  -- untouched as the paid record. Ambiguity is left NULL, never guessed.
  IF v_attempt.price_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.ticket_price_quotes WHERE id=v_attempt.price_quote_id;
    IF v_quote.id IS NULL OR v_order.total_cents<>v_quote.total_cents
      OR v_order.subtotal_cents<>v_quote.subtotal_cents OR v_attempt.amount_cents<>v_quote.total_cents
      OR v_attempt.unit_price_cents<>v_quote.unit_price_cents OR v_unit_price<>v_quote.unit_price_cents
      OR v_line_qty<>v_quote.quantity OR v_order.currency<>v_quote.currency THEN
      RETURN QUERY SELECT 'payment_not_correlated'::text,NULL::uuid,0,0; RETURN;
    END IF;
    SELECT count(*),sum(a.paid_cents) INTO v_matched,v_amount_cents
      FROM public.tickets t JOIN public.ticket_quote_allocations a
        ON a.quote_id=t.price_quote_id AND a.ordinal=t.price_quote_ordinal
      WHERE t.id=ANY(v_ids) AND a.quote_id=v_quote.id AND t.order_item_id=v_line_id;
    IF v_matched<>v_n OR v_amount_cents IS NULL OR v_amount_cents<0
      OR v_amount_cents>v_quote.total_cents THEN
      RETURN QUERY SELECT 'payment_not_correlated'::text,NULL::uuid,0,0; RETURN;
    END IF;
  ELSE
    v_amount_cents := CASE WHEN v_unit_price IS NULL THEN NULL ELSE v_unit_price * v_n END;
  END IF;
  v_currency := CASE
    WHEN v_order.currency IS NOT NULL AND lower(v_order.currency) ~ '^[a-z]{3}$'
      THEN lower(v_order.currency)
    ELSE NULL
  END;

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_n
    WHERE id = v_type_id AND quantity_sold >= v_n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  INSERT INTO public.ticket_refunds(
    provider_refund_reference, payment_intent_id, order_id, event_id, ticket_type_id, ticket_count,
    order_item_id, amount_cents, currency)
  VALUES (p_provider_refund_reference, p_payment_intent_id, v_order_id, v_event_id, v_type_id, v_n,
    v_line_id, v_amount_cents, v_currency)
  RETURNING id INTO v_new_refund_id;

  INSERT INTO public.ticket_refund_items(refund_id, ticket_id)
  SELECT v_new_refund_id, t FROM unnest(v_ids) AS t;

  UPDATE public.tickets
    SET status = 'void'
    WHERE id = ANY(v_ids) AND status = 'issued';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_n THEN
    RAISE EXCEPTION 'ticket_reversal_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'reversed'::text, v_new_refund_id, v_n, v_n;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_checkout_provider_deadline() RETURNS trigger
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
    OR NEW.provider_expires_at_seconds <> floor(extract(epoch FROM least(r.expires_at,
      COALESCE((SELECT expires_at FROM public.ticket_price_quotes WHERE id=NEW.price_quote_id),r.expires_at))))
    OR remaining < 1816 OR remaining > 86400 THEN
    RAISE EXCEPTION 'invalid provider deadline contract' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Product step 48/51: scripts/quoted-expiry.draft.sql
-- LOCAL REVIEW ONLY, after quote storage/quoted checkout; before guest promo reader.
-- No installer/migration or hosted application. Trusted server GET evidence only.

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

-- Product step 49/51: scripts/guest-promo-checkout.draft.sql
-- LOCAL REVIEW ONLY, after the quote storage and quoted-checkout drafts.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Change detector for buyer price review, NOT an authentication proof or price input.
CREATE FUNCTION public.ticket_price_revision(p_tier uuid,p_quantity integer,p_unit integer,p_currency text,
  p_promotion uuid,p_version integer,p_kind text,p_value integer)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT md5(concat_ws('|',p_tier::text,p_quantity::text,p_unit::text,p_currency,
    p_promotion::text,p_version::text,p_kind,p_value::text));
$$;

CREATE FUNCTION public.preview_ticket_price(p_tier uuid,p_quantity integer,p_code text)
RETURNS TABLE(outcome text,preview jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.ticket_types%ROWTYPE; p public.ticket_promotions%ROWTYPE;
  v_code text; v_now timestamptz:=clock_timestamp(); v_subtotal bigint; v_discount integer:=0;
BEGIN
  IF p_tier IS NULL OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 10
    OR (p_code IS NOT NULL AND btrim(p_code)!~'^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::jsonb; RETURN;
  END IF;
  v_code:=upper(btrim(p_code));
  SELECT * INTO t FROM public.ticket_types WHERE id=p_tier;
  IF NOT FOUND OR NOT t.is_active OR t.currency<>'usd' OR p_quantity>t.max_per_order
    OR t.quantity_total IS NULL OR t.quantity_sold+p_quantity>t.quantity_total
    OR NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=t.event_id AND e.is_published) THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::jsonb; RETURN;
  END IF;
  v_subtotal:=t.price_cents::bigint*p_quantity;
  IF v_subtotal>99999999 THEN RETURN QUERY SELECT 'not_available'::text,NULL::jsonb; RETURN; END IF;
  IF v_code IS NOT NULL THEN
    SELECT * INTO p FROM public.ticket_promotions WHERE event_id=t.event_id AND code=v_code;
    IF NOT FOUND OR NOT p.enabled OR p.starts_at>v_now
      OR p.expires_at<v_now+interval '1816 seconds'
      OR (p.ticket_type_id IS NOT NULL AND p.ticket_type_id<>t.id)
      OR (p.max_redemptions IS NOT NULL AND p.max_redemptions <=
        (SELECT count(*) FROM public.promotion_redemptions r WHERE r.promotion_id=p.id AND r.state IN ('reserved','consumed'))) THEN
      RETURN QUERY SELECT 'promotion_unavailable'::text,NULL::jsonb; RETURN;
    END IF;
    v_discount:=CASE WHEN p.kind='fixed' THEN least(p.value,v_subtotal)::integer
      ELSE (v_subtotal*p.value/10000)::integer END;
  END IF;
  IF v_subtotal-v_discount<50 THEN
    RETURN QUERY SELECT 'unsupported_paid_total'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'ready'::text,jsonb_build_object(
    'ticketTypeId',t.id,'quantity',p_quantity,'unitPriceCents',t.price_cents,
    'subtotalCents',v_subtotal,'discountCents',v_discount,'totalCents',v_subtotal-v_discount,
    'currency','usd','feeCents',0,'taxMode','not_calculated','code',v_code,
    'revision',public.ticket_price_revision(t.id,p_quantity,t.price_cents,t.currency,p.id,p.version,p.kind,p.value));
END; $$;

CREATE FUNCTION public.prepare_priced_guest_cart(p_owner uuid,p_cart uuid,p_tier uuid,p_quantity integer,
  p_name text,p_email text,p_code text,p_revision text)
RETURNS TABLE(outcome text,quote_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prepared record; priced record; q public.ticket_price_quotes%ROWTYPE;
BEGIN
  IF p_owner IS NULL OR p_revision IS NULL OR p_revision!~'^[0-9a-f]{32}$' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO prepared FROM public.prepare_guest_checkout_cart(p_owner,p_cart,p_tier,p_quantity,p_name,p_email);
  IF prepared.outcome IS DISTINCT FROM 'ready' THEN
    RETURN QUERY SELECT prepared.outcome::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO priced FROM public.reserve_ticket_price_quote(p_owner,p_cart,p_code);
  IF priced.outcome NOT IN ('ready','existing') THEN
    -- Roll back this function's cart/hold/quota effects together on a refused code.
    RAISE SQLSTATE 'P0002' USING MESSAGE=priced.outcome;
  END IF;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE id=priced.quote_id;
  IF public.ticket_price_revision(q.ticket_type_id,q.quantity,q.unit_price_cents,q.currency,
    q.promotion_id,q.promotion_version,q.promotion_kind,q.promotion_value)<>p_revision THEN
    RAISE SQLSTATE 'P0002' USING MESSAGE='review_required';
  END IF;
  RETURN QUERY SELECT 'ready'::text,q.id;
EXCEPTION WHEN SQLSTATE 'P0002' THEN
  RETURN QUERY SELECT SQLERRM::text,NULL::uuid;
END; $$;

CREATE FUNCTION public.read_priced_guest_cart(p_owner uuid,p_cart uuid)
RETURNS TABLE(snapshot jsonb,attempt_id uuid,attempt_status text,attempt_created_at timestamptz,
  provider_deadline bigint,reservation_status text,reservation_expires_at timestamptz,payment_attached boolean,release_recorded boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('version',1,'quoteId',q.id,'eventId',q.event_id,'ticketTypeId',q.ticket_type_id,
    'currency',q.currency,'quantity',q.quantity,'unitPriceCents',q.unit_price_cents,
    'subtotalCents',q.subtotal_cents,'discountCents',q.discount_cents,'totalCents',q.total_cents,
    'feeCents',q.fee_cents,'taxMode',q.tax_mode,
    'createdAtMs',floor(extract(epoch FROM q.created_at)*1000)::bigint,
    'expiresAtMs',floor(extract(epoch FROM q.expires_at)*1000)::bigint,
    'discount',CASE WHEN q.promotion_id IS NULL THEN NULL ELSE jsonb_build_object('promotionId',q.promotion_id,
      'promotionVersion',q.promotion_version,'code',q.promotion_code,'kind',q.promotion_kind,'value',q.promotion_value) END,
    'tickets',(SELECT jsonb_agg(jsonb_build_object('ordinal',x.ordinal,'subtotalCents',x.subtotal_cents,
      'discountCents',x.discount_cents,'paidCents',x.paid_cents) ORDER BY x.ordinal)
      FROM public.ticket_quote_allocations x WHERE x.quote_id=q.id)),
    a.id,a.status,a.created_at,a.provider_expires_at_seconds,h.status,h.expires_at,a.payment_intent_id IS NOT NULL,
    h.status='released' AND (a.id IS NULL OR a.status='abandoned') AND a.payment_intent_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.checkout_attempt_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM public.payment_webhook_events w WHERE w.checkout_attempt_id=a.id
      AND w.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded'))
    AND (q.promotion_id IS NULL OR EXISTS(SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='released')) AND EXISTS(
      SELECT 1 FROM public.ticket_quote_expiry_records x WHERE x.quote_id=q.id AND x.cart_id=c.id
        AND x.owner_user_id=q.owner_user_id AND x.reservation_id=h.id AND x.hold_expires_at=h.expires_at
        AND x.attempt_id IS NOT DISTINCT FROM a.id AND x.recorded_at<=statement_timestamp()
        AND (x.recorded_at>=q.expires_at OR x.evidence_kind IN ('start_window_closed','request_never_sent')))
  FROM public.guest_checkout_carts c JOIN public.ticket_price_quotes q ON q.cart_id=c.id
  JOIN public.inventory_reservations h ON h.id=c.reservation_id
  LEFT JOIN public.checkout_attempts a ON a.price_quote_id=q.id
  WHERE c.id=p_cart AND c.owner_user_id=p_owner AND q.owner_user_id=p_owner AND h.owner_user_id=p_owner
    AND c.ticket_type_id=q.ticket_type_id AND c.quantity=q.quantity
    AND h.event_id=q.event_id AND h.ticket_type_id=q.ticket_type_id AND h.quantity=q.quantity
    AND (a.id IS NULL OR (a.user_id=p_owner AND a.reservation_id=h.id AND a.event_id=q.event_id
      AND a.ticket_type_id=q.ticket_type_id AND a.quantity=q.quantity AND a.unit_price_cents=q.unit_price_cents
      AND a.amount_cents=q.total_cents AND a.currency=q.currency AND a.provider='stripe_test'
      AND a.provider_request_version=2 AND a.provider_expires_at_seconds=floor(extract(epoch FROM q.expires_at))));
$$;

CREATE FUNCTION public.begin_priced_guest_payment(p_owner uuid,p_cart uuid)
RETURNS TABLE(outcome text,attempt_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE; c public.guest_checkout_carts%ROWTYPE;
  a public.checkout_attempts%ROWTYPE; deadline bigint;
BEGIN
  IF p_owner IS NULL OR p_cart IS NULL THEN RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN; END IF;
  -- Same cart lock as quote creation. Exactly one caller owns the initial POST.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analog-promo-cart:'||p_cart::text,0));
  SELECT * INTO c FROM public.guest_checkout_carts WHERE id=p_cart AND owner_user_id=p_owner;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE cart_id=c.id AND owner_user_id=p_owner;
  IF q.id IS NULL THEN RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN; END IF;
  SELECT * INTO a FROM public.checkout_attempts WHERE price_quote_id=q.id;
  IF FOUND THEN RETURN QUERY SELECT 'existing'::text,a.id; RETURN; END IF;
  deadline:=floor(extract(epoch FROM q.expires_at));
  IF deadline-ceil(extract(epoch FROM clock_timestamp())) NOT BETWEEN 1816 AND 86400 THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN;
  END IF;
  INSERT INTO public.checkout_attempts(user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,
    amount_cents,currency,provider,provider_request_version,provider_expires_at_seconds,price_quote_id)
  VALUES(p_owner,c.reservation_id,q.event_id,q.ticket_type_id,q.quantity,q.unit_price_cents,q.total_cents,
    q.currency,'stripe_test',2,deadline,q.id) RETURNING * INTO a;
  RETURN QUERY SELECT 'created'::text,a.id;
END; $$;

REVOKE ALL ON FUNCTION public.ticket_price_revision(uuid,integer,integer,text,uuid,integer,text,integer),
  public.preview_ticket_price(uuid,integer,text),public.prepare_priced_guest_cart(uuid,uuid,uuid,integer,text,text,text,text),
  public.read_priced_guest_cart(uuid,uuid),public.begin_priced_guest_payment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ticket_price_revision(uuid,integer,integer,text,uuid,integer,text,integer),
  public.preview_ticket_price(uuid,integer,text),public.prepare_priced_guest_cart(uuid,uuid,uuid,integer,text,text,text,text),
  public.read_priced_guest_cart(uuid,uuid),public.begin_priced_guest_payment(uuid,uuid) TO service_role;
DO $sandbox_acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.ticket_price_revision(uuid,integer,integer,text,uuid,integer,text,integer),
      public.preview_ticket_price(uuid,integer,text),public.prepare_priced_guest_cart(uuid,uuid,uuid,integer,text,text,text,text),
      public.read_priced_guest_cart(uuid,uuid),public.begin_priced_guest_payment(uuid,uuid) FROM sandbox_exec;
  END IF;
END; $sandbox_acl$;

-- Product step 50/51: scripts/quoted-expiry-dispatch.draft.sql
-- LOCAL REVIEW ONLY, after quoted-expiry.draft.sql. No deployed worker/cron.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX ticket_price_quotes_expiry_cursor_idx ON public.ticket_price_quotes(expires_at,id);
-- Distinguish an explicit legacy attempt from a quoted one without a fallback
-- projection if the release schema is absent. Server-only; no browser grants.
CREATE FUNCTION public.read_priced_expiry_target(p_attempt uuid)
RETURNS TABLE(attempt_id uuid,quote_id uuid,owner_user_id uuid,cart_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT a.id,a.price_quote_id,q.owner_user_id,q.cart_id
  FROM public.checkout_attempts a LEFT JOIN public.ticket_price_quotes q ON q.id=a.price_quote_id
  WHERE a.id=p_attempt
$$;
-- Cursor remains the exact database timestamp + quote id, not a lossy JS date.
-- A failed/unknown provider read can be retained and passed, without starving
-- later candidates in the same sweep. Each call returns at most ten rows.
CREATE FUNCTION public.list_priced_expiry_candidates(p_limit integer DEFAULT 10,
  p_after_expiry timestamptz DEFAULT NULL,p_after_quote uuid DEFAULT NULL)
RETURNS TABLE(quote_id uuid,owner_user_id uuid,cart_id uuid,expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>10
    OR (p_after_expiry IS NULL)<>(p_after_quote IS NULL)
    OR (p_after_expiry IS NOT NULL AND NOT isfinite(p_after_expiry)) THEN
    RAISE EXCEPTION 'invalid_expiry_cursor' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT q.id,q.owner_user_id,q.cart_id,q.expires_at
    FROM public.ticket_price_quotes q JOIN public.guest_checkout_carts c ON c.id=q.cart_id
    JOIN public.inventory_reservations h ON h.id=c.reservation_id
    LEFT JOIN public.checkout_attempts a ON a.price_quote_id=q.id
    WHERE q.expires_at<=statement_timestamp() AND h.status='confirmed'
      AND NOT EXISTS(SELECT 1 FROM public.ticket_quote_expiry_records x WHERE x.quote_id=q.id)
      AND (a.id IS NULL OR (a.status='pending' AND a.payment_intent_id IS NULL))
      AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.checkout_attempt_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM public.payment_webhook_events w WHERE w.checkout_attempt_id=a.id
        AND w.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded'))
      AND (p_after_expiry IS NULL OR (q.expires_at,q.id)>(p_after_expiry,p_after_quote))
    ORDER BY q.expires_at,q.id LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION public.read_priced_expiry_target(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_priced_expiry_candidates(integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_priced_expiry_target(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_priced_expiry_candidates(integer,timestamptz,uuid) TO service_role;
DO $acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.read_priced_expiry_target(uuid) FROM sandbox_exec;
    REVOKE ALL ON FUNCTION public.list_priced_expiry_candidates(integer,timestamptz,uuid) FROM sandbox_exec;
  END IF;
END; $acl$;

-- Product step 51/51: scripts/organizer-promotions.draft.sql
-- LOCAL REVIEW ONLY. Requires promotion-quotes.draft.sql; not a migration.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX ticket_promotions_event_code_cursor_idx ON public.ticket_promotions(event_id,code COLLATE "C");
CREATE FUNCTION public.read_organizer_promotions(p_actor uuid,p_event uuid,p_after_code text DEFAULT NULL)
RETURNS TABLE(outcome text,payload jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_rows jsonb; v_tiers jsonb; v_next text;
BEGIN
  PERFORM 1 FROM public.event_memberships m WHERE m.event_id=p_event AND m.user_id=p_actor
    AND m.role IN ('organizer','admin') FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF p_after_code IS NOT NULL AND p_after_code !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'currency',t.currency,
    'active',t.is_active) ORDER BY t.name,t.id),'[]'::jsonb) INTO v_tiers
    FROM (SELECT id,name,currency,is_active FROM public.ticket_types WHERE event_id=p_event ORDER BY name,id LIMIT 101) t;
  IF jsonb_array_length(v_tiers)>100 THEN
    RETURN QUERY SELECT 'too_many_tiers'::text,NULL::jsonb; RETURN;
  END IF;
  WITH page AS (SELECT p.* FROM public.ticket_promotions p WHERE p.event_id=p_event
      AND (p_after_code IS NULL OR p.code COLLATE "C">p_after_code COLLATE "C") ORDER BY p.code COLLATE "C" LIMIT 51),
    shown AS (SELECT * FROM page ORDER BY code COLLATE "C" LIMIT 50)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'eventId',p.event_id,
    'ticketTypeId',p.ticket_type_id,'code',p.code,'version',p.version,'enabled',p.enabled,
    'startsAt',p.starts_at,'expiresAt',p.expires_at,'kind',p.kind,'value',p.value,
    'currency',p.currency,'maxRedemptions',p.max_redemptions,
    'reserved',(SELECT count(*) FROM public.promotion_redemptions r WHERE r.promotion_id=p.id AND r.state='reserved'),
    'consumed',(SELECT count(*) FROM public.promotion_redemptions r WHERE r.promotion_id=p.id AND r.state='consumed'))
    ORDER BY p.code COLLATE "C"),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM page)>50 THEN max(p.code COLLATE "C") ELSE NULL END
    INTO v_rows,v_next FROM shown p;
  RETURN QUERY SELECT 'ready'::text,jsonb_build_object('rows',v_rows,'tiers',v_tiers,'nextAfter',v_next);
END; $$;

CREATE FUNCTION public.save_organizer_promotion(p_actor uuid,p_event uuid,p_id uuid,p_version integer,
  p_code text,p_tier uuid,p_enabled boolean,p_starts timestamptz,p_expires timestamptz,
  p_kind text,p_value integer,p_limit integer)
RETURNS TABLE(outcome text,promotion_id uuid,version integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.ticket_promotions%ROWTYPE; v_id uuid; v_code text; v_used bigint;
BEGIN
  -- Revalidate and lock the actual membership inside the write transaction,
  -- including when access was revoked after the caller-scoped server precheck.
  PERFORM 1 FROM public.event_memberships m WHERE m.event_id=p_event AND m.user_id=p_actor
    AND m.role IN ('organizer','admin') FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::uuid,NULL::integer; RETURN; END IF;
  IF p_code IS NULL OR btrim(p_code) !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'
    OR p_enabled IS NULL OR p_starts IS NULL OR p_expires IS NULL
    OR NOT isfinite(p_starts) OR NOT isfinite(p_expires) OR p_expires<=p_starts
    OR p_kind IS NULL OR p_kind NOT IN ('fixed','percentage') OR p_value IS NULL OR p_value<1
    OR (p_kind='fixed' AND p_value>99999999) OR (p_kind='percentage' AND p_value>10000)
    OR (p_kind='percentage' AND p_value=10000 AND (p_id IS NULL OR p_enabled))
    OR (p_limit IS NOT NULL AND p_limit<1)
    OR (p_id IS NULL AND p_version IS NOT NULL) OR (p_id IS NOT NULL AND (p_version IS NULL OR p_version<1)) THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  v_code:=upper(btrim(p_code));
  -- Same tier-before-promotion order as quote reservation. Scope is immutable.
  IF p_tier IS NOT NULL THEN
    PERFORM 1 FROM public.ticket_types t WHERE t.id=p_tier AND t.event_id=p_event AND t.currency='usd' FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_scope'::text,NULL::uuid,NULL::integer; RETURN; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.ticket_promotions(event_id,ticket_type_id,code,enabled,starts_at,expires_at,kind,value,max_redemptions)
    VALUES(p_event,p_tier,v_code,p_enabled,p_starts,p_expires,p_kind,p_value,p_limit)
    ON CONFLICT(event_id,code) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN QUERY SELECT 'code_taken'::text,NULL::uuid,NULL::integer; RETURN; END IF;
    RETURN QUERY SELECT 'saved'::text,v_id,1; RETURN;
  END IF;
  SELECT * INTO p FROM public.ticket_promotions x WHERE x.id=p_id AND x.event_id=p_event FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::uuid,NULL::integer; RETURN; END IF;
  IF p.version<>p_version OR p.version=2147483647 THEN
    RETURN QUERY SELECT 'version_conflict'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  IF p.code<>v_code OR p.ticket_type_id IS DISTINCT FROM p_tier THEN
    RETURN QUERY SELECT 'immutable_scope'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  SELECT count(*) INTO v_used FROM public.promotion_redemptions r
    WHERE r.promotion_id=p.id AND r.state IN ('reserved','consumed');
  IF p_limit IS NOT NULL AND p_limit<v_used THEN
    RETURN QUERY SELECT 'limit_below_usage'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  UPDATE public.ticket_promotions x SET version=x.version+1,enabled=p_enabled,starts_at=p_starts,
    expires_at=p_expires,kind=p_kind,value=p_value,max_redemptions=p_limit WHERE x.id=p.id;
  RETURN QUERY SELECT 'saved'::text,p.id,p.version+1;
END; $$;
REVOKE ALL ON FUNCTION public.read_organizer_promotions(uuid,uuid,text),
  public.save_organizer_promotion(uuid,uuid,uuid,integer,text,uuid,boolean,timestamptz,timestamptz,text,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_organizer_promotions(uuid,uuid,text),
  public.save_organizer_promotion(uuid,uuid,uuid,integer,text,uuid,boolean,timestamptz,timestamptz,text,integer,integer)
  TO service_role;
DO $acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.read_organizer_promotions(uuid,uuid,text),
      public.save_organizer_promotion(uuid,uuid,uuid,integer,text,uuid,boolean,timestamptz,timestamptz,text,integer,integer)
      FROM sandbox_exec;
  END IF;
END; $acl$;
DO $verify_install$
DECLARE
  actual record;
BEGIN
  SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_tables,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public') AS policies,
    (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS triggers,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public') AS routines
    INTO actual;
  IF (actual.tables, actual.rls_tables, actual.policies, actual.triggers, actual.routines)
     IS DISTINCT FROM (29, 29, 15, 34, 62) THEN
    RAISE EXCEPTION 'portable install catalog mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'browser role can execute a public routine';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('events', 'anon', true, false, false, false),
      ('events', 'authenticated', true, false, false, false),
      ('event_memberships', 'anon', false, false, false, false),
      ('event_memberships', 'authenticated', true, false, false, false),
      ('order_items', 'anon', false, false, false, false),
      ('order_items', 'authenticated', true, true, false, false),
      ('orders', 'anon', false, false, false, false),
      ('orders', 'authenticated', true, true, false, false),
      ('profiles', 'anon', false, false, false, false),
      ('profiles', 'authenticated', true, true, true, false),
      ('ticket_types', 'anon', true, false, false, false),
      ('ticket_types', 'authenticated', true, false, false, false),
      ('tickets', 'anon', false, false, false, false),
      ('tickets', 'authenticated', true, false, false, false)
    ) AS expected(table_name, role_name, can_select, can_insert, can_update, can_delete)
    WHERE has_table_privilege(role_name, format('public.%I', table_name), 'SELECT')
            IS DISTINCT FROM can_select
       OR has_table_privilege(role_name, format('public.%I', table_name), 'INSERT')
            IS DISTINCT FROM can_insert
       OR has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE')
            IS DISTINCT FROM can_update
       OR has_table_privilege(role_name, format('public.%I', table_name), 'DELETE')
            IS DISTINCT FROM can_delete
  ) OR NOT (
    has_column_privilege('authenticated', 'public.tickets', 'holder_name', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.tickets', 'holder_email', 'UPDATE')
  ) OR has_column_privilege('authenticated', 'public.tickets', 'created_at', 'UPDATE') THEN
    RAISE EXCEPTION 'browser table grant mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser(role_name)
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND has_table_privilege(browser.role_name, c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
  ) THEN
    RAISE EXCEPTION 'browser role has unexpected table administration grant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser(role_name)
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN (
        'events', 'event_memberships', 'order_items', 'orders', 'profiles', 'ticket_types', 'tickets'
      )
      AND (
        has_table_privilege(browser.role_name, c.oid, 'SELECT, INSERT, UPDATE, DELETE')
        OR has_any_column_privilege(browser.role_name, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'unexpected browser access outside reviewed tables';
  END IF;
  RAISE NOTICE 'PASS: portable install catalog and SQL browser grants';
END;
$verify_install$;
DO $verify_guest$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])
      AND p.proname IN ('prepare_guest_checkout_cart','queue_guest_purchase_receipt',
        'claim_guest_purchase_delivery','finish_guest_purchase_delivery','request_guest_purchase_recovery',
        'redeem_guest_purchase_proof','resolve_guest_purchase_session','revoke_guest_purchase_session',
        'attach_guest_purchase_account','resolve_guest_account_purchase','list_guest_account_purchases')
  ) THEN RAISE EXCEPTION 'guest routine must be invoker with empty search path'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'prepare_guest_checkout_cart','queue_guest_purchase_receipt','claim_guest_purchase_delivery',
        'finish_guest_purchase_delivery','request_guest_purchase_recovery','redeem_guest_purchase_proof',
        'resolve_guest_purchase_session','revoke_guest_purchase_session','attach_guest_purchase_account',
        'resolve_guest_account_purchase','list_guest_account_purchases')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')) <> 11
  THEN RAISE EXCEPTION 'guest service routine grant mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('guest_checkout_carts',false),('guest_purchase_deliveries',true),
      ('guest_purchase_sessions',true),('guest_purchase_account_links',false)) AS expected(name,can_update)
    WHERE NOT has_table_privilege('service_role','public.'||name,'SELECT')
      OR NOT has_table_privilege('service_role','public.'||name,'INSERT')
      OR has_table_privilege('service_role','public.'||name,'UPDATE') IS DISTINCT FROM can_update
      OR has_table_privilege('service_role','public.'||name,'DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN RAISE EXCEPTION 'guest service table grant mismatch'; END IF;
END $verify_guest$;
DO $verify_promotion_release$ DECLARE actual jsonb; checked_role text; checked_table text; BEGIN
  SELECT jsonb_build_object('roles',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) row),
'relations',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
    c.relreplident,c.reloptions,c.relowner=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass) AS same_owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') row),
'columns',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
    a.attcollation::regcollation::text AS collation,
    a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped) row),
'constraints',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,con.conname,con.convalidated,pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND con.contype <> 'n') row),
'indexes',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname AS table_name,idx.relname AS index_name,pg_get_indexdef(i.indexrelid) AS definition,
    i.indisvalid,i.indisready,i.indislive
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class idx ON idx.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') row),
'triggers',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal) row),
'policies',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') row),
'routines',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT p.proname,oidvectortypes(p.proargtypes) AS arguments,md5(pg_get_functiondef(p.oid)) AS definition,
    p.prosecdef,p.proconfig,p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass) AS same_owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') row),
'types',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT t.typname,t.typtype,t.typcategory,format_type(t.typbasetype,t.typtypmod) AS base_type,
    (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') row),
'tablePrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,role_name,privilege_name,has_table_privilege(role_name,c.oid,privilege_name) AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege_name
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) row),
'columnPrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT c.relname,a.attname,role_name,privilege_name,
    has_column_privilege(role_name,c.oid,a.attname,privilege_name) AS allowed
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege_name
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped) row),
'routinePrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT p.proname,oidvectortypes(p.proargtypes) AS arguments,role_name,
    has_function_privilege(role_name,p.oid,'EXECUTE') AS allowed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name WHERE n.nspname='public') row),
'defaultPrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT coalesce(n.nspname,'<global>') AS scope,d.defaclobjtype,x.privilege_type,x.is_grantable,
    CASE WHEN x.grantee=d.defaclrole THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
    CASE WHEN x.grantor=d.defaclrole THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END AS grantor
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    WHERE d.defaclrole=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass)
      AND (d.defaclnamespace=0 OR n.nspname='public')) row),
'directPrivileges',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (SELECT object_name,grantee,grantor,privilege_type,is_grantable FROM (
    SELECT 'relation:'||c.relname AS object_name,
      CASE WHEN x.grantee=c.relowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
      CASE WHEN x.grantor=c.relowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END AS grantor,x.privilege_type,x.is_grantable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE n.nspname='public'
    UNION ALL
    SELECT 'column:'||c.relname||'.'||a.attname,
      CASE WHEN x.grantee=c.relowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      CASE WHEN x.grantor=c.relowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END,x.privilege_type,x.is_grantable
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'routine:'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
      CASE WHEN x.grantee=p.proowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      CASE WHEN x.grantor=p.proowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END,x.privilege_type,x.is_grantable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE n.nspname='public'
    ) acl) row)) INTO actual;
  IF NOT (actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"4953559d3160db58dca47739fc1aa8ae","columns":"2c3254a79e4b129c74214d4404264f57","indexes":"49c2158c70680934d233dc2a14a58e84","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"9952ec76f020c9734fffd2d47abc335f","triggers":"25467ba6bdd90877e061ebc4f58cf1ca","relations":"bd0dbb46ab98a17b03d4435cf78a663d","constraints":"b5493ab83443470650ba570224634714","tablePrivileges":"7a4ce2525f9714877ab5138bb95af756","columnPrivileges":"a401d4ff6e0917d6cab30b851c961085","directPrivileges":"f767782679bce42b541db75dfc245e63","defaultPrivileges":"24997da7a62a87df38a61fe29cfa2f8d","routinePrivileges":"58d925a1eaec21b2a2455d559d2eee31"}'::jsonb OR actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"4953559d3160db58dca47739fc1aa8ae","columns":"2c3254a79e4b129c74214d4404264f57","indexes":"49c2158c70680934d233dc2a14a58e84","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"9952ec76f020c9734fffd2d47abc335f","triggers":"25467ba6bdd90877e061ebc4f58cf1ca","relations":"bd0dbb46ab98a17b03d4435cf78a663d","constraints":"b5493ab83443470650ba570224634714","tablePrivileges":"7a4ce2525f9714877ab5138bb95af756","columnPrivileges":"a401d4ff6e0917d6cab30b851c961085","directPrivileges":"a221e248562db69aeb0865e659fea291","defaultPrivileges":"465ff8a86dbfe51e0281f3c45a45bfae","routinePrivileges":"e9d1e3b0ec5165d8016847075e2e7668"}'::jsonb OR actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"4953559d3160db58dca47739fc1aa8ae","columns":"2c3254a79e4b129c74214d4404264f57","indexes":"49c2158c70680934d233dc2a14a58e84","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"9952ec76f020c9734fffd2d47abc335f","triggers":"25467ba6bdd90877e061ebc4f58cf1ca","relations":"bd0dbb46ab98a17b03d4435cf78a663d","constraints":"b5493ab83443470650ba570224634714","tablePrivileges":"7a4ce2525f9714877ab5138bb95af756","columnPrivileges":"a401d4ff6e0917d6cab30b851c961085","directPrivileges":"6ac1ab2663eae4abff4a736af98d696a","defaultPrivileges":"04b3b4f857ba9ac3c67c63ed2948bffb","routinePrivileges":"e9d1e3b0ec5165d8016847075e2e7668"}'::jsonb) THEN
    RAISE EXCEPTION 'release catalog/permissions differ'; END IF;
  
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles
    WHERE rolname IN ('anon','authenticated','service_role','sandbox_exec'))) THEN
    RAISE EXCEPTION 'application role inheritance differs'; END IF;
  IF actual='{"roles":"2e7ca82009a08eb42cd49641768392be","types":"4953559d3160db58dca47739fc1aa8ae","columns":"2c3254a79e4b129c74214d4404264f57","indexes":"49c2158c70680934d233dc2a14a58e84","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"9952ec76f020c9734fffd2d47abc335f","triggers":"25467ba6bdd90877e061ebc4f58cf1ca","relations":"bd0dbb46ab98a17b03d4435cf78a663d","constraints":"b5493ab83443470650ba570224634714","tablePrivileges":"7a4ce2525f9714877ab5138bb95af756","columnPrivileges":"a401d4ff6e0917d6cab30b851c961085","directPrivileges":"6ac1ab2663eae4abff4a736af98d696a","defaultPrivileges":"04b3b4f857ba9ac3c67c63ed2948bffb","routinePrivileges":"e9d1e3b0ec5165d8016847075e2e7668"}'::jsonb AND NOT EXISTS(SELECT 1 FROM pg_roles
    WHERE rolname='sandbox_exec' AND rolcanlogin AND rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'managed platform role differs'; END IF;
  FOR checked_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','sandbox_exec') LOOP
    FOREACH checked_table IN ARRAY ARRAY['ticket_promotions','ticket_price_quotes','ticket_quote_allocations',
      'promotion_redemptions','ticket_quote_expiry_records'] LOOP
      IF has_table_privilege(checked_role,'public.'||checked_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(checked_role,'public.'||checked_table,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'private pricing table grant differs'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('guard_immutable_ticket_quote','guard_ticket_quote_allocation','guard_ticket_promotion_version',
        'guard_promotion_redemption','reserve_ticket_price_quote','settle_ticket_promotion','guard_checkout_price_quote',
        'guard_ticket_quote_identity','guard_linked_promotion_release','read_quoted_refund_amount','guard_quoted_hold_release',
        'guard_quoted_attempt_delete','release_priced_guest_cart','ticket_price_revision','preview_ticket_price',
        'prepare_priced_guest_cart','read_priced_guest_cart','begin_priced_guest_payment','read_priced_expiry_target',
        'list_priced_expiry_candidates','read_organizer_promotions','save_organizer_promotion')
      AND has_function_privilege(checked_role,p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'private pricing routine grant differs'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef) THEN
    RAISE EXCEPTION 'release routines must remain invoker'; END IF;
  -- The complete routine fingerprint above checks every function body/config.
  -- Retain historical invoker helpers with their reviewed public search path;
  -- all new pricing routines use an explicitly empty search path.
END $verify_promotion_release$;
COMMIT;
