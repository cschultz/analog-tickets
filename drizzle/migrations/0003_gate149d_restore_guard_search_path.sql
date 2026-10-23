-- Gate 149d follow-up: restore the explicit empty search_path on the ticket
-- server-field guard. Body unchanged; it references no relations.
CREATE OR REPLACE FUNCTION public.tickets_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
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
