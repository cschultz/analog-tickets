-- LOCAL REVIEW ONLY, after quoted-expiry.draft.sql. No deployed worker/cron.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX ticket_price_quotes_expiry_cursor_idx ON public.ticket_price_quotes(expires_at,id);
-- Distinguish an explicit legacy attempt from a quoted one without a fallback
-- projection if the release schema is absent. Server-only; no browser grants.
CREATE FUNCTION public.read_priced_expiry_target(p_attempt uuid)
RETURNS TABLE(attempt_id uuid,quote_id uuid,owner_user_id uuid,cart_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT a.id,a.price_quote_id,q.owner_user_id,q.cart_id
  FROM public.checkout_attempts a LEFT JOIN public.ticket_price_quotes q ON q.id=a.price_quote_id
  WHERE a.id=p_attempt
$$;
-- Cursor remains the exact database timestamp + quote id, not a lossy JS date.
-- A failed/unknown provider read can be retained and passed, without starving
-- later candidates in the same sweep. Each call returns at most ten rows.
CREATE FUNCTION public.list_priced_expiry_candidates(p_limit integer DEFAULT 10,
  p_after_expiry timestamptz DEFAULT NULL,p_after_quote uuid DEFAULT NULL)
RETURNS TABLE(quote_id uuid,owner_user_id uuid,cart_id uuid,expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>10
    OR (p_after_expiry IS NULL)<>(p_after_quote IS NULL)
    OR (p_after_expiry IS NOT NULL AND NOT isfinite(p_after_expiry)) THEN
    RAISE EXCEPTION 'invalid_expiry_cursor' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT q.id,q.owner_user_id,q.cart_id,q.expires_at
    FROM public.ticket_price_quotes q JOIN public.guest_checkout_carts c ON c.id=q.cart_id
    JOIN public.inventory_reservations h ON h.id=c.reservation_id
    LEFT JOIN public.checkout_attempts a ON a.price_quote_id=q.id
    WHERE q.expires_at<=statement_timestamp() AND h.status='confirmed'
      AND NOT EXISTS(SELECT 1 FROM public.ticket_quote_expiry_records x WHERE x.quote_id=q.id)
      AND (a.id IS NULL OR (a.status='pending' AND a.payment_intent_id IS NULL))
      AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.checkout_attempt_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM public.payment_webhook_events w WHERE w.checkout_attempt_id=a.id
        AND w.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded'))
      AND (p_after_expiry IS NULL OR (q.expires_at,q.id)>(p_after_expiry,p_after_quote))
    ORDER BY q.expires_at,q.id LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION public.read_priced_expiry_target(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_priced_expiry_candidates(integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_priced_expiry_target(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_priced_expiry_candidates(integer,timestamptz,uuid) TO service_role;
DO $acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.read_priced_expiry_target(uuid) FROM sandbox_exec;
    REVOKE ALL ON FUNCTION public.list_priced_expiry_candidates(integer,timestamptz,uuid) FROM sandbox_exec;
  END IF;
END; $acl$;
COMMIT;
