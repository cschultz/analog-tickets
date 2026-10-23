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
