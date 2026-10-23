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
