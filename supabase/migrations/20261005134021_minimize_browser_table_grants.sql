-- Source-only review candidate. Narrow browser-role table privileges to the
-- operations supported by the existing RLS policies. Do not apply to the
-- selected hosted project without Chris's separate schema-change approval.
-- This intentionally leaves service_role and default privileges unchanged.

REVOKE ALL ON TABLE public.events, public.order_items, public.orders,
  public.profiles, public.ticket_types, public.tickets
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.events, public.ticket_types TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.orders, public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.tickets TO authenticated;
GRANT UPDATE (holder_name, holder_email) ON TABLE public.tickets TO authenticated;

-- A grant is not a replacement for row-level security. Keep RLS enabled on
-- every table above, including tables whose current policies deny writes.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DO $browser_grant_postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('events', 'anon', true, false, false, false),
      ('events', 'authenticated', true, false, false, false),
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
    RAISE EXCEPTION 'browser table grant postflight failed';
  END IF;
END;
$browser_grant_postflight$;
