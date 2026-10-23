REVOKE UPDATE ON public.ticket_types FROM anon;
REVOKE UPDATE ON public.ticket_types FROM authenticated;

REVOKE UPDATE ON public.tickets FROM anon;
REVOKE UPDATE ON public.tickets FROM authenticated;
GRANT UPDATE (holder_name, holder_email) ON public.tickets TO authenticated;