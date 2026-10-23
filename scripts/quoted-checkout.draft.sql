-- LOCAL REVIEW ONLY, after promotion-quotes.draft.sql. Not an installed migration.
-- buildQuotedCheckoutDraft appends narrowly patched baseline writer bodies.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.checkout_attempts ADD COLUMN price_quote_id uuid UNIQUE
  REFERENCES public.ticket_price_quotes(id) ON DELETE RESTRICT;
ALTER TABLE public.tickets
  ADD COLUMN price_quote_id uuid,
  ADD COLUMN price_quote_ordinal integer,
  ADD CONSTRAINT ticket_quote_pair CHECK ((price_quote_id IS NULL)=(price_quote_ordinal IS NULL)),
  ADD CONSTRAINT ticket_quote_allocation_fkey FOREIGN KEY(price_quote_id,price_quote_ordinal)
    REFERENCES public.ticket_quote_allocations(quote_id,ordinal) ON DELETE RESTRICT,
  ADD CONSTRAINT ticket_quote_one_issuance UNIQUE(price_quote_id,price_quote_ordinal);

CREATE FUNCTION public.guard_checkout_price_quote() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE; c public.guest_checkout_carts%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.price_quote_id IS DISTINCT FROM OLD.price_quote_id THEN
      RAISE EXCEPTION 'immutable_checkout_quote' USING ERRCODE='23514';
    END IF;
    RETURN NEW; -- Existing v2 guard freezes the remaining request facts.
  END IF;
  -- Serialize both quoted and legacy insertion with quote creation on this hold.
  IF NEW.reservation_id IS NOT NULL THEN
    PERFORM 1 FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  END IF;
  IF NEW.price_quote_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.ticket_price_quotes x JOIN public.guest_checkout_carts g ON g.id=x.cart_id
      WHERE g.reservation_id=NEW.reservation_id) THEN
      RAISE EXCEPTION 'quoted_checkout_required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE id=NEW.price_quote_id;
  SELECT * INTO c FROM public.guest_checkout_carts WHERE id=q.cart_id;
  IF q.id IS NULL OR c.id IS NULL OR q.owner_user_id IS DISTINCT FROM NEW.user_id
    OR q.event_id IS DISTINCT FROM NEW.event_id OR q.ticket_type_id IS DISTINCT FROM NEW.ticket_type_id
    OR q.quantity IS DISTINCT FROM NEW.quantity OR q.unit_price_cents IS DISTINCT FROM NEW.unit_price_cents
    OR q.total_cents IS DISTINCT FROM NEW.amount_cents OR q.currency IS DISTINCT FROM NEW.currency
    OR c.reservation_id IS DISTINCT FROM NEW.reservation_id OR NEW.provider<>'stripe_test'
    OR NEW.provider_request_version IS DISTINCT FROM 2 OR q.expires_at<=clock_timestamp()
    OR (SELECT count(*) FROM public.ticket_quote_allocations WHERE quote_id=q.id)<>q.quantity
    OR EXISTS(SELECT 1 FROM public.checkout_attempts a WHERE a.reservation_id=NEW.reservation_id) THEN
    RAISE EXCEPTION 'invalid_checkout_quote' USING ERRCODE='23514';
  END IF;
  IF q.promotion_id IS NOT NULL THEN
    PERFORM 1 FROM public.ticket_promotions WHERE id=q.promotion_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='reserved') THEN
      RAISE EXCEPTION 'promotion_not_reserved' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER checkout_price_quote_guard BEFORE INSERT OR UPDATE ON public.checkout_attempts
FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_price_quote();

CREATE FUNCTION public.guard_ticket_quote_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE expected uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.price_quote_id IS DISTINCT FROM OLD.price_quote_id
      OR NEW.price_quote_ordinal IS DISTINCT FROM OLD.price_quote_ordinal THEN
      RAISE EXCEPTION 'immutable_ticket_quote' USING ERRCODE='23514';
    END IF;
    RETURN NEW; -- Transfer/holder edits retain the original paid share.
  END IF;
  SELECT a.price_quote_id INTO expected FROM public.orders o
    JOIN public.checkout_attempts a ON a.id=o.checkout_attempt_id
    JOIN public.order_items oi ON oi.id=NEW.order_item_id AND oi.order_id=o.id
      AND oi.ticket_type_id=NEW.ticket_type_id
    WHERE o.id=NEW.order_id AND o.event_id=NEW.event_id
      AND a.ticket_type_id=NEW.ticket_type_id AND a.event_id=NEW.event_id
      AND a.user_id=NEW.owner_user_id;
  IF NEW.price_quote_id IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ticket_quote_not_correlated' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ticket_quote_identity BEFORE INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_quote_identity();

CREATE FUNCTION public.guard_linked_promotion_release() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.state='released' AND EXISTS(SELECT 1 FROM public.checkout_attempts a
    WHERE a.price_quote_id=NEW.quote_id AND a.status<>'abandoned') THEN
    RAISE EXCEPTION 'checkout_outcome_unresolved' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER promotion_linked_release BEFORE UPDATE ON public.promotion_redemptions
FOR EACH ROW EXECUTE FUNCTION public.guard_linked_promotion_release();

-- Single-snapshot exact paid-share reader for the trusted refund coordinator.
-- Eligibility and durable claims are still required before any provider call.
CREATE FUNCTION public.read_quoted_refund_amount(p_attempt uuid,p_ticket_ids uuid[])
RETURNS TABLE(amount_cents integer,currency text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT sum(x.paid_cents)::integer,q.currency
  FROM public.checkout_attempts a
  JOIN public.ticket_price_quotes q ON q.id=a.price_quote_id
  JOIN public.orders o ON o.checkout_attempt_id=a.id AND o.status='paid'
    AND o.user_id=a.user_id AND o.event_id=a.event_id
  JOIN public.tickets t ON t.order_id=o.id AND t.id=ANY(p_ticket_ids)
    AND t.price_quote_id=q.id AND t.event_id=a.event_id AND t.ticket_type_id=a.ticket_type_id
    AND t.status='issued' AND t.checked_in_at IS NULL AND t.refundable_at_issue
  JOIN public.ticket_quote_allocations x ON x.quote_id=q.id AND x.ordinal=t.price_quote_ordinal
  JOIN public.order_items oi ON oi.id=t.order_item_id AND oi.order_id=o.id
    AND oi.ticket_type_id=a.ticket_type_id AND oi.quantity=q.quantity AND oi.unit_price_cents=q.unit_price_cents
  WHERE a.id=p_attempt AND a.status='completed' AND a.provider='stripe_test'
    AND a.user_id=q.owner_user_id AND a.event_id=q.event_id AND a.ticket_type_id=q.ticket_type_id
    AND a.amount_cents=q.total_cents AND a.currency=q.currency AND a.quantity=q.quantity
    AND a.unit_price_cents=q.unit_price_cents AND o.total_cents=q.total_cents AND o.subtotal_cents=q.subtotal_cents
    AND o.currency=q.currency
    AND cardinality(p_ticket_ids) BETWEEN 1 AND 10
    AND NOT EXISTS(SELECT 1 FROM public.ticket_refund_items ri WHERE ri.ticket_id=ANY(p_ticket_ids))
  GROUP BY q.id,q.currency
  HAVING count(*)=cardinality(p_ticket_ids) AND count(DISTINCT t.id)=cardinality(p_ticket_ids)
    AND sum(x.paid_cents)>=0 AND sum(x.paid_cents)<=max(q.total_cents);
$$;

REVOKE ALL ON FUNCTION public.guard_checkout_price_quote(),public.guard_ticket_quote_identity(),
  public.guard_linked_promotion_release(),public.read_quoted_refund_amount(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_quoted_refund_amount(uuid,uuid[]) TO service_role;
DO $sandbox_acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.guard_checkout_price_quote(),public.guard_ticket_quote_identity(),
      public.guard_linked_promotion_release(),public.read_quoted_refund_amount(uuid,uuid[]) FROM sandbox_exec;
  END IF;
END; $sandbox_acl$;
COMMIT;
