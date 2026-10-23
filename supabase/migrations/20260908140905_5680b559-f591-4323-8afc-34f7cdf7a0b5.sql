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