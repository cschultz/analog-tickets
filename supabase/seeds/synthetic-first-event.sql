-- Opt-in sample content for an isolated, empty Analog Tickets test database.
-- Apply only after the reviewed schema install. This is deliberately outside
-- supabase/seed.sql so resets and future non-test installs do not add tickets.
-- It creates no Auth users, credentials, payments, or membership grants.

DO $synthetic_first_event$
DECLARE
  sample_event_id uuid;
BEGIN
  IF to_regclass('public.events') IS NULL
     OR to_regclass('public.ticket_types') IS NULL THEN
    RAISE EXCEPTION 'Analog Tickets schema is not installed';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.events'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ticket_types'::regclass) THEN
    RAISE EXCEPTION 'synthetic first-event seed requires RLS on event inventory';
  END IF;
  -- Keep the empty-inventory preflight and inserts in one atomic statement.
  LOCK TABLE public.events, public.ticket_types IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.events)
     OR EXISTS (SELECT 1 FROM public.ticket_types) THEN
    RAISE EXCEPTION 'synthetic first-event seed requires empty inventory';
  END IF;

  INSERT INTO public.events (
    slug, name, description, venue_name, starts_at, ends_at, is_published
  ) VALUES (
    'synthetic-first-event',
    'Synthetic First Event',
    'Test-only admission; not a real event or valid ticket.',
    'Imaginary Venue',
    now() + interval '7 days',
    now() + interval '7 days 2 hours',
    true
  )
  RETURNING id INTO sample_event_id;

  INSERT INTO public.ticket_types (
    event_id, slug, name, description, price_cents, currency,
    quantity_total, max_per_order, is_active, is_refundable
  ) VALUES (
    sample_event_id, 'synthetic-general-admission', 'Synthetic General Admission',
    'Test-only inventory for a Stripe test-mode purchase-to-door rehearsal.',
    1200, 'usd', 12, 4, true, true
  );
END $synthetic_first_event$;
