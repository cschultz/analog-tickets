-- LOCAL REVIEW ONLY, after the quote storage and quoted-checkout drafts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Change detector for buyer price review, NOT an authentication proof or price input.
CREATE FUNCTION public.ticket_price_revision(p_tier uuid,p_quantity integer,p_unit integer,p_currency text,
  p_promotion uuid,p_version integer,p_kind text,p_value integer)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT md5(concat_ws('|',p_tier::text,p_quantity::text,p_unit::text,p_currency,
    p_promotion::text,p_version::text,p_kind,p_value::text));
$$;

CREATE FUNCTION public.preview_ticket_price(p_tier uuid,p_quantity integer,p_code text)
RETURNS TABLE(outcome text,preview jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.ticket_types%ROWTYPE; p public.ticket_promotions%ROWTYPE;
  v_code text; v_now timestamptz:=clock_timestamp(); v_subtotal bigint; v_discount integer:=0;
BEGIN
  IF p_tier IS NULL OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 10
    OR (p_code IS NOT NULL AND btrim(p_code)!~'^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::jsonb; RETURN;
  END IF;
  v_code:=upper(btrim(p_code));
  SELECT * INTO t FROM public.ticket_types WHERE id=p_tier;
  IF NOT FOUND OR NOT t.is_active OR t.currency<>'usd' OR p_quantity>t.max_per_order
    OR t.quantity_total IS NULL OR t.quantity_sold+p_quantity>t.quantity_total
    OR NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=t.event_id AND e.is_published) THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::jsonb; RETURN;
  END IF;
  v_subtotal:=t.price_cents::bigint*p_quantity;
  IF v_subtotal>99999999 THEN RETURN QUERY SELECT 'not_available'::text,NULL::jsonb; RETURN; END IF;
  IF v_code IS NOT NULL THEN
    SELECT * INTO p FROM public.ticket_promotions WHERE event_id=t.event_id AND code=v_code;
    IF NOT FOUND OR NOT p.enabled OR p.starts_at>v_now
      OR p.expires_at<v_now+interval '1816 seconds'
      OR (p.ticket_type_id IS NOT NULL AND p.ticket_type_id<>t.id)
      OR (p.max_redemptions IS NOT NULL AND p.max_redemptions <=
        (SELECT count(*) FROM public.promotion_redemptions r WHERE r.promotion_id=p.id AND r.state IN ('reserved','consumed'))) THEN
      RETURN QUERY SELECT 'promotion_unavailable'::text,NULL::jsonb; RETURN;
    END IF;
    v_discount:=CASE WHEN p.kind='fixed' THEN least(p.value,v_subtotal)::integer
      ELSE (v_subtotal*p.value/10000)::integer END;
  END IF;
  IF v_subtotal-v_discount<50 THEN
    RETURN QUERY SELECT 'unsupported_paid_total'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'ready'::text,jsonb_build_object(
    'ticketTypeId',t.id,'quantity',p_quantity,'unitPriceCents',t.price_cents,
    'subtotalCents',v_subtotal,'discountCents',v_discount,'totalCents',v_subtotal-v_discount,
    'currency','usd','feeCents',0,'taxMode','not_calculated','code',v_code,
    'revision',public.ticket_price_revision(t.id,p_quantity,t.price_cents,t.currency,p.id,p.version,p.kind,p.value));
END; $$;

CREATE FUNCTION public.prepare_priced_guest_cart(p_owner uuid,p_cart uuid,p_tier uuid,p_quantity integer,
  p_name text,p_email text,p_code text,p_revision text)
RETURNS TABLE(outcome text,quote_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prepared record; priced record; q public.ticket_price_quotes%ROWTYPE;
BEGIN
  IF p_owner IS NULL OR p_revision IS NULL OR p_revision!~'^[0-9a-f]{32}$' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO prepared FROM public.prepare_guest_checkout_cart(p_owner,p_cart,p_tier,p_quantity,p_name,p_email);
  IF prepared.outcome IS DISTINCT FROM 'ready' THEN
    RETURN QUERY SELECT prepared.outcome::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO priced FROM public.reserve_ticket_price_quote(p_owner,p_cart,p_code);
  IF priced.outcome NOT IN ('ready','existing') THEN
    -- Roll back this function's cart/hold/quota effects together on a refused code.
    RAISE SQLSTATE 'P0002' USING MESSAGE=priced.outcome;
  END IF;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE id=priced.quote_id;
  IF public.ticket_price_revision(q.ticket_type_id,q.quantity,q.unit_price_cents,q.currency,
    q.promotion_id,q.promotion_version,q.promotion_kind,q.promotion_value)<>p_revision THEN
    RAISE SQLSTATE 'P0002' USING MESSAGE='review_required';
  END IF;
  RETURN QUERY SELECT 'ready'::text,q.id;
EXCEPTION WHEN SQLSTATE 'P0002' THEN
  RETURN QUERY SELECT SQLERRM::text,NULL::uuid;
END; $$;

CREATE FUNCTION public.read_priced_guest_cart(p_owner uuid,p_cart uuid)
RETURNS TABLE(snapshot jsonb,attempt_id uuid,attempt_status text,attempt_created_at timestamptz,
  provider_deadline bigint,reservation_status text,reservation_expires_at timestamptz,payment_attached boolean,release_recorded boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('version',1,'quoteId',q.id,'eventId',q.event_id,'ticketTypeId',q.ticket_type_id,
    'currency',q.currency,'quantity',q.quantity,'unitPriceCents',q.unit_price_cents,
    'subtotalCents',q.subtotal_cents,'discountCents',q.discount_cents,'totalCents',q.total_cents,
    'feeCents',q.fee_cents,'taxMode',q.tax_mode,
    'createdAtMs',floor(extract(epoch FROM q.created_at)*1000)::bigint,
    'expiresAtMs',floor(extract(epoch FROM q.expires_at)*1000)::bigint,
    'discount',CASE WHEN q.promotion_id IS NULL THEN NULL ELSE jsonb_build_object('promotionId',q.promotion_id,
      'promotionVersion',q.promotion_version,'code',q.promotion_code,'kind',q.promotion_kind,'value',q.promotion_value) END,
    'tickets',(SELECT jsonb_agg(jsonb_build_object('ordinal',x.ordinal,'subtotalCents',x.subtotal_cents,
      'discountCents',x.discount_cents,'paidCents',x.paid_cents) ORDER BY x.ordinal)
      FROM public.ticket_quote_allocations x WHERE x.quote_id=q.id)),
    a.id,a.status,a.created_at,a.provider_expires_at_seconds,h.status,h.expires_at,a.payment_intent_id IS NOT NULL,
    h.status='released' AND (a.id IS NULL OR a.status='abandoned') AND a.payment_intent_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.checkout_attempt_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM public.payment_webhook_events w WHERE w.checkout_attempt_id=a.id
      AND w.event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded'))
    AND (q.promotion_id IS NULL OR EXISTS(SELECT 1 FROM public.promotion_redemptions r WHERE r.quote_id=q.id AND r.state='released')) AND EXISTS(
      SELECT 1 FROM public.ticket_quote_expiry_records x WHERE x.quote_id=q.id AND x.cart_id=c.id
        AND x.owner_user_id=q.owner_user_id AND x.reservation_id=h.id AND x.hold_expires_at=h.expires_at
        AND x.attempt_id IS NOT DISTINCT FROM a.id AND x.recorded_at<=statement_timestamp()
        AND (x.recorded_at>=q.expires_at OR x.evidence_kind IN ('start_window_closed','request_never_sent')))
  FROM public.guest_checkout_carts c JOIN public.ticket_price_quotes q ON q.cart_id=c.id
  JOIN public.inventory_reservations h ON h.id=c.reservation_id
  LEFT JOIN public.checkout_attempts a ON a.price_quote_id=q.id
  WHERE c.id=p_cart AND c.owner_user_id=p_owner AND q.owner_user_id=p_owner AND h.owner_user_id=p_owner
    AND c.ticket_type_id=q.ticket_type_id AND c.quantity=q.quantity
    AND h.event_id=q.event_id AND h.ticket_type_id=q.ticket_type_id AND h.quantity=q.quantity
    AND (a.id IS NULL OR (a.user_id=p_owner AND a.reservation_id=h.id AND a.event_id=q.event_id
      AND a.ticket_type_id=q.ticket_type_id AND a.quantity=q.quantity AND a.unit_price_cents=q.unit_price_cents
      AND a.amount_cents=q.total_cents AND a.currency=q.currency AND a.provider='stripe_test'
      AND a.provider_request_version=2 AND a.provider_expires_at_seconds=floor(extract(epoch FROM q.expires_at))));
$$;

CREATE FUNCTION public.begin_priced_guest_payment(p_owner uuid,p_cart uuid)
RETURNS TABLE(outcome text,attempt_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.ticket_price_quotes%ROWTYPE; c public.guest_checkout_carts%ROWTYPE;
  a public.checkout_attempts%ROWTYPE; deadline bigint;
BEGIN
  IF p_owner IS NULL OR p_cart IS NULL THEN RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN; END IF;
  -- Same cart lock as quote creation. Exactly one caller owns the initial POST.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analog-promo-cart:'||p_cart::text,0));
  SELECT * INTO c FROM public.guest_checkout_carts WHERE id=p_cart AND owner_user_id=p_owner;
  SELECT * INTO q FROM public.ticket_price_quotes WHERE cart_id=c.id AND owner_user_id=p_owner;
  IF q.id IS NULL THEN RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN; END IF;
  SELECT * INTO a FROM public.checkout_attempts WHERE price_quote_id=q.id;
  IF FOUND THEN RETURN QUERY SELECT 'existing'::text,a.id; RETURN; END IF;
  deadline:=floor(extract(epoch FROM q.expires_at));
  IF deadline-ceil(extract(epoch FROM clock_timestamp())) NOT BETWEEN 1816 AND 86400 THEN
    RETURN QUERY SELECT 'not_available'::text,NULL::uuid; RETURN;
  END IF;
  INSERT INTO public.checkout_attempts(user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,
    amount_cents,currency,provider,provider_request_version,provider_expires_at_seconds,price_quote_id)
  VALUES(p_owner,c.reservation_id,q.event_id,q.ticket_type_id,q.quantity,q.unit_price_cents,q.total_cents,
    q.currency,'stripe_test',2,deadline,q.id) RETURNING * INTO a;
  RETURN QUERY SELECT 'created'::text,a.id;
END; $$;

REVOKE ALL ON FUNCTION public.ticket_price_revision(uuid,integer,integer,text,uuid,integer,text,integer),
  public.preview_ticket_price(uuid,integer,text),public.prepare_priced_guest_cart(uuid,uuid,uuid,integer,text,text,text,text),
  public.read_priced_guest_cart(uuid,uuid),public.begin_priced_guest_payment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ticket_price_revision(uuid,integer,integer,text,uuid,integer,text,integer),
  public.preview_ticket_price(uuid,integer,text),public.prepare_priced_guest_cart(uuid,uuid,uuid,integer,text,text,text,text),
  public.read_priced_guest_cart(uuid,uuid),public.begin_priced_guest_payment(uuid,uuid) TO service_role;
DO $sandbox_acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.ticket_price_revision(uuid,integer,integer,text,uuid,integer,text,integer),
      public.preview_ticket_price(uuid,integer,text),public.prepare_priced_guest_cart(uuid,uuid,uuid,integer,text,text,text,text),
      public.read_priced_guest_cart(uuid,uuid),public.begin_priced_guest_payment(uuid,uuid) FROM sandbox_exec;
  END IF;
END; $sandbox_acl$;
COMMIT;
