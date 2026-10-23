REVOKE ALL ON public.ticket_refunds FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ticket_refund_items FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.ticket_refunds TO service_role;
GRANT ALL ON public.ticket_refund_items TO service_role;