-- Gate 149c (slice 148a) — additive uniqueness enforcement for first-class
-- line-item refunds: at most one order_items row per (order_id, ticket_type_id).
-- Gate 149a proved duplicate_pair_count = 0, so every existing row remains valid.
-- No backfill, no writer/trigger/RLS/policy/grant/role/function change,
-- no SECURITY DEFINER.

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_id_ticket_type_id_unique_idx
  ON public.order_items(order_id, ticket_type_id);

COMMENT ON INDEX public.order_items_order_id_ticket_type_id_unique_idx IS 'Gate 149c/148a: one order line per ticket type per order; prerequisite for the 148c order_item_id backfill.';