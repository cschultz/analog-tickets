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
