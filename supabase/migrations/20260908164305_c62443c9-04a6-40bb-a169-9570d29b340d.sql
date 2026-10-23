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