-- LOCAL REVIEW ONLY. Requires promotion-quotes.draft.sql; not a migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX ticket_promotions_event_code_cursor_idx ON public.ticket_promotions(event_id,code COLLATE "C");
CREATE FUNCTION public.read_organizer_promotions(p_actor uuid,p_event uuid,p_after_code text DEFAULT NULL)
RETURNS TABLE(outcome text,payload jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_rows jsonb; v_tiers jsonb; v_next text;
BEGIN
  PERFORM 1 FROM public.event_memberships m WHERE m.event_id=p_event AND m.user_id=p_actor
    AND m.role IN ('organizer','admin') FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF p_after_code IS NOT NULL AND p_after_code !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'currency',t.currency,
    'active',t.is_active) ORDER BY t.name,t.id),'[]'::jsonb) INTO v_tiers
    FROM (SELECT id,name,currency,is_active FROM public.ticket_types WHERE event_id=p_event ORDER BY name,id LIMIT 101) t;
  IF jsonb_array_length(v_tiers)>100 THEN
    RETURN QUERY SELECT 'too_many_tiers'::text,NULL::jsonb; RETURN;
  END IF;
  WITH page AS (SELECT p.* FROM public.ticket_promotions p WHERE p.event_id=p_event
      AND (p_after_code IS NULL OR p.code COLLATE "C">p_after_code COLLATE "C") ORDER BY p.code COLLATE "C" LIMIT 51),
    shown AS (SELECT * FROM page ORDER BY code COLLATE "C" LIMIT 50)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'eventId',p.event_id,
    'ticketTypeId',p.ticket_type_id,'code',p.code,'version',p.version,'enabled',p.enabled,
    'startsAt',p.starts_at,'expiresAt',p.expires_at,'kind',p.kind,'value',p.value,
    'currency',p.currency,'maxRedemptions',p.max_redemptions,
    'reserved',(SELECT count(*) FROM public.promotion_redemptions r WHERE r.promotion_id=p.id AND r.state='reserved'),
    'consumed',(SELECT count(*) FROM public.promotion_redemptions r WHERE r.promotion_id=p.id AND r.state='consumed'))
    ORDER BY p.code COLLATE "C"),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM page)>50 THEN max(p.code COLLATE "C") ELSE NULL END
    INTO v_rows,v_next FROM shown p;
  RETURN QUERY SELECT 'ready'::text,jsonb_build_object('rows',v_rows,'tiers',v_tiers,'nextAfter',v_next);
END; $$;

CREATE FUNCTION public.save_organizer_promotion(p_actor uuid,p_event uuid,p_id uuid,p_version integer,
  p_code text,p_tier uuid,p_enabled boolean,p_starts timestamptz,p_expires timestamptz,
  p_kind text,p_value integer,p_limit integer)
RETURNS TABLE(outcome text,promotion_id uuid,version integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.ticket_promotions%ROWTYPE; v_id uuid; v_code text; v_used bigint;
BEGIN
  -- Revalidate and lock the actual membership inside the write transaction,
  -- including when access was revoked after the caller-scoped server precheck.
  PERFORM 1 FROM public.event_memberships m WHERE m.event_id=p_event AND m.user_id=p_actor
    AND m.role IN ('organizer','admin') FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::uuid,NULL::integer; RETURN; END IF;
  IF p_code IS NULL OR btrim(p_code) !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'
    OR p_enabled IS NULL OR p_starts IS NULL OR p_expires IS NULL
    OR NOT isfinite(p_starts) OR NOT isfinite(p_expires) OR p_expires<=p_starts
    OR p_kind IS NULL OR p_kind NOT IN ('fixed','percentage') OR p_value IS NULL OR p_value<1
    OR (p_kind='fixed' AND p_value>99999999) OR (p_kind='percentage' AND p_value>10000)
    OR (p_kind='percentage' AND p_value=10000 AND (p_id IS NULL OR p_enabled))
    OR (p_limit IS NOT NULL AND p_limit<1)
    OR (p_id IS NULL AND p_version IS NOT NULL) OR (p_id IS NOT NULL AND (p_version IS NULL OR p_version<1)) THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  v_code:=upper(btrim(p_code));
  -- Same tier-before-promotion order as quote reservation. Scope is immutable.
  IF p_tier IS NOT NULL THEN
    PERFORM 1 FROM public.ticket_types t WHERE t.id=p_tier AND t.event_id=p_event AND t.currency='usd' FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_scope'::text,NULL::uuid,NULL::integer; RETURN; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.ticket_promotions(event_id,ticket_type_id,code,enabled,starts_at,expires_at,kind,value,max_redemptions)
    VALUES(p_event,p_tier,v_code,p_enabled,p_starts,p_expires,p_kind,p_value,p_limit)
    ON CONFLICT(event_id,code) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN QUERY SELECT 'code_taken'::text,NULL::uuid,NULL::integer; RETURN; END IF;
    RETURN QUERY SELECT 'saved'::text,v_id,1; RETURN;
  END IF;
  SELECT * INTO p FROM public.ticket_promotions x WHERE x.id=p_id AND x.event_id=p_event FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::uuid,NULL::integer; RETURN; END IF;
  IF p.version<>p_version OR p.version=2147483647 THEN
    RETURN QUERY SELECT 'version_conflict'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  IF p.code<>v_code OR p.ticket_type_id IS DISTINCT FROM p_tier THEN
    RETURN QUERY SELECT 'immutable_scope'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  SELECT count(*) INTO v_used FROM public.promotion_redemptions r
    WHERE r.promotion_id=p.id AND r.state IN ('reserved','consumed');
  IF p_limit IS NOT NULL AND p_limit<v_used THEN
    RETURN QUERY SELECT 'limit_below_usage'::text,NULL::uuid,NULL::integer; RETURN;
  END IF;
  UPDATE public.ticket_promotions x SET version=x.version+1,enabled=p_enabled,starts_at=p_starts,
    expires_at=p_expires,kind=p_kind,value=p_value,max_redemptions=p_limit WHERE x.id=p.id;
  RETURN QUERY SELECT 'saved'::text,p.id,p.version+1;
END; $$;
REVOKE ALL ON FUNCTION public.read_organizer_promotions(uuid,uuid,text),
  public.save_organizer_promotion(uuid,uuid,uuid,integer,text,uuid,boolean,timestamptz,timestamptz,text,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_organizer_promotions(uuid,uuid,text),
  public.save_organizer_promotion(uuid,uuid,uuid,integer,text,uuid,boolean,timestamptz,timestamptz,text,integer,integer)
  TO service_role;
DO $acl$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON FUNCTION public.read_organizer_promotions(uuid,uuid,text),
      public.save_organizer_promotion(uuid,uuid,uuid,integer,text,uuid,boolean,timestamptz,timestamptz,text,integer,integer)
      FROM sandbox_exec;
  END IF;
END; $acl$;
COMMIT;
