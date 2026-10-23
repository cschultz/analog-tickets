-- Synthetic/local proposal only. Never automatically install or backfill legacy attempts.
ALTER TABLE public.checkout_attempts ADD COLUMN provider_request_version smallint
  CHECK (provider_request_version IS NULL OR provider_request_version = 1);

CREATE FUNCTION public.guard_checkout_request_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.provider_request_version IS DISTINCT FROM OLD.provider_request_version THEN
    RAISE EXCEPTION 'checkout request version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_checkout_request_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checkout_request_version() TO service_role;
CREATE TRIGGER checkout_request_version_immutable BEFORE UPDATE OF provider_request_version
  ON public.checkout_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_request_version();
