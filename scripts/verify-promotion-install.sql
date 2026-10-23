-- Read-only current app catalog/permission verifier.
BEGIN TRANSACTION READ ONLY;
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
