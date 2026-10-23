-- REVIEW ONLY. Exact-baseline additive guest upgrade; not approval to apply.
-- Quiesce application writers first. No reset, backfill, ownership rewrite or provider calls.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_advisory_xact_lock(hashtextextended('analog-guest-baseline-upgrade',0));
DO $guest_upgrade_preflight$ DECLARE actual jsonb; tables text; BEGIN
  IF to_regclass('public.events') IS NULL OR
    (SELECT relowner FROM pg_class WHERE oid=to_regclass('public.events')) <> current_user::regrole::oid
  THEN RAISE EXCEPTION 'upgrade requires the original baseline installer role'; END IF;
  SELECT string_agg(format('public.%I',c.relname),',' ORDER BY c.relname) INTO tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p');
  EXECUTE 'LOCK TABLE ' || tables || ' IN SHARE ROW EXCLUSIVE MODE';
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
  IF actual IS DISTINCT FROM '{"roles":"2e7ca82009a08eb42cd49641768392be","types":"e827ef7d284945abb42b57ee2b67f210","columns":"647ab3b32ab043b27ffa745c706ab3a8","indexes":"c6cb01fcb644cdb2fe1eb94e10247621","policies":"b0e245fb440fe2d03709c4af83b0cdf0","routines":"bc77ef0d643bd5d055036d8e0705a9f9","triggers":"64c6e6070ecedd9794936ca01482f46e","relations":"a144228acefb6cf60858ca53b7aad676","constraints":"12b0363218c8717e9a5ef4715e511e09","tablePrivileges":"43441a12a2e843c9c94cf9cf75b2280e","columnPrivileges":"3aa7c97deaf390973ced227d80809d03","directPrivileges":"dfe39f1e1be12aac785f4d6d4af87711","defaultPrivileges":"24997da7a62a87df38a61fe29cfa2f8d","routinePrivileges":"bc83332088b94a7c6e98bafe793fd661"}'::jsonb
  THEN RAISE EXCEPTION 'upgrade baseline catalog differs; no changes applied'; END IF;
END $guest_upgrade_preflight$;
SAVEPOINT portable_future_acl_probe;
CREATE TABLE public.analog_default_acl_probe (id integer);
CREATE SEQUENCE public.analog_default_acl_probe_seq;
CREATE FUNCTION public.analog_default_acl_probe_fn()
  RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
DO $portable_future_acl_probe$ BEGIN
  IF EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
         ('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS privilege(name)
       WHERE has_table_privilege(role.name,'public.analog_default_acl_probe',privilege.name)
     ) OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) AS privilege(name)
       WHERE has_sequence_privilege(role.name,'public.analog_default_acl_probe_seq',privilege.name)
     ) OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       WHERE has_function_privilege(role.name,'public.analog_default_acl_probe_fn()','EXECUTE')
     ) THEN
    RAISE EXCEPTION 'future public object has an automatic Data API grant';
  END IF;
END $portable_future_acl_probe$;
ROLLBACK TO SAVEPOINT portable_future_acl_probe;
RELEASE SAVEPOINT portable_future_acl_probe;

-- Additive guest source: scripts/guest-checkout-carts.draft.sql
-- REVIEW/LOCAL TEST ONLY. Not an installer step or migration; never apply hosted without approval.
-- Requires the current portable candidate, including prepare_owned_ticket_reservation.

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

-- Additive guest source: scripts/guest-purchase-recovery.draft.sql
-- LOCAL/REVIEW ONLY. Requires guest-checkout-carts.draft.sql and current installer.
-- Not a migration, installer step, or permission to apply to a hosted backend.

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

-- Additive guest source: scripts/guest-purchase-account.draft.sql
-- LOCAL/REVIEW ONLY. Requires guest cart/recovery drafts; not an applied migration.

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
     IS DISTINCT FROM (24, 24, 15, 23, 40) THEN
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
SAVEPOINT portable_future_acl_probe;
CREATE TABLE public.analog_default_acl_probe (id integer);
CREATE SEQUENCE public.analog_default_acl_probe_seq;
CREATE FUNCTION public.analog_default_acl_probe_fn()
  RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
DO $portable_future_acl_probe$ BEGIN
  IF EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
         ('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS privilege(name)
       WHERE has_table_privilege(role.name,'public.analog_default_acl_probe',privilege.name)
     ) OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) AS privilege(name)
       WHERE has_sequence_privilege(role.name,'public.analog_default_acl_probe_seq',privilege.name)
     ) OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       WHERE has_function_privilege(role.name,'public.analog_default_acl_probe_fn()','EXECUTE')
     ) THEN
    RAISE EXCEPTION 'future public object has an automatic Data API grant';
  END IF;
END $portable_future_acl_probe$;
ROLLBACK TO SAVEPOINT portable_future_acl_probe;
RELEASE SAVEPOINT portable_future_acl_probe;

COMMIT;
