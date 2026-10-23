-- Gate 149d (slice 148c): deterministic first-class line-item backfill plus
-- immutable order-item guard. Additive only. No SECURITY DEFINER, no RLS,
-- grant, role, policy or writer changes.

-- 1. Deterministic backfill of tickets.order_item_id.
--    Relies on the Gate 149c unique invariant on
--    public.order_items(order_id, ticket_type_id): the join can match at most
--    one line, so every match is provable. Non-provable rows stay NULL.
UPDATE public.tickets t
SET order_item_id = oi.id
FROM public.order_items oi
WHERE t.order_item_id IS NULL
  AND oi.order_id = t.order_id
  AND oi.ticket_type_id = t.ticket_type_id;

-- 2. Deterministic backfill of the refund ledger line reference and money.
--    Same unique-pair proof; amount is the immutable order line price times
--    the refunded ticket count, currency from the order. Ambiguous or
--    unmatched rows stay NULL.
UPDATE public.ticket_refunds r
SET order_item_id = oi.id,
    amount_cents = COALESCE(r.amount_cents, oi.unit_price_cents * r.ticket_count),
    currency = COALESCE(r.currency, o.currency)
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE r.order_item_id IS NULL
  AND oi.order_id = r.order_id
  AND oi.ticket_type_id = r.ticket_type_id;

-- 3. Extend the existing server-field guard so a non-service_role caller can
--    never set, change or clear tickets.order_item_id. Every previously
--    frozen field keeps its existing behaviour verbatim.
CREATE OR REPLACE FUNCTION public.tickets_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if current_user is distinct from 'service_role' then
    new.owner_user_id       := old.owner_user_id;
    new.order_id            := old.order_id;
    new.ticket_type_id      := old.ticket_type_id;
    new.event_id            := old.event_id;
    new.status              := old.status;
    new.checked_in_at       := old.checked_in_at;
    new.refundable_at_issue := old.refundable_at_issue;
    new.order_item_id       := old.order_item_id;
  end if;
  return new;
end;
$$;
