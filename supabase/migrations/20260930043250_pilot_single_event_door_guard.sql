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
