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