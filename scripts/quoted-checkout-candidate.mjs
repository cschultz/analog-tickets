/** Deterministic local draft composer. No I/O, deployment or migration execution. */
import assert from "node:assert/strict";
import { unwrapGuestDraft } from "./guest-install-candidate.mjs";

function lastWriter(baseline, name, delimiter) {
  const start = Math.max(
    baseline.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`),
    baseline.lastIndexOf(`CREATE FUNCTION public.${name}(`),
  );
  assert.ok(start >= 0, `missing baseline writer: ${name}`);
  const end = baseline.indexOf(
    `${delimiter};`,
    baseline.indexOf(`AS ${delimiter}`, start) + delimiter.length + 3,
  );
  assert.ok(end > start, `missing writer terminator: ${name}`);
  return baseline.slice(start, end + delimiter.length + 1);
}
function patchOnce(source, original, replacement) {
  assert.equal(
    source.split(original).length,
    2,
    "baseline writer changed; review integration delta",
  );
  return source.replace(original, replacement);
}

export function buildQuotedCheckoutDraft(baseline, shape) {
  let paid = lastWriter(baseline, "finalize_paid_checkout_attempt", "$function$");
  paid = patchOnce(
    paid,
    "  v_refundable boolean := false;",
    `  v_refundable boolean := false;
  v_quote public.ticket_price_quotes%ROWTYPE;
  v_settled text;
  v_buyer_name text;
  v_buyer_email text;`,
  );
  paid = patchOnce(
    paid,
    "  SELECT COALESCE(t.is_refundable, false) INTO v_refundable",
    `  IF v_attempt.price_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.ticket_price_quotes WHERE id=v_attempt.price_quote_id;
    IF v_quote.id IS NULL OR ROW(v_quote.owner_user_id,v_quote.event_id,v_quote.ticket_type_id,
      v_quote.quantity,v_quote.unit_price_cents,v_quote.total_cents,v_quote.currency)
      IS DISTINCT FROM ROW(v_attempt.user_id,v_attempt.event_id,v_attempt.ticket_type_id,
        v_attempt.quantity,v_attempt.unit_price_cents,v_attempt.amount_cents,v_attempt.currency)
      OR (SELECT count(*) FROM public.ticket_quote_allocations WHERE quote_id=v_quote.id)<>v_quote.quantity THEN
      RETURN QUERY SELECT 'not_finalizable'::text,NULL::uuid,0; RETURN;
    END IF;
    IF v_quote.promotion_id IS NOT NULL THEN
      SELECT public.settle_ticket_promotion(v_attempt.user_id,v_quote.id,'consumed') INTO v_settled;
      IF v_settled<>'settled' THEN
        RAISE EXCEPTION 'promotion_not_consumable' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(t.is_refundable, false) INTO v_refundable`,
  );
  paid = patchOnce(
    paid,
    `  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency, checkout_attempt_id)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', v_attempt.amount_cents, v_attempt.amount_cents, v_attempt.currency, v_attempt.id)`,
    `  -- The guest cart is immutable and unique per reservation. Copy only the
  -- exact linked buyer contact at insertion; never backfill old orders or infer
  -- ticket-holder identities. Non-guest owned purchases keep null contact.
  SELECT c.buyer_name,c.buyer_email INTO v_buyer_name,v_buyer_email
    FROM public.guest_checkout_carts c
    WHERE c.reservation_id=v_attempt.reservation_id AND c.owner_user_id=v_attempt.user_id
      AND c.ticket_type_id=v_attempt.ticket_type_id AND c.quantity=v_attempt.quantity;
  INSERT INTO public.orders(user_id, event_id, status, subtotal_cents, total_cents, currency,checkout_attempt_id,buyer_name,buyer_email)
  VALUES (v_attempt.user_id, v_attempt.event_id, 'paid', COALESCE(v_quote.subtotal_cents,v_attempt.amount_cents), v_attempt.amount_cents, v_attempt.currency,v_attempt.id,v_buyer_name,v_buyer_email)`,
  );
  paid = patchOnce(
    paid,
    `  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id
  FROM generate_series(1, v_attempt.quantity);`,
    `  INSERT INTO public.tickets(order_id, ticket_type_id, event_id, owner_user_id, status, refundable_at_issue, order_item_id,price_quote_id,price_quote_ordinal)
  SELECT v_order_id, v_attempt.ticket_type_id, v_attempt.event_id, v_attempt.user_id, 'issued', v_refundable, v_order_item_id,
    v_attempt.price_quote_id,CASE WHEN v_attempt.price_quote_id IS NOT NULL THEN i-1 ELSE NULL END
  FROM generate_series(1, v_attempt.quantity) AS i;`,
  );

  let refund = lastWriter(baseline, "reverse_refunded_tickets", "$function$");
  refund = patchOnce(
    refund,
    "  v_currency text;",
    "  v_currency text;\n  v_quote public.ticket_price_quotes%ROWTYPE;",
  );
  refund = patchOnce(
    refund,
    "  v_amount_cents := CASE WHEN v_unit_price IS NULL THEN NULL ELSE v_unit_price * v_n END;",
    `  IF v_attempt.price_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.ticket_price_quotes WHERE id=v_attempt.price_quote_id;
    IF v_quote.id IS NULL OR v_order.total_cents<>v_quote.total_cents
      OR v_order.subtotal_cents<>v_quote.subtotal_cents OR v_attempt.amount_cents<>v_quote.total_cents
      OR v_attempt.unit_price_cents<>v_quote.unit_price_cents OR v_unit_price<>v_quote.unit_price_cents
      OR v_line_qty<>v_quote.quantity OR v_order.currency<>v_quote.currency THEN
      RETURN QUERY SELECT 'payment_not_correlated'::text,NULL::uuid,0,0; RETURN;
    END IF;
    SELECT count(*),sum(a.paid_cents) INTO v_matched,v_amount_cents
      FROM public.tickets t JOIN public.ticket_quote_allocations a
        ON a.quote_id=t.price_quote_id AND a.ordinal=t.price_quote_ordinal
      WHERE t.id=ANY(v_ids) AND a.quote_id=v_quote.id AND t.order_item_id=v_line_id;
    IF v_matched<>v_n OR v_amount_cents IS NULL OR v_amount_cents<0
      OR v_amount_cents>v_quote.total_cents THEN
      RETURN QUERY SELECT 'payment_not_correlated'::text,NULL::uuid,0,0; RETURN;
    END IF;
  ELSE
    v_amount_cents := CASE WHEN v_unit_price IS NULL THEN NULL ELSE v_unit_price * v_n END;
  END IF;`,
  );
  let deadline = lastWriter(baseline, "guard_checkout_provider_deadline", "$$");
  // The baseline uses CREATE FUNCTION, not OR REPLACE, for this one trigger body.
  deadline = deadline.replace("CREATE FUNCTION public.", "CREATE OR REPLACE FUNCTION public.");
  deadline = patchOnce(
    deadline,
    "NEW.provider_expires_at_seconds <> floor(extract(epoch FROM r.expires_at))",
    `NEW.provider_expires_at_seconds <> floor(extract(epoch FROM least(r.expires_at,
      COALESCE((SELECT expires_at FROM public.ticket_price_quotes WHERE id=NEW.price_quote_id),r.expires_at))))`,
  );
  return `-- Review/local integration only. No external installation.\nBEGIN;\n${unwrapGuestDraft(shape)}\n${paid}\n${refund}\n${deadline}\nCOMMIT;\n`;
}
