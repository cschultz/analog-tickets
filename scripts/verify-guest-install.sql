-- Read-only verifier for the 45-step fresh guest installer.
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
COMMIT;
