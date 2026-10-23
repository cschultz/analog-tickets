-- Independent, read-only catalog/grant check after the 42-step fresh install.
-- Run with psql -X -v ON_ERROR_STOP=1 -f scripts/verify-portable-install.sql.
-- This does not replace Data API/RLS behavior checks with synthetic users.
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
     IS DISTINCT FROM (20, 20, 15, 22, 29) THEN
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
COMMIT;
\echo PASS: independent read-only portable install catalog and grants check
