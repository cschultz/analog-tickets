-- REVIEW ONLY. Fresh synthetic database candidate, not a migration or approval to apply.
-- Do not run against a hosted project or one containing any application data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $portable_preflight$ BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'fresh Supabase Auth prerequisites are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'Supabase Data API roles are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
  ) OR EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typisdefined AND t.typcategory <> 'A'
  ) THEN
    RAISE EXCEPTION 'public schema is not empty; fresh-only candidate refused';
  END IF;
END $portable_preflight$;
-- Draft step 1/42: scripts/early-migration-foundation.draft.sql
-- Draft only: captured foundational tables required by the earliest
-- checked-in Supabase migrations. This is not a complete baseline or an
-- approved hosted migration. Never apply it to an existing project.
-- Source: docs/schema-evidence/2026-09-28-ticketing-catalog.json.
-- This is the captured later-state shape; a subsequent checked-in migration
-- already adds is_refundable with IF NOT EXISTS. No history reconciliation is
-- implied. Browser grants, policies and remaining foundational objects are
-- deliberately absent pending a full authorization/dependency review.
-- Conversely, captured tickets.refundable_at_issue and later Drizzle-added
-- checkout_attempt_id/order_item_id columns are omitted here so their source
-- migrations can add them in order. This draft is not a full catalog export.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  venue_name text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_slug_key UNIQUE (slug)
);

CREATE TABLE public.ticket_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd'::text,
  quantity_total integer,
  quantity_sold integer NOT NULL DEFAULT 0,
  max_per_order integer NOT NULL DEFAULT 10,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_refundable boolean NOT NULL DEFAULT false,
  CONSTRAINT ticket_types_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_types_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT ticket_types_event_id_slug_key UNIQUE (event_id, slug),
  CONSTRAINT ticket_types_max_per_order_check CHECK (max_per_order > 0),
  CONSTRAINT ticket_types_price_cents_check CHECK (price_cents >= 0),
  CONSTRAINT ticket_types_quantity_sold_check CHECK (quantity_sold >= 0),
  CONSTRAINT ticket_types_quantity_total_check CHECK (quantity_total IS NULL OR quantity_total >= 0)
);

-- Present in the captured foundational catalog. The later migration chain
-- neither creates nor removes this standalone event lookup index.
CREATE INDEX ticket_types_event_id_idx ON public.ticket_types (event_id);

CREATE TABLE public.inventory_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL,
  event_id uuid NOT NULL,
  ticket_type_id uuid NOT NULL,
  quantity integer NOT NULL,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_reservations_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT inventory_reservations_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES public.events(id),
  CONSTRAINT inventory_reservations_ticket_type_id_fkey FOREIGN KEY (ticket_type_id)
    REFERENCES public.ticket_types(id),
  CONSTRAINT inventory_reservations_quantity_check CHECK (quantity >= 1 AND quantity <= 10),
  CONSTRAINT inventory_reservations_status_check CHECK (
    status IN ('held', 'confirmed', 'released', 'expired', 'refunded')
  )
);

CREATE INDEX inventory_reservations_event_ticket_status_idx
  ON public.inventory_reservations (event_id, ticket_type_id, status);

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  subtotal_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd'::text,
  buyer_email text,
  buyer_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT orders_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES public.events(id) ON DELETE RESTRICT,
  CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  CONSTRAINT orders_subtotal_cents_check CHECK (subtotal_cents >= 0),
  CONSTRAINT orders_total_cents_check CHECK (total_cents >= 0)
);

CREATE INDEX orders_event_id_idx ON public.orders (event_id);
CREATE INDEX orders_user_id_idx ON public.orders (user_id);

CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  ticket_type_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_ticket_type_id_fkey FOREIGN KEY (ticket_type_id)
    REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_cents_check CHECK (unit_price_cents >= 0)
);

CREATE INDEX order_items_order_id_idx ON public.order_items (order_id);

CREATE TABLE public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  ticket_type_id uuid NOT NULL,
  event_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  holder_name text,
  holder_email text,
  status text NOT NULL DEFAULT 'issued'::text,
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id)
    REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES public.events(id) ON DELETE RESTRICT,
  CONSTRAINT tickets_owner_user_id_fkey FOREIGN KEY (owner_user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT tickets_status_check CHECK (status IN ('issued', 'checked_in', 'void'))
);

CREATE INDEX tickets_order_id_idx ON public.tickets (order_id);
CREATE INDEX tickets_owner_user_id_idx ON public.tickets (owner_user_id);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.event_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT event_memberships_event_id_user_id_key UNIQUE (event_id, user_id),
  CONSTRAINT event_memberships_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_memberships_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT event_memberships_role_check CHECK (role IN ('organizer', 'admin', 'box_office'))
);

CREATE INDEX event_memberships_user_id_event_id_idx
  ON public.event_memberships (user_id, event_id);

-- The Gate 99.1 migration adds recipient identity, OTP counters and the
-- updated_at trigger to this earlier transfer-table shape.
CREATE TABLE public.pending_ticket_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  recipient_email text,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_ticket_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT pending_ticket_transfers_ticket_id_fkey FOREIGN KEY (ticket_id)
    REFERENCES public.tickets(id) ON DELETE CASCADE,
  CONSTRAINT pending_ticket_transfers_sender_user_id_fkey FOREIGN KEY (sender_user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pending_ticket_transfers_token_hash_key UNIQUE (token_hash),
  CONSTRAINT pending_ticket_transfers_status_check
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE INDEX pending_ticket_transfers_ticket_id_idx
  ON public.pending_ticket_transfers (ticket_id);

CREATE TABLE public.transfer_otp_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  requester_user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfer_otp_codes_pkey PRIMARY KEY (id),
  CONSTRAINT transfer_otp_codes_ticket_id_fkey FOREIGN KEY (ticket_id)
    REFERENCES public.tickets(id) ON DELETE CASCADE,
  CONSTRAINT transfer_otp_codes_requester_user_id_fkey FOREIGN KEY (requester_user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX transfer_otp_codes_ticket_id_idx
  ON public.transfer_otp_codes (ticket_id);

CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ticket_types_set_updated_at BEFORE UPDATE ON public.ticket_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER inventory_reservations_set_updated_at BEFORE UPDATE ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tickets_set_updated_at BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- These four legacy inventory RPCs are present in the captured private
-- backend but absent from every checked-in migration. Later owner-bound
-- reservation drafts add a separate API; these definitions do not confer
-- owner identity and must not be used to link a pilot checkout.
CREATE OR REPLACE FUNCTION public.confirm_ticket_inventory(p_idempotency_key uuid)
 RETURNS TABLE(outcome text, reservation_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_reservation public.inventory_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM public.inventory_reservations WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_reservation'::text,NULL::uuid; RETURN; END IF;
  IF v_reservation.status='confirmed' THEN RETURN QUERY SELECT 'idempotent_replay'::text,v_reservation.id; RETURN; END IF;
  IF v_reservation.status<>'held' THEN RETURN QUERY SELECT 'not_confirmable'::text,v_reservation.id; RETURN; END IF;
  UPDATE public.inventory_reservations SET status='confirmed' WHERE id=v_reservation.id;
  RETURN QUERY SELECT 'confirmed'::text,v_reservation.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.expire_ticket_inventory()
 RETURNS TABLE(outcome text, reservation_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_reservation public.inventory_reservations%ROWTYPE;
  v_released_count integer := 0;
BEGIN
  FOR v_reservation IN
    SELECT *
    FROM public.inventory_reservations
    WHERE status = 'held'
      AND expires_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ticket_types
      SET quantity_sold = quantity_sold - v_reservation.quantity
      WHERE id = v_reservation.ticket_type_id
        AND quantity_sold >= v_reservation.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory_counter_invariant_violation';
    END IF;

    UPDATE public.inventory_reservations
      SET status = 'expired',
          released_at = now(),
          updated_at = now()
      WHERE id = v_reservation.id
        AND status = 'held';

    IF FOUND THEN
      v_released_count := v_released_count + 1;
      RETURN QUERY SELECT 'expired'::text, v_reservation.id;
    END IF;
  END LOOP;

  IF v_released_count = 0 THEN
    RETURN QUERY SELECT 'none_due'::text, NULL::uuid;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_ticket_inventory(p_idempotency_key uuid, p_reason text)
 RETURNS TABLE(outcome text, reservation_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_reservation public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_reason NOT IN ('expired','released','refunded') THEN RETURN QUERY SELECT 'invalid_release_reason'::text,NULL::uuid; RETURN; END IF;
  SELECT * INTO v_reservation FROM public.inventory_reservations WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_reservation'::text,NULL::uuid; RETURN; END IF;
  IF v_reservation.status<>'held' THEN RETURN QUERY SELECT 'not_releasable'::text,v_reservation.id; RETURN; END IF;
  UPDATE public.ticket_types SET quantity_sold=quantity_sold-v_reservation.quantity WHERE id=v_reservation.ticket_type_id AND quantity_sold>=v_reservation.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status=p_reason,released_at=now() WHERE id=v_reservation.id;
  RETURN QUERY SELECT 'released'::text,v_reservation.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.reserve_ticket_inventory(p_event_id uuid, p_slug text, p_quantity integer, p_idempotency_key uuid, p_expires_at timestamp with time zone)
 RETURNS TABLE(outcome text, reservation_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_ticket public.ticket_types%ROWTYPE; v_reservation public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_quantity NOT BETWEEN 1 AND 10 OR p_expires_at <= now() THEN RETURN QUERY SELECT 'invalid_quantity_or_expiry'::text,NULL::uuid; RETURN; END IF;
  SELECT * INTO v_reservation FROM public.inventory_reservations WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_reservation.status IN ('held','confirmed') THEN RETURN QUERY SELECT 'idempotent_replay'::text,v_reservation.id;
    ELSE RETURN QUERY SELECT 'idempotency_key_closed'::text,v_reservation.id; END IF;
    RETURN;
  END IF;
  SELECT * INTO v_ticket FROM public.ticket_types WHERE event_id=p_event_id AND slug=p_slug FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_ticket_type'::text,NULL::uuid; RETURN; END IF;
  IF NOT v_ticket.is_active THEN RETURN QUERY SELECT 'inactive'::text,NULL::uuid; RETURN; END IF;
  IF v_ticket.quantity_total IS NULL THEN RETURN QUERY SELECT 'unbounded_capacity'::text,NULL::uuid; RETURN; END IF;
  IF v_ticket.quantity_sold+p_quantity>v_ticket.quantity_total THEN RETURN QUERY SELECT 'over_capacity'::text,NULL::uuid; RETURN; END IF;
  UPDATE public.ticket_types SET quantity_sold=quantity_sold+p_quantity WHERE id=v_ticket.id;
  INSERT INTO public.inventory_reservations(idempotency_key,event_id,ticket_type_id,quantity,status,expires_at) VALUES(p_idempotency_key,p_event_id,v_ticket.id,p_quantity,'held',p_expires_at) RETURNING * INTO v_reservation;
  RETURN QUERY SELECT 'reserved'::text,v_reservation.id;
END; $function$;

REVOKE ALL ON FUNCTION public.confirm_ticket_inventory(uuid),
  public.expire_ticket_inventory(), public.release_ticket_inventory(uuid,text),
  public.reserve_ticket_inventory(uuid,text,integer,uuid,timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_inventory(uuid),
  public.expire_ticket_inventory(), public.release_ticket_inventory(uuid,text),
  public.reserve_ticket_inventory(uuid,text,integer,uuid,timestamptz)
TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_ticket_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_otp_codes ENABLE ROW LEVEL SECURITY;

-- Browser grants and policies require a separate, exact authorization review.
-- These RLS-enabled tables are intentionally inaccessible to browser roles
-- when this draft is run alone. The original hosted schema has broader grants.

-- Draft step 2/42: supabase/migrations/20260831231835_0883e17b-45b0-4e81-a48b-25baee5c39fe.sql
CREATE TABLE public.checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 10),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  provider text NOT NULL DEFAULT 'stripe_test',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','abandoned','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.checkout_attempts TO service_role;
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX checkout_attempts_user_idx ON public.checkout_attempts (user_id, created_at DESC);

CREATE TRIGGER checkout_attempts_set_updated_at
  BEFORE UPDATE ON public.checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe_test',
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  failure_category text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_external_event_id_key UNIQUE (external_event_id)
);

GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER payment_webhook_events_set_updated_at
  BEFORE UPDATE ON public.payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Draft step 3/42: supabase/migrations/20260906153132_b49f7753-3c72-4690-bc1f-84dbf339c423.sql
ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.inventory_reservations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.abandon_expired_checkout_attempt(p_attempt_id uuid)
RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt FROM public.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, 0; RETURN;
  END IF;

  IF v_attempt.status = 'abandoned' THEN
    RETURN QUERY SELECT 'idempotent_replay'::text, 0; RETURN;
  END IF;

  IF v_attempt.status <> 'pending' THEN
    RETURN QUERY SELECT 'not_abandonable'::text, 0; RETURN;
  END IF;

  UPDATE public.checkout_attempts
    SET status = 'abandoned', updated_at = now()
    WHERE id = v_attempt.id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_abandonable'::text, 0; RETURN;
  END IF;

  IF v_attempt.reservation_id IS NULL THEN
    RETURN QUERY SELECT 'abandoned'::text, 0; RETURN;
  END IF;

  SELECT * INTO v_reservation
    FROM public.inventory_reservations
    WHERE id = v_attempt.reservation_id
    FOR UPDATE;

  IF NOT FOUND OR v_reservation.status <> 'confirmed' THEN
    RETURN QUERY SELECT 'abandoned'::text, 0; RETURN;
  END IF;

  IF v_reservation.ticket_type_id <> v_attempt.ticket_type_id
     OR v_reservation.event_id <> v_attempt.event_id THEN
    RETURN QUERY SELECT 'abandoned'::text, 0; RETURN;
  END IF;

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_reservation.quantity
    WHERE id = v_reservation.ticket_type_id
      AND quantity_sold >= v_reservation.quantity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  UPDATE public.inventory_reservations
    SET status = 'released', released_at = now()
    WHERE id = v_reservation.id AND status = 'confirmed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'abandoned_released'::text, 1;
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_expired_checkout_attempt(uuid) TO service_role;

-- Draft step 4/42: supabase/migrations/20260906170415_7d4626b3-524a-4616-a1a9-e3b777cf0f7d.sql
CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_one_active_reservation
  ON public.checkout_attempts (reservation_id)
  WHERE reservation_id IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS checkout_attempts_reservation_id_idx
  ON public.checkout_attempts (reservation_id)
  WHERE reservation_id IS NOT NULL;

-- Draft step 5/42: supabase/migrations/20260906172206_a89c451f-32f6-479e-96a6-67c8831bf9d8.sql
CREATE OR REPLACE FUNCTION public.finalize_paid_checkout_attempt(p_attempt_id uuid)
 RETURNS TABLE(outcome text, order_id uuid, tickets_issued integer)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_order_id uuid;
  v_issued integer := 0;
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
    RETURN QUERY SELECT 'not_finalizable'::text, NULL::uuid, 0; RETURN;
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

  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
  VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents);

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued'
  FROM generate_series(1, v_attempt.quantity);
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

REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_checkout_attempt(uuid) TO service_role;

-- Draft step 6/42: supabase/migrations/20260906172251_59bfce62-4205-4931-900f-e17dcea5fe29.sql
CREATE OR REPLACE FUNCTION public.finalize_paid_checkout_attempt(p_attempt_id uuid)
 RETURNS TABLE(outcome text, order_id uuid, tickets_issued integer)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_order_id uuid;
  v_issued integer := 0;
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

  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
  VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents);

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued'
  FROM generate_series(1, v_attempt.quantity);
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

REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_checkout_attempt(uuid) TO service_role;

-- Draft step 7/42: supabase/migrations/20260906182918_d2df63aa-5446-4d30-89b2-f6f51c79fe65.sql
ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS is_refundable boolean NOT NULL DEFAULT false;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS refundable_at_issue boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tickets_guard_server_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user is distinct from 'service_role' then
    new.owner_user_id       := old.owner_user_id;
    new.order_id            := old.order_id;
    new.ticket_type_id      := old.ticket_type_id;
    new.event_id            := old.event_id;
    new.status              := old.status;
    new.checked_in_at       := old.checked_in_at;
    new.refundable_at_issue := old.refundable_at_issue;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_paid_checkout_attempt(p_attempt_id uuid)
 RETURNS TABLE(outcome text, order_id uuid, tickets_issued integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.checkout_attempts%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_order_id uuid;
  v_issued integer := 0;
  v_refundable boolean := false;
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

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable
    FROM public.ticket_types t
    WHERE t.id = v_attempt.ticket_type_id;
  v_refundable := COALESCE(v_refundable, false);

  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
  VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents);

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable
  FROM generate_series(1, v_attempt.quantity);
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

REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_checkout_attempt(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_checkout_attempt(uuid) TO service_role;

-- Draft step 8/42: supabase/migrations/20260906183316_323defce-cdea-4a19-8dfd-ec8a4ab5f450.sql
REVOKE UPDATE ON public.ticket_types FROM anon;
REVOKE UPDATE ON public.ticket_types FROM authenticated;

REVOKE UPDATE ON public.tickets FROM anon;
REVOKE UPDATE ON public.tickets FROM authenticated;
GRANT UPDATE (holder_name, holder_email) ON public.tickets TO authenticated;

-- Draft step 9/42: supabase/migrations/20260906190219_0222d5c0-2795-4b73-843c-cc59d932bbc3.sql
ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS payment_intent_id text;

COMMENT ON COLUMN public.checkout_attempts.payment_intent_id IS
  'Opaque Stripe test-mode PaymentIntent id captured at signed paid finalization. Correlation only: never card, customer, email, secret, or URL data.';

CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_payment_intent_id_key
  ON public.checkout_attempts (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- Draft step 10/42: supabase/migrations/20260906213521_215ef66d-9f4d-4655-8e20-fa715073409a.sql
CREATE TABLE public.ticket_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_refund_reference text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  ticket_count integer NOT NULL CHECK (ticket_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ticket_refunds TO service_role;
ALTER TABLE public.ticket_refunds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.ticket_refunds(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ticket_refund_items TO service_role;
ALTER TABLE public.ticket_refund_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX ticket_refund_items_refund_id_idx ON public.ticket_refund_items(refund_id);

CREATE TRIGGER ticket_refunds_set_updated_at
  BEFORE UPDATE ON public.ticket_refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ticket_refunds IS 'Private staging: idempotent per-ticket reversal ledger. Opaque test-mode provider references only; no PII.';

CREATE OR REPLACE FUNCTION public.reverse_refunded_tickets(
  p_ticket_ids uuid[],
  p_payment_intent_id text,
  p_provider_refund_reference text
)
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

  SELECT count(DISTINCT order_id), count(DISTINCT ticket_type_id), count(DISTINCT event_id),
         min(order_id), min(ticket_type_id), min(event_id)
    INTO v_bad, v_found, v_matched, v_order_id, v_type_id, v_event_id
    FROM public.tickets WHERE id = ANY(v_ids);
  IF v_bad <> 1 OR v_found <> 1 OR v_matched <> 1 THEN
    RETURN QUERY SELECT 'mixed_selection'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN QUERY SELECT 'order_not_paid'::text, NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_attempt
    FROM public.checkout_attempts
    WHERE payment_intent_id = p_payment_intent_id
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

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_n
    WHERE id = v_type_id AND quantity_sold >= v_n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  INSERT INTO public.ticket_refunds(
    provider_refund_reference, payment_intent_id, order_id, event_id, ticket_type_id, ticket_count)
  VALUES (p_provider_refund_reference, p_payment_intent_id, v_order_id, v_event_id, v_type_id, v_n)
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

REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) TO service_role;

-- Draft step 11/42: supabase/migrations/20260906213537_3869eca1-554f-472a-8633-22207ee26698.sql
REVOKE ALL ON public.ticket_refunds FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ticket_refund_items FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.ticket_refunds TO service_role;
GRANT ALL ON public.ticket_refund_items TO service_role;

-- Draft step 12/42: supabase/migrations/20260906213950_739f9b26-aff2-4b63-8144-f45179b4decc.sql
CREATE OR REPLACE FUNCTION public.reverse_refunded_tickets(
  p_ticket_ids uuid[],
  p_payment_intent_id text,
  p_provider_refund_reference text
)
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
    WHERE payment_intent_id = p_payment_intent_id
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

  UPDATE public.ticket_types
    SET quantity_sold = quantity_sold - v_n
    WHERE id = v_type_id AND quantity_sold >= v_n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_counter_invariant_violation';
  END IF;

  INSERT INTO public.ticket_refunds(
    provider_refund_reference, payment_intent_id, order_id, event_id, ticket_type_id, ticket_count)
  VALUES (p_provider_refund_reference, p_payment_intent_id, v_order_id, v_event_id, v_type_id, v_n)
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

REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_refunded_tickets(uuid[], text, text) TO service_role;

-- Draft step 13/42: supabase/migrations/20260906215812_3ce145e0-a663-4012-a409-bdfde718b525.sql
CREATE TABLE public.refund_coordination_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL,
  ticket_ids uuid[] NOT NULL,
  ticket_count integer NOT NULL CHECK (ticket_count > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','provider_refunded','reversed','reconciliation_needed','failed')),
  provider_refund_reference text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.refund_coordination_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.refund_coordination_attempts TO service_role;
ALTER TABLE public.refund_coordination_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX refund_coordination_attempts_state_idx
  ON public.refund_coordination_attempts(state);

CREATE TRIGGER refund_coordination_attempts_set_updated_at
  BEFORE UPDATE ON public.refund_coordination_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.refund_coordination_attempts IS 'Private staging: server-only refund coordination ledger. Opaque test-mode references only; no PII. RLS enabled with no policies by design (service_role only).';

-- Draft step 14/42: supabase/migrations/20260908140905_5680b559-f591-4323-8afc-34f7cdf7a0b5.sql
-- Gate 99.1: private staging ticket-transfer lifecycle (server-only)

ALTER TABLE public.pending_ticket_transfers
  ADD COLUMN recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN otp_issued_count integer NOT NULL DEFAULT 0,
  ADD COLUMN otp_last_issued_at timestamp with time zone,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.pending_ticket_transfers
  ADD CONSTRAINT pending_ticket_transfers_distinct_parties_check
    CHECK (recipient_user_id <> sender_user_id),
  ADD CONSTRAINT pending_ticket_transfers_otp_count_check
    CHECK (otp_issued_count >= 0 AND otp_issued_count <= 10);

CREATE UNIQUE INDEX pending_ticket_transfers_one_pending_per_ticket
  ON public.pending_ticket_transfers (ticket_id) WHERE status = 'pending';
CREATE UNIQUE INDEX pending_ticket_transfers_one_accepted_per_ticket
  ON public.pending_ticket_transfers (ticket_id) WHERE status = 'accepted';
CREATE INDEX pending_ticket_transfers_recipient_user_id_idx
  ON public.pending_ticket_transfers (recipient_user_id);

CREATE TRIGGER pending_ticket_transfers_set_updated_at
  BEFORE UPDATE ON public.pending_ticket_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Posture (unchanged, restated): RLS on, no browser policies, no browser grants.
ALTER TABLE public.pending_ticket_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_ticket_transfers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pending_ticket_transfers TO service_role;

CREATE OR REPLACE FUNCTION public.initiate_ticket_transfer(
  p_ticket_id uuid,
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_token_hash text,
  p_expires_at timestamp with time zone
)
RETURNS TABLE(outcome text, transfer_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_ticket public.tickets%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_ticket_id IS NULL OR p_sender_user_id IS NULL OR p_recipient_user_id IS NULL
     OR p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::uuid; RETURN;
  END IF;
  IF p_recipient_user_id = p_sender_user_id THEN
    RETURN QUERY SELECT 'invalid_recipient'::text, NULL::uuid; RETURN;
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '1 hour' THEN
    RETURN QUERY SELECT 'invalid_expiry'::text, NULL::uuid; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_ticket'::text, NULL::uuid; RETURN;
  END IF;
  IF v_ticket.owner_user_id <> p_sender_user_id THEN
    RETURN QUERY SELECT 'not_owner'::text, NULL::uuid; RETURN;
  END IF;
  IF v_ticket.status <> 'issued' OR v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'ticket_not_transferable'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_refund_items i WHERE i.ticket_id = p_ticket_id) THEN
    RETURN QUERY SELECT 'ticket_not_transferable'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pending_ticket_transfers t
             WHERE t.ticket_id = p_ticket_id AND t.status = 'accepted') THEN
    RETURN QUERY SELECT 'already_transferred'::text, NULL::uuid; RETURN;
  END IF;

  -- Lapsed pending transfers no longer block a new initiation.
  UPDATE public.pending_ticket_transfers
    SET status = 'expired'
    WHERE ticket_id = p_ticket_id AND status = 'pending' AND expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.pending_ticket_transfers t
             WHERE t.ticket_id = p_ticket_id AND t.status = 'pending') THEN
    RETURN QUERY SELECT 'transfer_pending'::text, NULL::uuid; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.pending_ticket_transfers(
      ticket_id, sender_user_id, recipient_user_id, token_hash, status, expires_at)
    VALUES (p_ticket_id, p_sender_user_id, p_recipient_user_id, p_token_hash, 'pending', p_expires_at)
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN QUERY SELECT 'unknown_recipient'::text, NULL::uuid; RETURN;
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'transfer_pending'::text, NULL::uuid; RETURN;
  END;

  RETURN QUERY SELECT 'initiated'::text, v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_ticket_transfer(
  p_transfer_id uuid,
  p_recipient_user_id uuid,
  p_token_hash text
)
RETURNS TABLE(outcome text, ticket_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_transfer public.pending_ticket_transfers%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
BEGIN
  IF p_transfer_id IS NULL OR p_recipient_user_id IS NULL OR p_token_hash IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::uuid; RETURN;
  END IF;

  SELECT * INTO v_transfer FROM public.pending_ticket_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_transfer'::text, NULL::uuid; RETURN;
  END IF;
  IF v_transfer.status = 'accepted' THEN
    RETURN QUERY SELECT 'already_accepted'::text, NULL::uuid; RETURN;
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RETURN QUERY SELECT 'not_acceptable'::text, NULL::uuid; RETURN;
  END IF;
  IF v_transfer.expires_at <= now() THEN
    UPDATE public.pending_ticket_transfers SET status = 'expired' WHERE id = v_transfer.id AND status = 'pending';
    RETURN QUERY SELECT 'expired'::text, NULL::uuid; RETURN;
  END IF;
  IF v_transfer.recipient_user_id <> p_recipient_user_id THEN
    RETURN QUERY SELECT 'not_recipient'::text, NULL::uuid; RETURN;
  END IF;
  IF v_transfer.token_hash IS DISTINCT FROM p_token_hash OR v_transfer.otp_issued_count < 1 THEN
    RETURN QUERY SELECT 'token_mismatch'::text, NULL::uuid; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_transfer.ticket_id FOR UPDATE;
  IF NOT FOUND
     OR v_ticket.owner_user_id <> v_transfer.sender_user_id
     OR v_ticket.status <> 'issued'
     OR v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'ticket_not_transferable'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_refund_items i WHERE i.ticket_id = v_ticket.id) THEN
    RETURN QUERY SELECT 'ticket_not_transferable'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pending_ticket_transfers t
             WHERE t.ticket_id = v_ticket.id AND t.status = 'accepted') THEN
    RETURN QUERY SELECT 'already_transferred'::text, NULL::uuid; RETURN;
  END IF;

  -- Ownership switches exactly once. Ticket id, order linkage, ticket type,
  -- event, status, and the refundability snapshot are deliberately untouched.
  UPDATE public.tickets
    SET owner_user_id = p_recipient_user_id, holder_name = NULL, holder_email = NULL
    WHERE id = v_ticket.id
      AND owner_user_id = v_transfer.sender_user_id
      AND status = 'issued'
      AND checked_in_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_ownership_invariant_violation';
  END IF;

  UPDATE public.pending_ticket_transfers
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_transfer.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_state_invariant_violation';
  END IF;

  RETURN QUERY SELECT 'accepted'::text, v_ticket.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.initiate_ticket_transfer(uuid, uuid, uuid, text, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_ticket_transfer(uuid, uuid, uuid, text, timestamp with time zone)
  TO service_role;
REVOKE ALL ON FUNCTION public.accept_ticket_transfer(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_ticket_transfer(uuid, uuid, text)
  TO service_role;

-- Draft step 15/42: supabase/migrations/20260908164305_c62443c9-04a6-40bb-a169-9570d29b340d.sql
-- Gate 103: private staging attendance (check-in) capability.
-- Server-only. No browser policies, no browser grants, no inventory effects.

CREATE TABLE public.ticket_pass_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code_digest text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_pass_codes_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT ticket_pass_codes_digest_check CHECK (code_digest ~ '^v1:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX ticket_pass_codes_digest_key
  ON public.ticket_pass_codes (code_digest);
CREATE UNIQUE INDEX ticket_pass_codes_one_active_per_ticket
  ON public.ticket_pass_codes (ticket_id) WHERE status = 'active';
CREATE INDEX ticket_pass_codes_event_id_idx
  ON public.ticket_pass_codes (event_id);

CREATE TRIGGER ticket_pass_codes_set_updated_at
  BEFORE UPDATE ON public.ticket_pass_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ticket_pass_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_pass_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ticket_pass_codes TO service_role;

-- Append-only attendance audit. Deliberately no UPDATE/DELETE grant to anyone;
-- rows disappear only through the FK cascade when a ticket itself is removed.
CREATE TABLE public.ticket_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  pass_id uuid REFERENCES public.ticket_pass_codes(id) ON DELETE SET NULL,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome text NOT NULL DEFAULT 'accepted',
  checked_in_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_check_ins_outcome_check CHECK (outcome = 'accepted'),
  CONSTRAINT ticket_check_ins_one_per_ticket UNIQUE (ticket_id)
);

CREATE INDEX ticket_check_ins_event_id_idx ON public.ticket_check_ins (event_id);

ALTER TABLE public.ticket_check_ins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_check_ins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ticket_check_ins TO service_role;

CREATE OR REPLACE FUNCTION public.check_in_ticket(
  p_code_digest text,
  p_staff_user_id uuid
)
RETURNS TABLE(outcome text, checked_in_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_pass public.ticket_pass_codes%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_now timestamp with time zone;
BEGIN
  IF p_staff_user_id IS NULL
     OR p_code_digest IS NULL
     OR p_code_digest !~ '^v1:[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_pass_codes
    WHERE code_digest = p_code_digest AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Authorization is per-event membership only; never a claim, never client input.
  IF NOT EXISTS (
    SELECT 1 FROM public.event_memberships m
    WHERE m.event_id = v_pass.event_id
      AND m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['box_office', 'organizer', 'admin'])
  ) THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_pass.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_checked_in'::text, v_ticket.checked_in_at; RETURN;
  END IF;

  IF v_ticket.status <> 'issued'
     OR EXISTS (SELECT 1 FROM public.ticket_refund_items i WHERE i.ticket_id = v_ticket.id) THEN
    RETURN QUERY SELECT 'not_checkinable'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  v_now := now();

  UPDATE public.tickets
    SET checked_in_at = v_now
    WHERE id = v_ticket.id AND checked_in_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_in_invariant_violation';
  END IF;

  INSERT INTO public.ticket_check_ins(ticket_id, event_id, pass_id, staff_user_id, outcome, checked_in_at)
  VALUES (v_ticket.id, v_ticket.event_id, v_pass.id, p_staff_user_id, 'accepted', v_now);

  RETURN QUERY SELECT 'accepted'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;

-- Draft step 16/42: supabase/migrations/20260908165114_4e483a8a-d68e-4d54-a544-f66ee13a5130.sql
-- Gate 103 fix: the OUT column name shadowed public.tickets.checked_in_at,
-- making the conditional UPDATE ambiguous. Renamed to attended_at.

DROP FUNCTION IF EXISTS public.check_in_ticket(text, uuid);

CREATE FUNCTION public.check_in_ticket(
  p_code_digest text,
  p_staff_user_id uuid
)
RETURNS TABLE(outcome text, attended_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_pass public.ticket_pass_codes%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_now timestamp with time zone;
BEGIN
  IF p_staff_user_id IS NULL
     OR p_code_digest IS NULL
     OR p_code_digest !~ '^v1:[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_pass_codes
    WHERE code_digest = p_code_digest AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Authorization is per-event membership only; never a claim, never client input.
  IF NOT EXISTS (
    SELECT 1 FROM public.event_memberships m
    WHERE m.event_id = v_pass.event_id
      AND m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['box_office', 'organizer', 'admin'])
  ) THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_pass.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_checked_in'::text, v_ticket.checked_in_at; RETURN;
  END IF;

  IF v_ticket.status <> 'issued'
     OR EXISTS (SELECT 1 FROM public.ticket_refund_items i WHERE i.ticket_id = v_ticket.id) THEN
    RETURN QUERY SELECT 'not_checkinable'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  v_now := now();

  UPDATE public.tickets t
    SET checked_in_at = v_now
    WHERE t.id = v_ticket.id AND t.checked_in_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_in_invariant_violation';
  END IF;

  INSERT INTO public.ticket_check_ins(ticket_id, event_id, pass_id, staff_user_id, outcome, checked_in_at)
  VALUES (v_ticket.id, v_ticket.event_id, v_pass.id, p_staff_user_id, 'accepted', v_now);

  RETURN QUERY SELECT 'accepted'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;

-- Draft step 17/42: supabase/migrations/20260908165215_12662938-9501-4c49-a421-fb4c185dfc3d.sql
-- Gate 103: Supabase default privileges had already granted service_role full
-- rights at CREATE TABLE. Strip everything the intended posture forbids so the
-- audit relation is genuinely append-only.

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ticket_check_ins FROM service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ticket_pass_codes FROM service_role;

REVOKE ALL ON public.ticket_check_ins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticket_pass_codes FROM PUBLIC, anon, authenticated;

-- Draft step 18/42: supabase/migrations/20260908180145_ab0b5473-011a-4f01-9b2d-823a4de2e9eb.sql
-- Gate 105: private staging check-in reversal.
-- Additive only. Server-only posture identical to Gate 103: RLS on, no browser
-- policies, no browser grants, service_role-only execution.

/* ---------------------------------------------------------------------------
 * 1. Attendance audit gains a scan-cycle number so the ORIGINAL check-in row is
 *    preserved when a reversal is followed by a fresh check-in. The old
 *    UNIQUE (ticket_id) constraint expressed "one open check-in per ticket";
 *    that invariant now lives in (ticket_id, cycle) plus the exactly-once
 *    conditional UPDATE on public.tickets.checked_in_at.
 * ------------------------------------------------------------------------- */

ALTER TABLE public.ticket_check_ins
  ADD COLUMN cycle integer NOT NULL DEFAULT 1;

ALTER TABLE public.ticket_check_ins
  ADD CONSTRAINT ticket_check_ins_cycle_positive CHECK (cycle >= 1);

ALTER TABLE public.ticket_check_ins
  DROP CONSTRAINT ticket_check_ins_one_per_ticket;

ALTER TABLE public.ticket_check_ins
  ADD CONSTRAINT ticket_check_ins_one_per_cycle UNIQUE (ticket_id, cycle);

/* ---------------------------------------------------------------------------
 * 2. Immutable reversal audit.
 * ------------------------------------------------------------------------- */

CREATE TABLE public.ticket_check_in_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  check_in_id uuid NOT NULL REFERENCES public.ticket_check_ins(id) ON DELETE CASCADE,
  pass_id uuid REFERENCES public.ticket_pass_codes(id) ON DELETE SET NULL,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reversed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_check_in_reversals_reason_check
    CHECK (btrim(reason) <> '' AND char_length(reason) <= 500),
  CONSTRAINT ticket_check_in_reversals_one_per_check_in UNIQUE (check_in_id)
);

CREATE INDEX ticket_check_in_reversals_ticket_id_idx
  ON public.ticket_check_in_reversals (ticket_id);
CREATE INDEX ticket_check_in_reversals_event_id_idx
  ON public.ticket_check_in_reversals (event_id);

ALTER TABLE public.ticket_check_in_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_check_in_reversals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ticket_check_in_reversals TO service_role;
-- Supabase default privileges grant service_role everything at CREATE TABLE;
-- strip everything the append-only posture forbids.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.ticket_check_in_reversals FROM service_role;
REVOKE ALL ON public.ticket_check_in_reversals FROM PUBLIC, anon, authenticated;

/* ---------------------------------------------------------------------------
 * 3. Check-in routine: unchanged semantics, now stamps the scan cycle.
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.check_in_ticket(
  p_code_digest text,
  p_staff_user_id uuid
)
RETURNS TABLE(outcome text, attended_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_pass public.ticket_pass_codes%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_now timestamp with time zone;
  v_cycle integer;
BEGIN
  IF p_staff_user_id IS NULL
     OR p_code_digest IS NULL
     OR p_code_digest !~ '^v1:[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_pass_codes
    WHERE code_digest = p_code_digest AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_memberships m
    WHERE m.event_id = v_pass.event_id
      AND m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['box_office', 'organizer', 'admin'])
  ) THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_pass.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_checked_in'::text, v_ticket.checked_in_at; RETURN;
  END IF;

  IF v_ticket.status <> 'issued'
     OR EXISTS (SELECT 1 FROM public.ticket_refund_items i WHERE i.ticket_id = v_ticket.id) THEN
    RETURN QUERY SELECT 'not_checkinable'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  v_now := now();

  UPDATE public.tickets t
    SET checked_in_at = v_now
    WHERE t.id = v_ticket.id AND t.checked_in_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_in_invariant_violation';
  END IF;

  SELECT COALESCE(MAX(c.cycle), 0) + 1 INTO v_cycle
    FROM public.ticket_check_ins c WHERE c.ticket_id = v_ticket.id;

  INSERT INTO public.ticket_check_ins(
    ticket_id, event_id, pass_id, staff_user_id, outcome, checked_in_at, cycle)
  VALUES (v_ticket.id, v_ticket.event_id, v_pass.id, p_staff_user_id, 'accepted', v_now, v_cycle);

  RETURN QUERY SELECT 'accepted'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;

/* ---------------------------------------------------------------------------
 * 4. Reversal routine. Organizer/admin only — never box_office. Requires a
 *    non-empty staff-entered reason. Touches nothing but attendance.
 * ------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.reverse_ticket_check_in(
  p_code_digest text,
  p_staff_user_id uuid,
  p_reason text
)
RETURNS TABLE(outcome text, reversed_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_pass public.ticket_pass_codes%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_check_in public.ticket_check_ins%ROWTYPE;
  v_reason text;
  v_now timestamp with time zone;
BEGIN
  v_reason := btrim(COALESCE(p_reason, ''));

  IF p_staff_user_id IS NULL
     OR p_code_digest IS NULL
     OR p_code_digest !~ '^v1:[0-9a-f]{64}$'
     OR v_reason = ''
     OR char_length(v_reason) > 500 THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_pass_codes
    WHERE code_digest = p_code_digest AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Reversal is a strictly narrower authority than check-in: box_office excluded.
  IF NOT EXISTS (
    SELECT 1 FROM public.event_memberships m
    WHERE m.event_id = v_pass.event_id
      AND m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['organizer', 'admin'])
  ) THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_pass.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF v_ticket.checked_in_at IS NULL THEN
    RETURN QUERY SELECT 'not_reversible'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_check_in
    FROM public.ticket_check_ins c
    WHERE c.ticket_id = v_ticket.id
    ORDER BY c.cycle DESC
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_reversible'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ticket_check_in_reversals r WHERE r.check_in_id = v_check_in.id
  ) THEN
    RETURN QUERY SELECT 'not_reversible'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  v_now := now();

  UPDATE public.tickets t
    SET checked_in_at = NULL
    WHERE t.id = v_ticket.id AND t.checked_in_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_in_reversal_invariant_violation';
  END IF;

  INSERT INTO public.ticket_check_in_reversals(
    ticket_id, event_id, check_in_id, pass_id, staff_user_id, reason, reversed_at)
  VALUES (v_ticket.id, v_ticket.event_id, v_check_in.id, v_pass.id,
          p_staff_user_id, v_reason, v_now);

  RETURN QUERY SELECT 'reversed'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_ticket_check_in(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_ticket_check_in(text, uuid, text) TO service_role;

-- Draft step 19/42: supabase/migrations/20260925185905_guard_settled_checkout_reservations.sql
-- Draft only. A reservation may have any number of failed retries, but only
-- one attempt that is pending or has settled. Keeping completed and abandoned
-- rows in the uniqueness predicate closes the interval after finalization or
-- abandonment removes a row from the older pending-only partial index.
--
-- An existing reservation with multiple non-failed attempts makes this
-- migration fail without changing data. Review such rows explicitly before
-- any authorized application; do not automatically delete/repoint attempts.
CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_one_nonfailed_reservation
  ON public.checkout_attempts (reservation_id)
  WHERE reservation_id IS NOT NULL
    AND status IN ('pending', 'completed', 'abandoned');

-- Draft step 20/42: supabase/migrations/20260930043250_pilot_single_event_door_guard.sql
-- Pilot-only single-event door guard. Draft source; do not apply to a hosted DB.
-- A multi-event operator requires a separate explicit event context design.
-- SECURITY INVOKER and service_role-only RPC posture are preserved.

CREATE OR REPLACE FUNCTION public.check_in_ticket(
  p_code_digest text,
  p_staff_user_id uuid
)
RETURNS TABLE(outcome text, attended_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_pass public.ticket_pass_codes%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_now timestamp with time zone;
  v_cycle integer;
  v_staff_events uuid[];
BEGIN
  IF p_staff_user_id IS NULL
     OR p_code_digest IS NULL
     OR p_code_digest !~ '^v1:[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_pass_codes
    WHERE code_digest = p_code_digest AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Capture the sole eligible event in one statement, then compare it to the
  -- scanned pass. A concurrent second membership cannot turn a pass for a
  -- different event into an accepted scan after this event is selected.
  SELECT array_agg(DISTINCT m.event_id) INTO v_staff_events
    FROM public.event_memberships m
    WHERE m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['box_office', 'organizer', 'admin']);
  IF COALESCE(cardinality(v_staff_events), 0) <> 1
     OR v_staff_events[1] IS DISTINCT FROM v_pass.event_id THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_pass.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Serialize membership writes after taking the ticket lock. This also
  -- protects against a newly inserted second-event membership, which a row
  -- lock on existing eligible memberships cannot cover.
  LOCK TABLE public.event_memberships IN SHARE MODE;

  -- Keep the pass invalidation hardening already present in the reviewed
  -- source proposal: a revocation while waiting for the ticket lock denies.
  SELECT * INTO v_pass FROM public.ticket_pass_codes
    WHERE id = v_pass.id AND ticket_id = v_ticket.id
      AND event_id = v_ticket.event_id
      AND code_digest = p_code_digest AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Re-read after the ticket and membership-lock waits. In READ COMMITTED,
  -- the table lock waits for earlier writers before this fresh statement.
  SELECT array_agg(DISTINCT eligible.event_id) INTO v_staff_events
    FROM (
      SELECT m.event_id
        FROM public.event_memberships m
        WHERE m.user_id = p_staff_user_id
          AND m.role = ANY (ARRAY['box_office', 'organizer', 'admin'])
        FOR SHARE
    ) eligible;
  IF COALESCE(cardinality(v_staff_events), 0) <> 1
     OR v_staff_events[1] IS DISTINCT FROM v_ticket.event_id THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_checked_in'::text, v_ticket.checked_in_at; RETURN;
  END IF;

  IF v_ticket.status <> 'issued'
     OR EXISTS (SELECT 1 FROM public.ticket_refund_items i WHERE i.ticket_id = v_ticket.id) THEN
    RETURN QUERY SELECT 'not_checkinable'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  v_now := now();

  UPDATE public.tickets t
    SET checked_in_at = v_now
    WHERE t.id = v_ticket.id AND t.checked_in_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_in_invariant_violation';
  END IF;

  SELECT COALESCE(MAX(c.cycle), 0) + 1 INTO v_cycle
    FROM public.ticket_check_ins c WHERE c.ticket_id = v_ticket.id;

  INSERT INTO public.ticket_check_ins(
    ticket_id, event_id, pass_id, staff_user_id, outcome, checked_in_at, cycle)
  VALUES (v_ticket.id, v_ticket.event_id, v_pass.id, p_staff_user_id, 'accepted', v_now, v_cycle);

  RETURN QUERY SELECT 'accepted'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;

-- Draft step 21/42: supabase/migrations/20260930083016_reversal_postlock_revalidation.sql
-- Draft source only. Revalidate the opaque pass and organizer/admin authority
-- after a ticket-lock wait; do not apply to a hosted database without review.
CREATE OR REPLACE FUNCTION public.reverse_ticket_check_in(
  p_code_digest text,
  p_staff_user_id uuid,
  p_reason text
)
RETURNS TABLE(outcome text, reversed_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_pass public.ticket_pass_codes%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_check_in public.ticket_check_ins%ROWTYPE;
  v_membership_id uuid;
  v_reason text;
  v_now timestamp with time zone;
BEGIN
  v_reason := btrim(COALESCE(p_reason, ''));

  IF p_staff_user_id IS NULL
     OR p_code_digest IS NULL
     OR p_code_digest !~ '^v1:[0-9a-f]{64}$'
     OR v_reason = ''
     OR char_length(v_reason) > 500 THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_pass_codes
    WHERE code_digest = p_code_digest AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Early denial avoids waiting on tickets for obviously unauthorized staff.
  IF NOT EXISTS (
    SELECT 1 FROM public.event_memberships m
    WHERE m.event_id = v_pass.event_id
      AND m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['organizer', 'admin'])
  ) THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_pass.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  -- Both facts can change while waiting for the ticket lock. Lock the current
  -- pass and one qualifying membership through the attendance mutation.
  SELECT * INTO v_pass FROM public.ticket_pass_codes
    WHERE id = v_pass.id AND ticket_id = v_ticket.id
      AND event_id = v_ticket.event_id
      AND code_digest = p_code_digest AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT m.id INTO v_membership_id FROM public.event_memberships m
    WHERE m.event_id = v_ticket.event_id
      AND m.user_id = p_staff_user_id
      AND m.role = ANY (ARRAY['organizer', 'admin'])
    ORDER BY m.id LIMIT 1 FOR SHARE;
  IF NOT FOUND OR v_membership_id IS NULL THEN
    RETURN QUERY SELECT 'not_authorized'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF v_ticket.checked_in_at IS NULL THEN
    RETURN QUERY SELECT 'not_reversible'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  SELECT * INTO v_check_in
    FROM public.ticket_check_ins c
    WHERE c.ticket_id = v_ticket.id
    ORDER BY c.cycle DESC
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_reversible'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ticket_check_in_reversals r WHERE r.check_in_id = v_check_in.id
  ) THEN
    RETURN QUERY SELECT 'not_reversible'::text, NULL::timestamp with time zone; RETURN;
  END IF;

  v_now := now();

  UPDATE public.tickets t
    SET checked_in_at = NULL
    WHERE t.id = v_ticket.id AND t.checked_in_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_in_reversal_invariant_violation';
  END IF;

  INSERT INTO public.ticket_check_in_reversals(
    ticket_id, event_id, check_in_id, pass_id, staff_user_id, reason, reversed_at)
  VALUES (v_ticket.id, v_ticket.event_id, v_check_in.id, v_pass.id,
          p_staff_user_id, v_reason, v_now);

  RETURN QUERY SELECT 'reversed'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_ticket_check_in(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_ticket_check_in(text, uuid, text) TO service_role;

-- Draft step 22/42: drizzle/migrations/0000_gate149b_line_item_refund_additive_columns.sql
-- Gate 149b — additive, backward-compatible first-class line-item refund columns.
-- Nullable columns and indexes only. No backfill, no unique constraint, no
-- writer/trigger/RLS/policy/grant/role/function change, no SECURITY DEFINER.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS order_item_id uuid NULL
    REFERENCES public.order_items(id) ON DELETE RESTRICT;

ALTER TABLE public.ticket_refunds
  ADD COLUMN IF NOT EXISTS order_item_id uuid NULL
    REFERENCES public.order_items(id) ON DELETE RESTRICT;

ALTER TABLE public.ticket_refunds
  ADD COLUMN IF NOT EXISTS amount_cents integer NULL;

ALTER TABLE public.ticket_refunds
  ADD COLUMN IF NOT EXISTS currency text NULL;

ALTER TABLE public.ticket_refunds
  ADD CONSTRAINT ticket_refunds_amount_cents_check
    CHECK (amount_cents IS NULL OR amount_cents >= 0);

ALTER TABLE public.ticket_refunds
  ADD CONSTRAINT ticket_refunds_currency_check
    CHECK (currency IS NULL OR currency ~ '^[a-z]{3}$');

CREATE INDEX IF NOT EXISTS tickets_order_item_id_idx
  ON public.tickets(order_item_id);

CREATE INDEX IF NOT EXISTS ticket_refunds_order_item_id_idx
  ON public.ticket_refunds(order_item_id);

COMMENT ON COLUMN public.tickets.order_item_id IS 'Gate 149b: nullable first-class refund line reference; NULL means not yet attributed. Server-written only.';
COMMENT ON COLUMN public.ticket_refunds.order_item_id IS 'Gate 149b: nullable first-class refund line reference; NULL means not yet attributed.';
COMMENT ON COLUMN public.ticket_refunds.amount_cents IS 'Gate 149b: nullable reversed amount, authoritative from the immutable order line.';
COMMENT ON COLUMN public.ticket_refunds.currency IS 'Gate 149b: nullable currency of the reversed amount.';

-- Draft step 23/42: drizzle/migrations/0001_gate149c_order_items_line_uniqueness.sql
-- Gate 149c (slice 148a) — additive uniqueness enforcement for first-class
-- line-item refunds: at most one order_items row per (order_id, ticket_type_id).
-- Gate 149a proved duplicate_pair_count = 0, so every existing row remains valid.
-- No backfill, no writer/trigger/RLS/policy/grant/role/function change,
-- no SECURITY DEFINER.

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_id_ticket_type_id_unique_idx
  ON public.order_items(order_id, ticket_type_id);

COMMENT ON INDEX public.order_items_order_id_ticket_type_id_unique_idx IS 'Gate 149c/148a: one order line per ticket type per order; prerequisite for the 148c order_item_id backfill.';

-- Draft step 24/42: drizzle/migrations/0002_gate149d_line_item_backfill_and_guard.sql
-- Gate 149d (slice 148c): deterministic first-class line-item backfill plus
-- immutable order-item guard. Additive only. No SECURITY DEFINER, no RLS,
-- grant, role, policy or writer changes.

-- 1. Deterministic backfill of tickets.order_item_id.
--    Relies on the Gate 149c unique invariant on
--    public.order_items(order_id, ticket_type_id): the join can match at most
--    one line, so every match is provable. Non-provable rows stay NULL.
UPDATE public.tickets t
SET order_item_id = oi.id
FROM public.order_items oi
WHERE t.order_item_id IS NULL
  AND oi.order_id = t.order_id
  AND oi.ticket_type_id = t.ticket_type_id;

-- 2. Deterministic backfill of the refund ledger line reference and money.
--    Same unique-pair proof; amount is the immutable order line price times
--    the refunded ticket count, currency from the order. Ambiguous or
--    unmatched rows stay NULL.
UPDATE public.ticket_refunds r
SET order_item_id = oi.id,
    amount_cents = COALESCE(r.amount_cents, oi.unit_price_cents * r.ticket_count),
    currency = COALESCE(r.currency, o.currency)
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE r.order_item_id IS NULL
  AND oi.order_id = r.order_id
  AND oi.ticket_type_id = r.ticket_type_id;

-- 3. Extend the existing server-field guard so a non-service_role caller can
--    never set, change or clear tickets.order_item_id. Every previously
--    frozen field keeps its existing behaviour verbatim.
CREATE OR REPLACE FUNCTION public.tickets_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if current_user is distinct from 'service_role' then
    new.owner_user_id       := old.owner_user_id;
    new.order_id            := old.order_id;
    new.ticket_type_id      := old.ticket_type_id;
    new.event_id            := old.event_id;
    new.status              := old.status;
    new.checked_in_at       := old.checked_in_at;
    new.refundable_at_issue := old.refundable_at_issue;
    new.order_item_id       := old.order_item_id;
  end if;
  return new;
end;
$$;

-- Draft step 25/42: drizzle/migrations/0003_gate149d_restore_guard_search_path.sql
-- Gate 149d follow-up: restore the explicit empty search_path on the ticket
-- server-field guard. Body unchanged; it references no relations.
CREATE OR REPLACE FUNCTION public.tickets_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
begin
  if current_user is distinct from 'service_role' then
    new.owner_user_id       := old.owner_user_id;
    new.order_id            := old.order_id;
    new.ticket_type_id      := old.ticket_type_id;
    new.event_id            := old.event_id;
    new.status              := old.status;
    new.checked_in_at       := old.checked_in_at;
    new.refundable_at_issue := old.refundable_at_issue;
    new.order_item_id       := old.order_item_id;
  end if;
  return new;
end;
$$;

-- Draft step 26/42: drizzle/migrations/0004_gate151_line_item_writers.sql
-- Gate 151 (slice 148d): first-class line-item writers.
-- Body-only CREATE OR REPLACE of two existing routines. Signatures, return
-- shapes, language, volatility, owner, security mode (INVOKER) and the empty
-- search_path are preserved verbatim. No grants, roles, RLS, policies,
-- triggers, schema or data changes.

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

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable
    FROM public.ticket_types t
    WHERE t.id = v_attempt.ticket_type_id;
  v_refundable := COALESCE(v_refundable, false);

  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency)
  RETURNING id INTO v_order_id;

  -- Authoritative line identity. The Gate 149c unique (order_id, ticket_type_id)
  -- invariant makes the line deterministic: a fresh order can only create it,
  -- and any pre-existing pair is reused rather than duplicated.
  INSERT INTO public.order_items(order_id, ticket_type_id, quantity, unit_price_cents)
  VALUES (v_order_id, v_attempt.ticket_type_id, v_attempt.quantity, v_attempt.unit_price_cents)
  ON CONFLICT (order_id, ticket_type_id) DO UPDATE
    SET quantity = excluded.quantity,
        unit_price_cents = excluded.unit_price_cents
  RETURNING id INTO v_order_item_id;

  IF v_order_item_id IS NULL THEN
    RAISE EXCEPTION 'order_line_identity_invariant_violation';
  END IF;

  -- Tickets are linked to the line at insertion, inside this same transaction,
  -- before the immutability guard (BEFORE UPDATE) can ever apply.
  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id
  FROM generate_series(1, v_attempt.quantity);
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
    WHERE payment_intent_id = p_payment_intent_id
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
  v_amount_cents := CASE WHEN v_unit_price IS NULL THEN NULL ELSE v_unit_price * v_n END;
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

-- Draft step 27/42: drizzle/migrations/0005_gate151_finalization_line_lookup.sql
-- Gate 151 correction: resolve the authoritative order line without an
-- ON CONFLICT inference, whose column list collided with the routine's own
-- OUT parameter name `order_id`. Body-only change; signature, return shape,
-- language, volatility, owner, SECURITY INVOKER mode, empty search_path and
-- grants are all preserved.
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

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable
    FROM public.ticket_types t
    WHERE t.id = v_attempt.ticket_type_id;
  v_refundable := COALESCE(v_refundable, false);

  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency)
  RETURNING id INTO v_order_id;

  -- Authoritative line identity. The Gate 149c unique
  -- (order_id, ticket_type_id) invariant makes this deterministic: at most one
  -- line can exist for the pair, so it is reused when present and created
  -- otherwise, never duplicated.
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

  -- Tickets are linked to the line at insertion, inside this same transaction,
  -- before the immutability guard (BEFORE UPDATE) can ever apply.
  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id
  FROM generate_series(1, v_attempt.quantity);
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

-- Draft step 28/42: drizzle/migrations/0006_gate165_order_checkout_attempt_link.sql
-- Gate 165 — approved canonical internal payment-correlation link.
-- Additive and backward compatible: one nullable column, one restrictive FK,
-- one uniqueness guarantee, one server-field guard, and a body-only writer
-- update. No backfill, no historical order is touched, no grant, role, policy,
-- view or client exposure changes.

-- 1. Canonical link column. Nullable: every historical order keeps NULL.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_attempt_id uuid;

-- 2. Restrictive delete behaviour: a checkout attempt that an order points at
--    can never be deleted out from under the correlation.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_checkout_attempt_id_fkey
  FOREIGN KEY (checkout_attempt_id)
  REFERENCES public.checkout_attempts(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- 3. An attempt cannot silently belong to more than one order. A partial
--    unique index leaves the many NULL historical orders unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_attempt_id_unique
  ON public.orders (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

-- 4. Server-field guard, mirroring public.tickets_guard_server_fields. A
--    non-service_role caller can never set, clear or repoint the link, on
--    INSERT or on UPDATE. Nothing else about an order is altered here.
CREATE OR REPLACE FUNCTION public.orders_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
begin
  if current_user is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      new.checkout_attempt_id := null;
    else
      new.checkout_attempt_id := old.checkout_attempt_id;
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS orders_guard_server_fields_trg ON public.orders;
CREATE TRIGGER orders_guard_server_fields_trg
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_server_fields();

-- 5. Writer: the paid-checkout finalization routine persists the creating
--    attempt id atomically with order creation. Body-only change; signature,
--    return shape, language, volatility, owner, SECURITY INVOKER mode, empty
--    search_path, grants, totals, outcomes and idempotency are all preserved.
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

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable
    FROM public.ticket_types t
    WHERE t.id = v_attempt.ticket_type_id;
  v_refundable := COALESCE(v_refundable, false);

  -- Gate 165: the creating attempt id is written in the same INSERT as the
  -- order itself, so an order and its canonical payment correlation are
  -- created atomically or not at all. Totals remain the immutable paid record.
  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency, checkout_attempt_id)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency, v_attempt.id)
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

  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id
  FROM generate_series(1, v_attempt.quantity);
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

-- Draft step 29/42: drizzle/migrations/0007_gate167_webhook_ledger_attempt_link.sql
-- Gate 167 — approved private staging webhook-ledger-to-checkout-attempt link.
-- Exactly the Gate 166 preflight candidate: one nullable column, one
-- restrictive foreign key, one NON-unique index. No backfill, no historical
-- ledger row altered, no grant, policy, role, view, trigger or exposure added.

-- 1. Correlation column. Nullable with no default: every historical ledger row
--    and every delivery without a validated internal attempt reference stays
--    NULL.
ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS checkout_attempt_id uuid;

-- 2. Restrictive behaviour: an attempt a ledger row claims can never be
--    deleted or repointed out from under the correlation.
ALTER TABLE public.payment_webhook_events
  ADD CONSTRAINT payment_webhook_events_checkout_attempt_id_fkey
  FOREIGN KEY (checkout_attempt_id)
  REFERENCES public.checkout_attempts(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- 3. Deliberately NON-unique: several deliveries (completion, expiry, retries
--    across distinct event ids) may legitimately concern one attempt. The
--    partial index skips the many NULL rows.
CREATE INDEX IF NOT EXISTS payment_webhook_events_checkout_attempt_id_idx
  ON public.payment_webhook_events (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

-- Draft step 30/42: supabase/migrations/20261001211504_refund_ticket_atomic_claims.sql
-- A coordination key identifies one exact selection, not every selection
-- containing a ticket. Persist a per-ticket claim before any provider call.
-- A collision aborts the ledger INSERT and its claims in one transaction.
CREATE TABLE public.refund_ticket_claims (
  ticket_id uuid PRIMARY KEY,
  coordination_attempt_id uuid NOT NULL
    REFERENCES public.refund_coordination_attempts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refund_ticket_claims_attempt_idx
  ON public.refund_ticket_claims(coordination_attempt_id);

-- Clear inherited/default service grants too; this append-only claim ledger
-- needs SELECT and INSERT, not UPDATE or DELETE.
REVOKE ALL ON public.refund_ticket_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.refund_ticket_claims TO service_role;
ALTER TABLE public.refund_ticket_claims ENABLE ROW LEVEL SECURITY;

-- Existing claims must be unique too. If historical attempts overlap, this
-- migration fails closed for operator reconciliation rather than picking one.
INSERT INTO public.refund_ticket_claims(ticket_id, coordination_attempt_id)
SELECT ticket_id, a.id
FROM public.refund_coordination_attempts AS a
CROSS JOIN LATERAL unnest(a.ticket_ids) AS claim(ticket_id);

CREATE FUNCTION public.claim_refund_tickets_on_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.ticket_count <> cardinality(NEW.ticket_ids) THEN
    RAISE EXCEPTION 'refund ticket claim count mismatch' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.refund_ticket_claims(ticket_id, coordination_attempt_id)
  SELECT ticket_id, NEW.id FROM unnest(NEW.ticket_ids) AS claim(ticket_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_refund_tickets_on_attempt_insert()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_tickets_on_attempt_insert()
  TO service_role;

CREATE TRIGGER refund_coordination_attempt_claim_tickets
  AFTER INSERT ON public.refund_coordination_attempts
  FOR EACH ROW EXECUTE FUNCTION public.claim_refund_tickets_on_attempt_insert();

COMMENT ON TABLE public.refund_ticket_claims IS
  'Private test-mode refund overlap guard. One durable claim per ticket, including failed and uncertain attempts; service role only.';

-- Draft step 31/42: supabase/migrations/20261005134021_minimize_browser_table_grants.sql
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

-- Draft step 32/42: drizzle/migrations/0008_refund_exact_order_attempt.sql
-- Draft only: exact order-to-attempt correlation for privileged refund reversal.
-- Historical orders without checkout_attempt_id fail closed. No schema, grants,
-- role, policy, provider, or data-row change. Do not apply without Chris review.

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
  v_amount_cents := CASE WHEN v_unit_price IS NULL THEN NULL ELSE v_unit_price * v_n END;
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

-- Draft step 33/42: scripts/reservation-owner-binding-proposal.sql
-- UNWIRED LOCAL DRAFT. Not a migration or authorization to install.
-- p_owner_user_id MUST come from server-verified authentication, never request JSON.
ALTER TABLE public.inventory_reservations
  ADD COLUMN owner_user_id uuid REFERENCES auth.users(id);

CREATE FUNCTION public.guard_reservation_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'reservation_owner_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_reservation_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reservation_owner_immutable BEFORE UPDATE OF owner_user_id
ON public.inventory_reservations FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_owner();

CREATE FUNCTION public.reserve_owned_ticket_inventory(
  p_owner_user_id uuid, p_event_id uuid, p_slug text, p_quantity integer,
  p_idempotency_key uuid, p_expires_at timestamptz
) RETURNS TABLE(outcome text, reservation_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_ticket public.ticket_types%ROWTYPE;
  v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_owner_user_id IS NULL OR p_event_id IS NULL OR p_slug IS NULL
     OR p_idempotency_key IS NULL OR p_quantity IS NULL OR p_expires_at IS NULL
     OR p_quantity NOT BETWEEN 1 AND 10 OR p_expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid; RETURN;
  END IF;
  -- Serialize this new API's same-key creations, including across different tiers.
  -- Hash collisions only reduce concurrency; ownership still uses exact UUID equality.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'analog-owned-reservation:' || p_idempotency_key::text, 0));
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    -- Legacy unowned rows cannot be retroactively claimed, even by the first caller.
    IF v_hold.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
      RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
    END IF;
    IF v_hold.event_id <> p_event_id OR v_hold.quantity <> p_quantity
       OR v_hold.expires_at <> p_expires_at OR NOT EXISTS (
         SELECT 1 FROM public.ticket_types WHERE id = v_hold.ticket_type_id
           AND event_id = p_event_id AND slug = p_slug
       ) THEN
      RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid; RETURN;
    END IF;
    IF v_hold.status NOT IN ('held','confirmed') OR v_hold.expires_at <= clock_timestamp() THEN
      RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
    END IF;
    RETURN QUERY SELECT 'idempotent_replay'::text, v_hold.id; RETURN;
  END IF;
  SELECT * INTO v_ticket FROM public.ticket_types
    WHERE event_id = p_event_id AND slug = p_slug FOR UPDATE;
  IF NOT FOUND OR NOT v_ticket.is_active OR v_ticket.quantity_total IS NULL THEN
    RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
  END IF;
  -- Recheck the deadline after the capacity lock wait.
  IF p_expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'not_available'::text, NULL::uuid; RETURN;
  END IF;
  IF p_quantity > v_ticket.max_per_order THEN
    RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid; RETURN;
  END IF;
  IF v_ticket.quantity_sold + p_quantity > v_ticket.quantity_total THEN
    RETURN QUERY SELECT 'over_capacity'::text, NULL::uuid; RETURN;
  END IF;
  UPDATE public.ticket_types SET quantity_sold = quantity_sold + p_quantity WHERE id = v_ticket.id;
  INSERT INTO public.inventory_reservations
    (idempotency_key,event_id,ticket_type_id,quantity,status,expires_at,owner_user_id)
    VALUES (p_idempotency_key,p_event_id,v_ticket.id,p_quantity,'held',p_expires_at,p_owner_user_id)
    RETURNING * INTO v_hold;
  RETURN QUERY SELECT 'reserved'::text, v_hold.id;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_owned_ticket_inventory(uuid,uuid,text,integer,uuid,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_owned_ticket_inventory(uuid,uuid,text,integer,uuid,timestamptz)
  TO service_role;

CREATE FUNCTION public.guard_checkout_reservation_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
       AND NEW.ticket_type_id IS NOT DISTINCT FROM OLD.ticket_type_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE id = NEW.reservation_id FOR UPDATE;
  IF NOT FOUND OR v_hold.owner_user_id IS NULL
     OR v_hold.owner_user_id IS DISTINCT FROM NEW.user_id
     OR v_hold.status <> 'confirmed' OR v_hold.expires_at <= clock_timestamp()
     OR v_hold.event_id <> NEW.event_id OR v_hold.ticket_type_id <> NEW.ticket_type_id
     OR v_hold.quantity <> NEW.quantity THEN
    RAISE EXCEPTION 'reservation_not_linkable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_checkout_reservation_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER checkout_reservation_owner BEFORE INSERT OR UPDATE OF
  reservation_id,user_id,event_id,ticket_type_id,quantity ON public.checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_reservation_owner();

-- Draft step 34/42: scripts/checkout-recovery-version-proposal.sql
-- Synthetic/local proposal only. Never automatically install or backfill legacy attempts.
ALTER TABLE public.checkout_attempts ADD COLUMN provider_request_version smallint
  CHECK (provider_request_version IS NULL OR provider_request_version = 1);

CREATE FUNCTION public.guard_checkout_request_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.provider_request_version IS DISTINCT FROM OLD.provider_request_version THEN
    RAISE EXCEPTION 'checkout request version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_checkout_request_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checkout_request_version() TO service_role;
CREATE TRIGGER checkout_request_version_immutable BEFORE UPDATE OF provider_request_version
  ON public.checkout_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_request_version();

-- Draft step 35/42: scripts/checkout-deadline-storage-proposal.sql
-- LOCAL SYNTHETIC DRAFT ONLY, after checkout-recovery-version-proposal.sql.
-- Not a migration runner. No default, backfill, legacy promotion, or new grants.
ALTER TABLE public.checkout_attempts
  DROP CONSTRAINT checkout_attempts_provider_request_version_check,
  ADD CONSTRAINT checkout_attempts_provider_request_version_check
    CHECK (provider_request_version IS NULL OR provider_request_version IN (1,2)),
  ADD COLUMN provider_expires_at_seconds bigint,
  ADD CONSTRAINT checkout_provider_deadline_shape CHECK (
    (COALESCE(provider_request_version,0) IN (0,1) AND provider_expires_at_seconds IS NULL)
    OR (COALESCE(provider_request_version,0)=2 AND provider_expires_at_seconds IS NOT NULL
      AND provider_expires_at_seconds > 0));

CREATE FUNCTION public.guard_checkout_provider_deadline() RETURNS trigger
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
    OR NEW.provider_expires_at_seconds <> floor(extract(epoch FROM r.expires_at))
    OR remaining < 1816 OR remaining > 86400 THEN
    RAISE EXCEPTION 'invalid provider deadline contract' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_checkout_provider_deadline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checkout_provider_deadline() TO service_role;
CREATE TRIGGER checkout_provider_deadline_guard BEFORE INSERT OR UPDATE ON public.checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_provider_deadline();

CREATE FUNCTION public.guard_linked_provider_hold_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND EXISTS (
    SELECT 1 FROM public.checkout_attempts WHERE reservation_id=OLD.id AND provider_request_version=2
  ) THEN
    RAISE EXCEPTION 'linked provider hold deadline immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_linked_provider_hold_deadline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_linked_provider_hold_deadline() TO service_role;
CREATE TRIGGER linked_provider_hold_deadline_guard BEFORE UPDATE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_linked_provider_hold_deadline();

-- Draft step 36/42: scripts/guarded-v2-expiry-release-proposal.sql
-- UNAPPLIED LOCAL DRAFT after the v2 deadline proposal. Not a migration.
-- Evidence inputs MUST come from a signature-verified exact session or a trusted
-- exact provider retrieve, never caller JSON or a discovery candidate alone.
CREATE FUNCTION public.release_expired_v2_checkout_attempt(
  p_attempt_id uuid, p_reservation_id uuid, p_owner_user_id uuid,
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_unit_price_cents integer, p_amount_cents integer, p_currency text,
  p_hold_expires_at timestamptz, p_provider_expires_at_seconds bigint,
  p_observed_expires_at_seconds bigint, p_observed_at timestamptz,
  p_observed_status text, p_observed_payment_status text, p_observed_intent_state text
) RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.checkout_attempts%ROWTYPE; r public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL OR p_reservation_id IS NULL OR p_owner_user_id IS NULL
    OR p_event_id IS NULL OR p_ticket_type_id IS NULL OR p_quantity IS NULL
    OR p_unit_price_cents IS NULL OR p_amount_cents IS NULL OR p_currency IS NULL
    OR p_hold_expires_at IS NULL OR NOT isfinite(p_hold_expires_at)
    OR p_provider_expires_at_seconds IS NULL OR p_observed_expires_at_seconds IS NULL
    OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
    OR p_quantity NOT BETWEEN 1 AND 10 OR p_unit_price_cents < 0
    OR p_amount_cents::bigint <> p_unit_price_cents::bigint*p_quantity
    OR p_currency !~ '^[a-z]{3}$' OR p_provider_expires_at_seconds <= 0
    OR p_observed_expires_at_seconds <> p_provider_expires_at_seconds
    OR p_observed_status IS DISTINCT FROM 'expired'
    OR p_observed_payment_status IS DISTINCT FROM 'unpaid'
    OR p_observed_intent_state IS DISTINCT FROM 'none' THEN
    RETURN QUERY SELECT 'invalid_evidence'::text,0; RETURN;
  END IF;
  -- Same lock order as paid finalization. Recheck clocks after lock waits.
  SELECT * INTO a FROM public.checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_attempt'::text,0; RETURN; END IF;
  IF a.provider_request_version IS DISTINCT FROM 2 OR a.provider <> 'stripe_test'
    OR a.reservation_id IS DISTINCT FROM p_reservation_id
    OR a.user_id IS DISTINCT FROM p_owner_user_id OR a.event_id IS DISTINCT FROM p_event_id
    OR a.ticket_type_id IS DISTINCT FROM p_ticket_type_id OR a.quantity IS DISTINCT FROM p_quantity
    OR a.unit_price_cents IS DISTINCT FROM p_unit_price_cents
    OR a.amount_cents IS DISTINCT FROM p_amount_cents OR a.currency IS DISTINCT FROM p_currency
    OR a.provider_expires_at_seconds IS DISTINCT FROM p_provider_expires_at_seconds THEN
    RETURN QUERY SELECT 'mismatch'::text,0; RETURN;
  END IF;
  SELECT * INTO r FROM public.inventory_reservations WHERE id=a.reservation_id FOR UPDATE;
  IF NOT FOUND OR r.owner_user_id IS DISTINCT FROM a.user_id
    OR r.event_id IS DISTINCT FROM a.event_id OR r.ticket_type_id IS DISTINCT FROM a.ticket_type_id
    OR r.quantity IS DISTINCT FROM a.quantity OR r.expires_at IS DISTINCT FROM p_hold_expires_at
    OR NOT isfinite(r.expires_at)
    OR floor(extract(epoch FROM r.expires_at)) <> a.provider_expires_at_seconds THEN
    RETURN QUERY SELECT 'mismatch'::text,0; RETURN;
  END IF;
  -- All other linked attempts protect this hold, including terminal ones. The
  -- hold lock serializes new links with the existing link/owner insert guards.
  IF EXISTS (SELECT 1 FROM public.checkout_attempts other
    WHERE other.reservation_id=r.id AND other.id <> a.id) THEN
    RETURN QUERY SELECT 'other_attempt_protected'::text,0; RETURN;
  END IF;
  -- A stored correlation or processed paid delivery protects unresolved/fulfilled
  -- payment. Atomic finalization's completed state also protects fulfillment.
  IF a.payment_intent_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.payment_webhook_events e WHERE e.checkout_attempt_id=a.id
      AND e.status='processed' AND e.event_type IN (
        'checkout.session.completed','checkout.session.async_payment_succeeded')) THEN
    RETURN QUERY SELECT 'payment_protected'::text,0; RETURN;
  END IF;
  IF a.status='abandoned' AND r.status='released' THEN
    RETURN QUERY SELECT 'idempotent_replay'::text,0; RETURN;
  END IF;
  IF a.status <> 'pending' OR r.status <> 'confirmed' THEN
    RETURN QUERY SELECT 'not_releasable'::text,0; RETURN;
  END IF;
  IF r.expires_at > clock_timestamp()
    OR a.provider_expires_at_seconds > extract(epoch FROM clock_timestamp())
    OR p_observed_at > clock_timestamp() OR p_observed_at < r.expires_at
    OR p_observed_at < clock_timestamp()-interval '5 minutes' THEN
    RETURN QUERY SELECT 'not_due_or_stale'::text,0; RETURN;
  END IF;
  UPDATE public.ticket_types SET quantity_sold=quantity_sold-r.quantity
    WHERE id=r.ticket_type_id AND quantity_sold>=r.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status='released',released_at=now(),updated_at=now()
    WHERE id=r.id AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_cleanup_invariant_violation'; END IF;
  UPDATE public.checkout_attempts SET status='abandoned',updated_at=now()
    WHERE id=a.id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_cleanup_invariant_violation'; END IF;
  RETURN QUERY SELECT 'released'::text,1;
END; $$;
REVOKE ALL ON FUNCTION public.release_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) TO service_role;

-- Close the old UUID-only v2 bypass; preserve captured legacy behavior exactly.
CREATE OR REPLACE FUNCTION public.abandon_expired_checkout_attempt(p_attempt_id uuid)
RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.checkout_attempts%ROWTYPE; r public.inventory_reservations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_attempt'::text,0; RETURN; END IF;
  IF a.provider_request_version=2 THEN
    RETURN QUERY SELECT 'not_abandonable'::text,0; RETURN;
  END IF;
  IF a.status='abandoned' THEN RETURN QUERY SELECT 'idempotent_replay'::text,0; RETURN; END IF;
  IF a.status <> 'pending' THEN RETURN QUERY SELECT 'not_abandonable'::text,0; RETURN; END IF;
  UPDATE public.checkout_attempts SET status='abandoned',updated_at=now() WHERE id=a.id AND status='pending';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_abandonable'::text,0; RETURN; END IF;
  IF a.reservation_id IS NULL THEN RETURN QUERY SELECT 'abandoned'::text,0; RETURN; END IF;
  SELECT * INTO r FROM public.inventory_reservations WHERE id=a.reservation_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'confirmed' OR r.ticket_type_id <> a.ticket_type_id
    OR r.event_id <> a.event_id THEN RETURN QUERY SELECT 'abandoned'::text,0; RETURN; END IF;
  UPDATE public.ticket_types SET quantity_sold=quantity_sold-r.quantity
    WHERE id=r.ticket_type_id AND quantity_sold>=r.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status='released',released_at=now()
    WHERE id=r.id AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  RETURN QUERY SELECT 'abandoned_released'::text,1;
END; $$;
REVOKE ALL ON FUNCTION public.abandon_expired_checkout_attempt(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_expired_checkout_attempt(uuid) TO service_role;

-- Draft step 37/42: scripts/owned-expiry-audit-proposal.sql
-- UNAPPLIED LOCAL DRAFT after guarded-v2-expiry-release-proposal.sql.
-- A recorded inventory release is NOT proof of payment failure or a webhook.
-- Trusted server callers must verify owner identity and exact fresh provider
-- evidence. No browser/table grants, provider IDs, contacts or raw payloads.
CREATE TABLE public.checkout_expiry_recoveries (
  attempt_id uuid PRIMARY KEY REFERENCES public.checkout_attempts(id),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.inventory_reservations(id),
  owner_user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  ticket_type_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents integer NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  hold_expires_at timestamptz NOT NULL CHECK (isfinite(hold_expires_at)),
  provider_expires_at_seconds bigint NOT NULL CHECK (provider_expires_at_seconds > 0),
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  evidence_contract text NOT NULL DEFAULT 'test_expired_unpaid_null_intent_v2'
    CHECK (evidence_contract='test_expired_unpaid_null_intent_v2'),
  CHECK (amount_cents::bigint=quantity::bigint*unit_price_cents),
  CHECK (floor(extract(epoch FROM hold_expires_at))=provider_expires_at_seconds),
  CHECK (observed_at>=hold_expires_at AND observed_at<=recorded_at)
);
-- PK and UNIQUE index both FK columns; there are no cascading deletions.
ALTER TABLE public.checkout_expiry_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.checkout_expiry_recoveries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON TABLE public.checkout_expiry_recoveries TO service_role;
-- The captured hosted default ACL also grants SELECT/INSERT to sandbox_exec.
-- Remove that inherited access on this new table only; do not change the role
-- or project-wide default privileges. Local fixtures may not have this role.
DO $audit_grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON TABLE public.checkout_expiry_recoveries FROM sandbox_exec;
  END IF;
END; $audit_grants$;

CREATE FUNCTION public.release_owned_expired_v2_checkout_attempt(
  p_attempt_id uuid, p_reservation_id uuid, p_owner_user_id uuid,
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_unit_price_cents integer, p_amount_cents integer, p_currency text,
  p_hold_expires_at timestamptz, p_provider_expires_at_seconds bigint,
  p_observed_expires_at_seconds bigint, p_observed_at timestamptz,
  p_observed_status text, p_observed_payment_status text, p_observed_intent_state text
) RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result record; audit public.checkout_expiry_recoveries%ROWTYPE;
BEGIN
  -- Delegate all evidence, tuple, deadline, payment protection and stock logic
  -- to the existing writer. Preserve attempt -> hold lock order. Both function
  -- calls and the audit INSERT are one SQL statement/transaction.
  SELECT * INTO STRICT result FROM public.release_expired_v2_checkout_attempt(
    p_attempt_id,p_reservation_id,p_owner_user_id,p_event_id,p_ticket_type_id,
    p_quantity,p_unit_price_cents,p_amount_cents,p_currency,p_hold_expires_at,
    p_provider_expires_at_seconds,p_observed_expires_at_seconds,p_observed_at,
    p_observed_status,p_observed_payment_status,p_observed_intent_state
  );
  IF result.outcome='released' AND result.released=1 THEN
    -- No upsert: an unexpected conflicting audit must roll back the release,
    -- never overwrite prior history or quietly claim success.
    INSERT INTO public.checkout_expiry_recoveries(
      attempt_id,reservation_id,owner_user_id,event_id,ticket_type_id,quantity,
      unit_price_cents,amount_cents,currency,hold_expires_at,
      provider_expires_at_seconds,observed_at
    ) VALUES (
      p_attempt_id,p_reservation_id,p_owner_user_id,p_event_id,p_ticket_type_id,
      p_quantity,p_unit_price_cents,p_amount_cents,p_currency,p_hold_expires_at,
      p_provider_expires_at_seconds,p_observed_at
    );
    RETURN QUERY SELECT 'release_recorded'::text,1; RETURN;
  ELSIF result.outcome='idempotent_replay' AND result.released=0 THEN
    SELECT * INTO audit FROM public.checkout_expiry_recoveries WHERE attempt_id=p_attempt_id;
    IF FOUND AND ROW(audit.reservation_id,audit.owner_user_id,audit.event_id,
      audit.ticket_type_id,audit.quantity,audit.unit_price_cents,audit.amount_cents,
      audit.currency,audit.hold_expires_at,audit.provider_expires_at_seconds)
      IS NOT DISTINCT FROM ROW(p_reservation_id,p_owner_user_id,p_event_id,
      p_ticket_type_id,p_quantity,p_unit_price_cents,p_amount_cents,p_currency,
      p_hold_expires_at,p_provider_expires_at_seconds) THEN
      RETURN QUERY SELECT 'recorded_replay'::text,0; RETURN;
    END IF;
    -- Existing unaudited/webhook release is not retroactively owner-audited.
    RETURN QUERY SELECT 'release_unrecorded'::text,0; RETURN;
  END IF;
  RETURN QUERY SELECT result.outcome::text,result.released::integer;
END; $$;
REVOKE ALL ON FUNCTION public.release_owned_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_owned_expired_v2_checkout_attempt(uuid,uuid,uuid,uuid,uuid,integer,integer,integer,text,timestamptz,bigint,bigint,timestamptz,text,text,text) TO service_role;

-- Read-only, one-snapshot historical release projection. Never payment proof.
-- Caller owner MUST be verified by the server; not accepted from browser JSON.
CREATE FUNCTION public.read_owned_expiry_release_record(
  p_reservation_id uuid, p_owner_user_id uuid
) RETURNS TABLE(outcome text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.checkout_expiry_recoveries x
    JOIN public.checkout_attempts a ON a.id=x.attempt_id
    JOIN public.inventory_reservations r ON r.id=x.reservation_id
    WHERE x.reservation_id=p_reservation_id AND x.owner_user_id=p_owner_user_id
      AND a.reservation_id=r.id AND a.user_id=p_owner_user_id
      AND r.owner_user_id=p_owner_user_id
      AND a.status='abandoned' AND r.status='released'
      AND a.provider='stripe_test' AND a.provider_request_version=2
      AND a.payment_intent_id IS NULL
      AND x.evidence_contract='test_expired_unpaid_null_intent_v2'
      AND ROW(x.event_id,x.ticket_type_id,x.quantity,x.unit_price_cents,
        x.amount_cents,x.currency,x.provider_expires_at_seconds)
        IS NOT DISTINCT FROM ROW(a.event_id,a.ticket_type_id,a.quantity,
        a.unit_price_cents,a.amount_cents,a.currency,a.provider_expires_at_seconds)
      AND ROW(r.event_id,r.ticket_type_id,r.quantity,r.expires_at)
        IS NOT DISTINCT FROM ROW(x.event_id,x.ticket_type_id,x.quantity,x.hold_expires_at)
      AND a.created_at<=x.observed_at AND x.hold_expires_at<=x.observed_at
      AND x.observed_at<=x.recorded_at AND x.recorded_at<=statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM public.checkout_attempts other
        WHERE other.reservation_id=r.id AND other.id<>a.id)
      AND NOT EXISTS (SELECT 1 FROM public.payment_webhook_events paid
        WHERE paid.checkout_attempt_id=a.id AND paid.status='processed'
        AND paid.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded'))
  ) THEN 'release_recorded'::text ELSE 'unresolved'::text END;
$$;
REVOKE ALL ON FUNCTION public.read_owned_expiry_release_record(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_owned_expiry_release_record(uuid,uuid) TO service_role;

-- Draft step 38/42: scripts/orphan-reservation-cleanup-proposal.sql
-- UNAPPLIED proposal. Not a migration. Install neither half independently.
-- Local synthetic testing only until Chris reviews and separately approves installation.

CREATE OR REPLACE FUNCTION public.guard_checkout_reservation_link()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
       AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
       AND NEW.ticket_type_id IS NOT DISTINCT FROM OLD.ticket_type_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN RETURN NEW; END IF;
  END IF;
  -- Serializes new links with exact orphan cleanup. FK key-share locking alone
  -- cannot prevent attaching to a released-but-still-existing hold.
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE id = NEW.reservation_id FOR UPDATE;
  IF NOT FOUND OR v_hold.status <> 'confirmed' OR v_hold.expires_at <= clock_timestamp()
     OR v_hold.event_id <> NEW.event_id OR v_hold.ticket_type_id <> NEW.ticket_type_id
     OR v_hold.quantity <> NEW.quantity THEN
    RAISE EXCEPTION 'reservation_not_linkable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_checkout_reservation_link() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checkout_reservation_link() TO service_role;
CREATE TRIGGER checkout_attempts_guard_reservation_link
  BEFORE INSERT OR UPDATE OF reservation_id, event_id, ticket_type_id, quantity
  ON public.checkout_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_reservation_link();

CREATE OR REPLACE FUNCTION public.release_expired_orphan_reservation(
  p_reservation_id uuid, p_idempotency_key uuid, p_event_id uuid,
  p_ticket_type_id uuid, p_quantity integer, p_expires_at timestamptz
) RETURNS TABLE(outcome text, released integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hold public.inventory_reservations%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_idempotency_key IS NULL OR p_event_id IS NULL
     OR p_ticket_type_id IS NULL OR p_quantity IS NULL OR p_expires_at IS NULL THEN
    RETURN QUERY SELECT 'invalid_request'::text, 0; RETURN;
  END IF;
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_reservation'::text, 0; RETURN; END IF;
  IF v_hold.idempotency_key <> p_idempotency_key OR v_hold.event_id <> p_event_id
     OR v_hold.ticket_type_id <> p_ticket_type_id OR v_hold.quantity <> p_quantity
     OR v_hold.expires_at <> p_expires_at THEN
    RETURN QUERY SELECT 'mismatch'::text, 0; RETURN;
  END IF;
  -- Every attempt status protects the hold, not just pending/paid.
  IF EXISTS (SELECT 1 FROM public.checkout_attempts WHERE reservation_id = v_hold.id) THEN
    RETURN QUERY SELECT 'linked_attempt'::text, 0; RETURN;
  END IF;
  IF v_hold.status = 'released' THEN
    RETURN QUERY SELECT 'already_released'::text, 0; RETURN;
  END IF;
  IF v_hold.status <> 'confirmed' THEN
    RETURN QUERY SELECT 'not_confirmed'::text, 0; RETURN;
  END IF;
  IF v_hold.expires_at > clock_timestamp() THEN RETURN QUERY SELECT 'not_due'::text, 0; RETURN; END IF;
  UPDATE public.ticket_types SET quantity_sold = quantity_sold - v_hold.quantity
    WHERE id = v_hold.ticket_type_id AND quantity_sold >= v_hold.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory_counter_invariant_violation'; END IF;
  UPDATE public.inventory_reservations SET status = 'released', released_at = now()
    WHERE id = v_hold.id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_cleanup_invariant_violation'; END IF;
  RETURN QUERY SELECT 'released'::text, 1;
END; $$;
REVOKE ALL ON FUNCTION public.release_expired_orphan_reservation(uuid,uuid,uuid,uuid,integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_orphan_reservation(uuid,uuid,uuid,uuid,integer,timestamptz)
  TO service_role;

-- Draft step 39/42: scripts/owned-reservation-preparation-proposal.sql
-- LOCAL DRAFT ONLY. Requires reservation-owner-binding-proposal.sql; not a migration.
-- Owner is supplied only by the server after verified authentication.
CREATE FUNCTION public.prepare_owned_ticket_reservation(
  p_owner_user_id uuid, p_ticket_type_id uuid, p_quantity integer, p_idempotency_key uuid
) RETURNS TABLE(outcome text, reservation_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_hold public.inventory_reservations%ROWTYPE;
  v_ticket public.ticket_types%ROWTYPE;
  v_result record;
  v_expiry timestamptz;
BEGIN
  IF p_owner_user_id IS NULL OR p_ticket_type_id IS NULL OR p_quantity IS NULL
     OR p_quantity NOT BETWEEN 1 AND 10 OR p_idempotency_key IS NULL THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'analog-owned-reservation:' || p_idempotency_key::text, 0));
  SELECT * INTO v_hold FROM public.inventory_reservations
    WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_hold.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_hold.ticket_type_id <> p_ticket_type_id OR v_hold.quantity <> p_quantity
       OR v_hold.status NOT IN ('held','confirmed') OR v_hold.expires_at <= clock_timestamp() THEN
      RETURN QUERY SELECT 'not_available'::text,NULL::uuid,NULL::timestamptz; RETURN;
    END IF;
    v_expiry := v_hold.expires_at; -- replay never extends the original deadline
  ELSE
    -- Approved source-only contract: new holds allow a matching provider expiry.
    -- Existing holds above retain their exact deadline; this is not a backfill.
    v_expiry := clock_timestamp() + interval '35 minutes';
  END IF;
  SELECT t.* INTO v_ticket FROM public.ticket_types t JOIN public.events e ON e.id=t.event_id
    WHERE t.id=p_ticket_type_id AND t.is_active AND e.is_published;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v_result FROM public.reserve_owned_ticket_inventory(
    p_owner_user_id,v_ticket.event_id,v_ticket.slug,p_quantity,p_idempotency_key,v_expiry);
  IF v_result.outcome NOT IN ('reserved','idempotent_replay') THEN
    RETURN QUERY SELECT v_result.outcome,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  -- The nested reservation routine already locks the hold. Check again after waits.
  UPDATE public.inventory_reservations r SET status='confirmed'
    WHERE r.id=v_result.reservation_id AND r.owner_user_id=p_owner_user_id
      AND r.ticket_type_id=p_ticket_type_id AND r.quantity=p_quantity
      AND r.status IN ('held','confirmed') AND r.expires_at>clock_timestamp()
      AND EXISTS (SELECT 1 FROM public.ticket_types t JOIN public.events e ON e.id=t.event_id
        WHERE t.id=p_ticket_type_id AND t.is_active AND e.is_published)
    RETURNING r.* INTO v_hold;
  IF NOT FOUND THEN
    -- Roll back the nested inventory allocation too; never commit a half-prepared hold.
    RAISE EXCEPTION 'reservation_preparation_invariant' USING ERRCODE='23514';
  END IF;
  RETURN QUERY SELECT 'ready'::text,v_hold.id,v_hold.expires_at;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_owned_ticket_reservation(uuid,uuid,integer,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_owned_ticket_reservation(uuid,uuid,integer,uuid)
  TO service_role;

-- Draft step 40/42: scripts/owner-pass-issuance-proposal.sql
-- UNAPPLIED DRAFT. Only the isolated synthetic harness may execute this proposal.
-- Requires the pass invalidation correction; not a migration or deployment.
CREATE OR REPLACE FUNCTION public.replace_owner_ticket_pass(
  p_ticket_id uuid,
  p_owner_user_id uuid,
  p_expected_active_pass_id uuid,
  p_new_code_digest text
)
RETURNS TABLE(outcome text, pass_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $proposal$
DECLARE
  v_ticket public.tickets%ROWTYPE;
  v_current_pass_id uuid;
  v_new_pass_id uuid;
BEGIN
  IF p_ticket_id IS NULL OR p_owner_user_id IS NULL
     OR p_new_code_digest IS NULL OR p_new_code_digest !~ '^v1:[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.owner_user_id <> p_owner_user_id
     OR v_ticket.status <> 'issued' OR v_ticket.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_refund_items WHERE ticket_id = v_ticket.id) THEN
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid; RETURN;
  END IF;

  -- Consistent lock order: ticket before pass, matching hardened attendance.
  SELECT id INTO v_current_pass_id FROM public.ticket_pass_codes
    WHERE ticket_id = v_ticket.id AND status = 'active' FOR UPDATE;
  IF v_current_pass_id IS DISTINCT FROM p_expected_active_pass_id THEN
    RETURN QUERY SELECT 'state_changed'::text, NULL::uuid; RETURN;
  END IF;
  -- Do not resurrect a previously revoked code or reuse another ticket's code.
  IF EXISTS (SELECT 1 FROM public.ticket_pass_codes WHERE code_digest = p_new_code_digest) THEN
    RETURN QUERY SELECT 'state_changed'::text, NULL::uuid; RETURN;
  END IF;
  UPDATE public.ticket_pass_codes SET status = 'revoked'
    WHERE ticket_id = v_ticket.id AND status = 'active';
  v_new_pass_id := gen_random_uuid();
  INSERT INTO public.ticket_pass_codes(id,ticket_id,event_id,code_digest,status)
    VALUES (v_new_pass_id,v_ticket.id,v_ticket.event_id,p_new_code_digest,'active');
  RETURN QUERY SELECT 'issued'::text, v_new_pass_id;
END;
$proposal$;
REVOKE ALL ON FUNCTION public.replace_owner_ticket_pass(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_owner_ticket_pass(uuid,uuid,uuid,text) TO service_role;

-- Draft step 41/42: scripts/pass-invalidation-proposal.mjs
-- DRAFT ONLY: apply solely in the isolated synthetic harness, not staging.
CREATE OR REPLACE FUNCTION public.revoke_ticket_passes_on_state_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $proposal$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'issued') THEN
    UPDATE public.ticket_pass_codes SET status = 'revoked'
      WHERE ticket_id = NEW.id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$proposal$;
REVOKE ALL ON FUNCTION public.revoke_ticket_passes_on_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_ticket_passes_on_state_change() TO service_role;
CREATE TRIGGER tickets_revoke_passes_on_state_change
  AFTER UPDATE OF owner_user_id, status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.revoke_ticket_passes_on_state_change();

-- Draft step 42/42: scripts/post-migration-access.draft.sql
-- Draft only. Run after the checked-in Supabase and Drizzle SQL chains in a
-- fresh synthetic local database. Not approved for any hosted database.
-- Reconstructs the 15 captured application policies from
-- docs/schema-evidence/2026-09-28-ticketing-catalog.json, while replacing
-- the observed broad browser ACLs with only the operations those policies
-- allow. This deliberate ACL tightening needs separate review and testing.

-- A Lovable remix has been observed to reset per-object ACLs to broad public
-- default grants even when the source project's explicit revocations were
-- narrower. Normalize after every source migration, not merely add grants.
REVOKE ALL ON public.checkout_attempts, public.event_memberships,
  public.events, public.inventory_reservations, public.order_items,
  public.orders, public.payment_webhook_events,
  public.pending_ticket_transfers, public.profiles,
  public.refund_coordination_attempts, public.ticket_check_in_reversals,
  public.ticket_check_ins, public.ticket_pass_codes,
  public.ticket_refund_items, public.ticket_refunds, public.ticket_types,
  public.tickets, public.transfer_otp_codes
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- The existing source SQL restricts these service tables, but a remix can
-- restore broad service grants. Reassert only the operations used by their
-- trusted call sites; maintenance privilege needs separate review.
REVOKE ALL ON public.ticket_check_in_reversals, public.ticket_check_ins,
  public.ticket_pass_codes FROM service_role;
GRANT SELECT, INSERT ON public.ticket_check_in_reversals,
  public.ticket_check_ins TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ticket_pass_codes TO service_role;

GRANT ALL ON public.events, public.ticket_types, public.inventory_reservations,
  public.orders, public.order_items, public.tickets, public.profiles,
  public.event_memberships, public.pending_ticket_transfers,
  public.transfer_otp_codes TO service_role;

GRANT SELECT ON public.events, public.ticket_types TO anon, authenticated;
GRANT SELECT ON public.event_memberships TO authenticated;
GRANT SELECT, INSERT ON public.orders, public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.tickets TO authenticated;
GRANT UPDATE (holder_name, holder_email) ON public.tickets TO authenticated;

CREATE POLICY event_memberships_select_own ON public.event_memberships
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY events_select_published ON public.events
FOR SELECT TO anon, authenticated
USING (is_published);

CREATE POLICY order_items_insert_own ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.user_id = (SELECT auth.uid())
    AND o.status = 'pending'
));

CREATE POLICY order_items_select_event_staff ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  JOIN public.event_memberships m ON m.event_id = o.event_id
  WHERE o.id = order_items.order_id
    AND m.user_id = (SELECT auth.uid())
    AND m.role IN ('organizer', 'admin')
));

CREATE POLICY order_items_select_own ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.user_id = (SELECT auth.uid())
));

CREATE POLICY orders_insert_own ON public.orders
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

CREATE POLICY orders_select_event_staff ON public.orders
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.event_memberships m
  WHERE m.event_id = orders.event_id
    AND m.user_id = (SELECT auth.uid())
    AND m.role IN ('organizer', 'admin')
));

CREATE POLICY orders_select_own ON public.orders
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY profiles_insert_own ON public.profiles
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY profiles_select_own ON public.profiles
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY ticket_types_select_active_published ON public.ticket_types
FOR SELECT TO anon, authenticated
USING (is_active AND EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = ticket_types.event_id AND e.is_published
));

CREATE POLICY tickets_select_event_staff ON public.tickets
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.event_memberships m
  WHERE m.event_id = tickets.event_id
    AND m.user_id = (SELECT auth.uid())
    AND m.role IN ('organizer', 'admin', 'box_office')
));

CREATE POLICY tickets_select_own ON public.tickets
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_user_id);

CREATE POLICY tickets_update_own_holder_fields ON public.tickets
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = owner_user_id)
WITH CHECK ((SELECT auth.uid()) = owner_user_id);

-- The function body is supplied by the checked-in refundable-ticket
-- migration. The captured guard trigger is absent from that source chain.
CREATE TRIGGER tickets_guard_server_fields BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tickets_guard_server_fields();

-- Future public objects must opt in to Data API access. Existing-object
-- revocations above do not change the defaults used by the next CREATE.
-- These defaults belong to the role running this fresh install; a different
-- migration owner must normalize its own defaults before creating objects.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
-- PostgreSQL grants function EXECUTE to PUBLIC globally by default. A
-- schema-local revoke cannot remove that global grant, so this one setting
-- intentionally covers future functions created by the install role in any
-- schema. Review that owner/scope before any hosted use of this draft.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $portable_postflight$ DECLARE
  table_count integer;
  rls_count integer;
  policy_count integer;
  trigger_count integer;
  routine_count integer;
BEGIN
  SELECT count(*)::int, count(*) FILTER (WHERE c.relrowsecurity)::int
    INTO table_count, rls_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r';
  SELECT count(*)::int INTO policy_count FROM pg_policies WHERE schemaname='public';
  SELECT count(*)::int INTO trigger_count
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal;
  SELECT count(*)::int INTO routine_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public';
  IF (table_count, rls_count, policy_count, trigger_count, routine_count)
     IS DISTINCT FROM (20, 20, 15, 22, 29) THEN
    RAISE EXCEPTION 'draft install catalog count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'browser role can execute a public routine';
  END IF;
END $portable_postflight$;
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

-- Guest step 43/45: scripts/guest-checkout-carts.draft.sql
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

-- Guest step 44/45: scripts/guest-purchase-recovery.draft.sql
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

-- Guest step 45/45: scripts/guest-purchase-account.draft.sql
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
COMMIT;
