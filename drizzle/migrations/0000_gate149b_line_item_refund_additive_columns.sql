-- Gate 149b — additive, backward-compatible first-class line-item refund columns.
-- Nullable columns and indexes only. No backfill, no unique constraint, no
-- writer/trigger/RLS/policy/grant/role/function change, no SECURITY DEFINER.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS order_item_id uuid NULL
    REFERENCES public.order_items(id) ON DELETE RESTRICT;

ALTER TABLE public.ticket_refunds
  ADD COLUMN IF NOT EXISTS order_item_id uuid NULL
    REFERENCES public.order_items(id) ON DELETE RESTRICT;

ALTER TABLE public.ticket_refunds
  ADD COLUMN IF NOT EXISTS amount_cents integer NULL;

ALTER TABLE public.ticket_refunds
  ADD COLUMN IF NOT EXISTS currency text NULL;

ALTER TABLE public.ticket_refunds
  ADD CONSTRAINT ticket_refunds_amount_cents_check
    CHECK (amount_cents IS NULL OR amount_cents >= 0);

ALTER TABLE public.ticket_refunds
  ADD CONSTRAINT ticket_refunds_currency_check
    CHECK (currency IS NULL OR currency ~ '^[a-z]{3}$');

CREATE INDEX IF NOT EXISTS tickets_order_item_id_idx
  ON public.tickets(order_item_id);

CREATE INDEX IF NOT EXISTS ticket_refunds_order_item_id_idx
  ON public.ticket_refunds(order_item_id);

COMMENT ON COLUMN public.tickets.order_item_id IS 'Gate 149b: nullable first-class refund line reference; NULL means not yet attributed. Server-written only.';
COMMENT ON COLUMN public.ticket_refunds.order_item_id IS 'Gate 149b: nullable first-class refund line reference; NULL means not yet attributed.';
COMMENT ON COLUMN public.ticket_refunds.amount_cents IS 'Gate 149b: nullable reversed amount, authoritative from the immutable order line.';
COMMENT ON COLUMN public.ticket_refunds.currency IS 'Gate 149b: nullable currency of the reversed amount.';