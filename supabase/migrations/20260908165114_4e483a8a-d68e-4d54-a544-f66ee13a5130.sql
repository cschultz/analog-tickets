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