-- Draft only. Run after the checked-in Supabase and Drizzle SQL chains in a
-- fresh synthetic local database. Not approved for any hosted database.
-- Reconstructs the 15 captured application policies from
-- docs/schema-evidence/2026-09-28-ticketing-catalog.json, while replacing
-- the observed broad browser ACLs with only the operations those policies
-- allow. This deliberate ACL tightening needs separate review and testing.

-- A Lovable remix has been observed to reset per-object ACLs to broad public
-- default grants even when the source project's explicit revocations were
-- narrower. Normalize after every source migration, not merely add grants.
REVOKE ALL ON public.checkout_attempts, public.event_memberships,
  public.events, public.inventory_reservations, public.order_items,
  public.orders, public.payment_webhook_events,
  public.pending_ticket_transfers, public.profiles,
  public.refund_coordination_attempts, public.ticket_check_in_reversals,
  public.ticket_check_ins, public.ticket_pass_codes,
  public.ticket_refund_items, public.ticket_refunds, public.ticket_types,
  public.tickets, public.transfer_otp_codes
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- The existing source SQL restricts these service tables, but a remix can
-- restore broad service grants. Reassert only the operations used by their
-- trusted call sites; maintenance privilege needs separate review.
REVOKE ALL ON public.ticket_check_in_reversals, public.ticket_check_ins,
  public.ticket_pass_codes FROM service_role;
GRANT SELECT, INSERT ON public.ticket_check_in_reversals,
  public.ticket_check_ins TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ticket_pass_codes TO service_role;

GRANT ALL ON public.events, public.ticket_types, public.inventory_reservations,
  public.orders, public.order_items, public.tickets, public.profiles,
  public.event_memberships, public.pending_ticket_transfers,
  public.transfer_otp_codes TO service_role;

GRANT SELECT ON public.events, public.ticket_types TO anon, authenticated;
GRANT SELECT ON public.event_memberships TO authenticated;
GRANT SELECT, INSERT ON public.orders, public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.tickets TO authenticated;
GRANT UPDATE (holder_name, holder_email) ON public.tickets TO authenticated;

CREATE POLICY event_memberships_select_own ON public.event_memberships
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY events_select_published ON public.events
FOR SELECT TO anon, authenticated
USING (is_published);

CREATE POLICY order_items_insert_own ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.user_id = (SELECT auth.uid())
    AND o.status = 'pending'
));

CREATE POLICY order_items_select_event_staff ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  JOIN public.event_memberships m ON m.event_id = o.event_id
  WHERE o.id = order_items.order_id
    AND m.user_id = (SELECT auth.uid())
    AND m.role IN ('organizer', 'admin')
));

CREATE POLICY order_items_select_own ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.user_id = (SELECT auth.uid())
));

CREATE POLICY orders_insert_own ON public.orders
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

CREATE POLICY orders_select_event_staff ON public.orders
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.event_memberships m
  WHERE m.event_id = orders.event_id
    AND m.user_id = (SELECT auth.uid())
    AND m.role IN ('organizer', 'admin')
));

CREATE POLICY orders_select_own ON public.orders
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY profiles_insert_own ON public.profiles
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY profiles_select_own ON public.profiles
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY ticket_types_select_active_published ON public.ticket_types
FOR SELECT TO anon, authenticated
USING (is_active AND EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = ticket_types.event_id AND e.is_published
));

CREATE POLICY tickets_select_event_staff ON public.tickets
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.event_memberships m
  WHERE m.event_id = tickets.event_id
    AND m.user_id = (SELECT auth.uid())
    AND m.role IN ('organizer', 'admin', 'box_office')
));

CREATE POLICY tickets_select_own ON public.tickets
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_user_id);

CREATE POLICY tickets_update_own_holder_fields ON public.tickets
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = owner_user_id)
WITH CHECK ((SELECT auth.uid()) = owner_user_id);

-- The function body is supplied by the checked-in refundable-ticket
-- migration. The captured guard trigger is absent from that source chain.
CREATE TRIGGER tickets_guard_server_fields BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tickets_guard_server_fields();

-- Future public objects must opt in to Data API access. Existing-object
-- revocations above do not change the defaults used by the next CREATE.
-- These defaults belong to the role running this fresh install; a different
-- migration owner must normalize its own defaults before creating objects.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
-- PostgreSQL grants function EXECUTE to PUBLIC globally by default. A
-- schema-local revoke cannot remove that global grant, so this one setting
-- intentionally covers future functions created by the install role in any
-- schema. Review that owner/scope before any hosted use of this draft.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
