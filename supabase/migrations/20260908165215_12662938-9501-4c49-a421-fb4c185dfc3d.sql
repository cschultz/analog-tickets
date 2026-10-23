-- Gate 103: Supabase default privileges had already granted service_role full
-- rights at CREATE TABLE. Strip everything the intended posture forbids so the
-- audit relation is genuinely append-only.

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ticket_check_ins FROM service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ticket_pass_codes FROM service_role;

REVOKE ALL ON public.ticket_check_ins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticket_pass_codes FROM PUBLIC, anon, authenticated;