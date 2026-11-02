-- REVIEW / LOCAL TEST ONLY. Not part of the installed 51-step baseline.
-- No hosted application is authorized. No existing routines or grants are replaced.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION public.read_admin_event_workspace(p_actor uuid,p_event uuid)
RETURNS TABLE(outcome text,payload jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE e public.events%ROWTYPE;
BEGIN
  IF current_user <> 'service_role' OR p_actor IS NULL OR p_event IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.event_memberships m WHERE m.event_id=p_event AND m.user_id=p_actor AND m.role IN ('organizer','admin')
  ) THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO e FROM public.events WHERE id=p_event;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=e.timezone)
    OR EXISTS(SELECT 1 FROM public.orders WHERE event_id=p_event AND currency<>'usd')
    OR EXISTS(SELECT 1 FROM public.ticket_types WHERE event_id=p_event AND currency<>'usd')
    THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF (SELECT count(*) FROM public.ticket_types WHERE event_id=p_event)>200 THEN
    RETURN QUERY SELECT 'too_many_tiers'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'ready'::text,jsonb_build_object(
    'event',jsonb_build_object('id',e.id,'name',e.name,'slug',e.slug,'description',e.description,'venue',e.venue_name,
      'timezone',e.timezone,'startsAt',e.starts_at,'endsAt',e.ends_at,'published',e.is_published,'revision',md5(to_jsonb(e)::text)),
    'tiers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'eventId',t.event_id,'name',t.name,'slug',t.slug,
      'priceCents',t.price_cents,'capacity',t.quantity_total,'committed',t.quantity_sold,'maxPerOrder',t.max_per_order,
      'active',t.is_active,'refundable',t.is_refundable,'revision',md5(to_jsonb(t)::text)) ORDER BY t.sort_order,t.id)
      FROM public.ticket_types t WHERE t.event_id=p_event),'[]'::jsonb),
    'summary',(SELECT jsonb_build_object('paidOrders',count(*) FILTER(WHERE o.status IN ('paid','refunded')),
      'pendingOrders',count(*) FILTER(WHERE o.status='pending'),'cancelledOrders',count(*) FILTER(WHERE o.status='cancelled'),
      'originalPaidCents',coalesce(sum(o.total_cents) FILTER(WHERE o.status IN ('paid','refunded')),0))
      FROM public.orders o WHERE o.event_id=p_event),
    'attendance',(SELECT jsonb_build_object('validTickets',count(*) FILTER(WHERE t.status<>'void'),
      'voidTickets',count(*) FILTER(WHERE t.status='void'),
      'checkedIn',count(*) FILTER(WHERE t.status<>'void' AND (t.checked_in_at IS NOT NULL OR t.status='checked_in')))
      FROM public.tickets t WHERE t.event_id=p_event),
    'refunds',(SELECT jsonb_build_object('knownCents',coalesce(sum(r.amount_cents) FILTER(WHERE r.currency='usd' AND r.amount_cents IS NOT NULL),0),
      'unknownAmounts',count(*) FILTER(WHERE r.amount_cents IS NULL OR r.currency IS DISTINCT FROM 'usd'),'records',count(*))
      FROM public.ticket_refunds r WHERE r.event_id=p_event),
    'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day DESC) FROM (
      SELECT (o.created_at AT TIME ZONE e.timezone)::date::text AS day,count(*) AS orders,sum(o.total_cents) AS "originalPaidCents"
      FROM public.orders o WHERE o.event_id=p_event AND o.status IN ('paid','refunded')
      GROUP BY 1 ORDER BY 1 DESC LIMIT 90) d),'[]'::jsonb),
    'dailyDateCount',(SELECT count(DISTINCT (o.created_at AT TIME ZONE e.timezone)::date) FROM public.orders o WHERE o.event_id=p_event AND o.status IN ('paid','refunded'))
  );
END;$fn$;

CREATE FUNCTION public.save_admin_event_details(p_actor uuid,p_event uuid,p_revision text,p_values jsonb)
RETURNS TABLE(outcome text) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE e public.events%ROWTYPE; v_start timestamptz; v_end timestamptz;
BEGIN
  IF current_user<>'service_role' OR p_actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.event_memberships WHERE event_id=p_event AND user_id=p_actor AND role IN ('organizer','admin') FOR SHARE
  ) THEN RETURN QUERY SELECT 'unavailable'::text;RETURN;END IF;
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
  IF (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(p_values) k)
      IS DISTINCT FROM ARRAY['description','endsAt','name','startsAt','timezone','venue']::text[]
    OR jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'name')) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_values->'description') IS DISTINCT FROM 'string' OR length(p_values->>'description')>4000
    OR jsonb_typeof(p_values->'venue') IS DISTINCT FROM 'string' OR length(p_values->>'venue')>200
    OR jsonb_typeof(p_values->'timezone') IS DISTINCT FROM 'string'
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_values->>'timezone')
    OR jsonb_typeof(p_values->'startsAt') NOT IN ('string','null') OR jsonb_typeof(p_values->'endsAt') NOT IN ('string','null')
    THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
  BEGIN v_start:=(p_values->>'startsAt')::timestamptz;v_end:=(p_values->>'endsAt')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END;
  IF (v_start IS NOT NULL AND NOT isfinite(v_start)) OR (v_end IS NOT NULL AND NOT isfinite(v_end))
    OR (v_end IS NOT NULL AND (v_start IS NULL OR v_end<=v_start)) THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
  SELECT * INTO e FROM public.events WHERE id=p_event FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text;RETURN;END IF;
  IF p_revision IS DISTINCT FROM md5(to_jsonb(e)::text) THEN RETURN QUERY SELECT 'version_conflict'::text;RETURN;END IF;
  UPDATE public.events SET name=btrim(p_values->>'name'),description=nullif(p_values->>'description',''),
    venue_name=nullif(p_values->>'venue',''),timezone=p_values->>'timezone',starts_at=v_start,ends_at=v_end WHERE id=p_event;
  RETURN QUERY SELECT 'saved'::text;
END;$fn$;

CREATE FUNCTION public.save_admin_ticket_tier(p_actor uuid,p_event uuid,p_id uuid,p_revision text,p_values jsonb)
RETURNS TABLE(outcome text) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE t public.ticket_types%ROWTYPE; v_price integer;v_cap integer;v_max integer;v_active boolean;
BEGIN
  IF current_user<>'service_role' OR p_actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.event_memberships WHERE event_id=p_event AND user_id=p_actor AND role IN ('organizer','admin') FOR SHARE
  ) THEN RETURN QUERY SELECT 'unavailable'::text;RETURN;END IF;
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
  IF (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(p_values) k)
      IS DISTINCT FROM ARRAY['active','capacity','maxPerOrder','name','priceCents','slug']::text[]
    OR jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'name')) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_values->'slug') IS DISTINCT FROM 'string' OR p_values->>'slug' !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    OR jsonb_typeof(p_values->'active') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_values->'capacity') IS DISTINCT FROM 'number' OR p_values->>'capacity' !~ '^[0-9]{1,9}$'
    OR jsonb_typeof(p_values->'priceCents') IS DISTINCT FROM 'number' OR p_values->>'priceCents' !~ '^[0-9]{1,9}$'
    OR jsonb_typeof(p_values->'maxPerOrder') IS DISTINCT FROM 'number' OR p_values->>'maxPerOrder' !~ '^[0-9]{1,2}$'
    THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
  v_price:=(p_values->>'priceCents')::integer;v_cap:=(p_values->>'capacity')::integer;v_max:=(p_values->>'maxPerOrder')::integer;v_active:=(p_values->>'active')::boolean;
  IF v_price NOT BETWEEN 50 AND 99999999 OR v_max NOT BETWEEN 1 AND 10 OR v_cap NOT BETWEEN 0 AND 999999999
    THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
  IF p_id IS NULL THEN
    PERFORM 1 FROM public.events WHERE id=p_event FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.events WHERE id=p_event FOR KEY SHARE;
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text;RETURN;END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM public.ticket_types WHERE event_id=p_event)>=200 THEN RETURN QUERY SELECT 'too_many_tiers'::text;RETURN;END IF;
    IF p_revision IS NOT NULL THEN RETURN QUERY SELECT 'invalid_request'::text;RETURN;END IF;
    INSERT INTO public.ticket_types(event_id,slug,name,price_cents,currency,quantity_total,max_per_order,is_active)
      VALUES(p_event,p_values->>'slug',btrim(p_values->>'name'),v_price,'usd',v_cap,v_max,v_active);
  ELSE
    SELECT * INTO t FROM public.ticket_types WHERE id=p_id AND event_id=p_event FOR UPDATE;
    IF NOT FOUND OR t.currency<>'usd' THEN RETURN QUERY SELECT 'unavailable'::text;RETURN;END IF;
    IF p_revision IS DISTINCT FROM md5(to_jsonb(t)::text) THEN RETURN QUERY SELECT 'version_conflict'::text;RETURN;END IF;
    IF t.slug IS DISTINCT FROM p_values->>'slug' THEN RETURN QUERY SELECT 'immutable_slug'::text;RETURN;END IF;
    -- quantity_sold includes held stock. Never set it from the editor or double-count holds.
    IF v_cap<t.quantity_sold THEN RETURN QUERY SELECT 'capacity_below_committed'::text;RETURN;END IF;
    UPDATE public.ticket_types SET name=btrim(p_values->>'name'),price_cents=v_price,quantity_total=v_cap,
      max_per_order=v_max,is_active=v_active WHERE id=p_id AND event_id=p_event;
  END IF;
  RETURN QUERY SELECT 'saved'::text;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'slug_taken'::text;
END;$fn$;

REVOKE ALL ON FUNCTION public.read_admin_event_workspace(uuid,uuid),public.save_admin_event_details(uuid,uuid,text,jsonb),public.save_admin_ticket_tier(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_admin_event_workspace(uuid,uuid),public.save_admin_event_details(uuid,uuid,text,jsonb),public.save_admin_ticket_tier(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
