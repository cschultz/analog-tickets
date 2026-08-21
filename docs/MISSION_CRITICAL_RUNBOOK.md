# Mission-Critical Sales Window Runbook

Use during the high-traffic ticket sales window (Tier 2, peak campaigns,
crew bid expirations). Goal: 100% uptime, fast diagnosis, safe rollback.

---

## 0. Pre-flight checklist (run 24h before window opens)

- [ ] Stripe API key + webhook secret rotation date is **after** the window closes.
- [ ] Resend monthly quota has headroom for projected sends.
- [ ] SimplyTexting balance covers projected SMS sends (incl. abandonment funnel).
- [ ] Lovable Cloud DB instance size is one tier above current peak.
- [ ] `cloud_status` returns `ACTIVE_HEALTHY`.
- [ ] Latest deploy passed CI (`admin-ui-lint`, `checkout-tests`, `e2e-tests`).
- [ ] Snapshot taken — note timestamp + restore-point ID below.
- [ ] Status banner copy pre-written (see §4).
- [ ] On-call rotation confirmed; phones charged.

Snapshot taken at: __________  Restore point ID: __________

---

## 1. Synthetic monitoring

Already running:
- `checkout-canary` (4-retry, bypasses 502/503).
- `sms-health-canary`.
- `system-health`.

Recommended additions during window:
- Pingdom/UptimeRobot HTTP check on `https://example.test/tickets` every 60s.
- HTTP check on `https://example.test/my-tickets` every 5min.
- Edge function health: POST empty body to `create-addon-checkout` every
  5min, expect 400 (not 5xx). Alert on 5xx or timeout > 8s.

---

## 2. Inventory drift audit

Run every 30 min during peak, or after any reported "I paid but no ticket":

```bash
bun scripts/audit-addon-inventory-drift.ts
```

If drift detected:
1. Cross-check with Stripe payments for the affected `inventory_id`.
2. If sold_quantity is undercounted (oversell risk), pause the addon row:
   `UPDATE addon_inventory SET is_active = false WHERE id = '...'`.
3. Re-run the auto-pilot self-healing job.
4. Re-enable once drift = 0.

A parallel SQL drift check for ticket inventory is already covered by the
platform auto-pilot.

---

## 3. Load test (staging only)

Before the window, validate the two hot endpoints under concurrency:

```bash
k6 run -e BASE_URL=https://<staging>.lovable.app \
       -e ANON_KEY=<staging-anon-key> \
       -e REGISTRATION_ID=<existing-paid-reg> \
       -e EMAIL=<owner-email> \
       scripts/load-test-checkout.js
```

Pass criteria:
- p95 < 2.5s for both `create-checkout` and `create-addon-checkout`.
- Failure rate < 2%.
- No 5xx responses.

If the Stripe customer lookup serializes (latency climbs linearly with VUs),
add an in-function customer cache or batch the lookup.

---

## 4. Status banner kill switch

Pre-written copy (paste into `site_status` if needed):

```
We're working through a brief checkout slowdown — your spot is safe.
If your card was charged, your ticket is reserved. We'll email confirmation
within 30 minutes. Questions: contact@example.test
```

SQL to flip the banner ON:

```sql
UPDATE site_status SET is_active = true, message = '<paste copy>',
  severity = 'warning', updated_at = now() WHERE id = (SELECT id FROM site_status LIMIT 1);
```

SQL to flip OFF:

```sql
UPDATE site_status SET is_active = false, updated_at = now()
  WHERE id = (SELECT id FROM site_status LIMIT 1);
```

---

## 5. Stripe webhook replay drill

Run on staging the day before the window:

1. In Stripe Dashboard → Developers → Webhooks → select example.test endpoint.
2. Find a recent successful `checkout.session.completed` event.
3. Click "Send test webhook" / "Resend".
4. Verify in `webhook_logs` that the second delivery is no-op'd by
   idempotency (same `event_id`, no duplicate registration created).
5. Verify no duplicate row in `registrations` or `addon_purchases`.

If the duplicate is processed (creating a second registration), STOP — the
idempotency layer has regressed and must be fixed before the window opens.

---

## 6. Rollback rehearsal

For each of the last 3 deploys:

1. Open Lovable → Publish history.
2. Note the deploy ID and confirm "Revert to this version" is available.
3. Skim the diff for any one-way migrations
   (DROP COLUMN, DROP TABLE, irreversible data backfill).
4. If a one-way migration exists, write the inverse migration NOW and store
   it under `supabase/migrations/_rollback/` (do not apply).

A rollback that requires a fresh forward migration is not a rollback —
it's a re-deploy. Know which is which before you need to choose.

---

## 7. Incident response triage tree

User reports "checkout broken":

1. Check `code--read_console_logs` and browser network on the live site.
2. Check `supabase--edge_function_logs` for `create-checkout`.
3. Check Stripe Dashboard → Logs for matching API calls.

If errors are isolated to one user → likely promo / auth / data state.
If errors are broad:
- 502/503 → wait 30s, check canary, then escalate to Lovable Cloud status.
- 4xx spike → recent deploy regression. Rollback per §6.
- 5xx from edge function → check function logs for stack trace.
- DB timeout → upsize Cloud instance per `lovable-overview`.

User reports "I paid but no ticket":

1. Find Stripe payment by email or amount.
2. Check `webhook_logs` for matching `event_id`.
3. If webhook never arrived → manually replay from Stripe Dashboard.
4. If webhook arrived but failed → check edge function logs, fix root cause,
   then resend. Idempotency will prevent duplicates.
5. As a backstop, manual ticket comp via Admin → Tickets.

---

## 8. Test coverage map (current state)

| Surface | Coverage | File |
|---|---|---|
| Dinner cap math (client) | Unit | `src/lib/__tests__/addonsDinnerCap.test.ts` |
| Dinner cap UI banners | E2E | `e2e/my-tickets-dinner-addon.spec.ts` |
| Dinner cap (server) | Inline in edge function | `supabase/functions/create-addon-checkout/index.ts` |
| Checkout core | E2E | `e2e/checkout.spec.ts`, `e2e/checkout-browsers.spec.ts` |
| Booking routing | E2E | `e2e/booking-routing.spec.ts` |
| My-tickets wallet | E2E | `e2e/my-tickets.spec.ts` |
| Inventory drift | Audit script | `scripts/audit-addon-inventory-drift.ts` |
| Load profile | k6 | `scripts/load-test-checkout.js` |

Gap intentionally left open: a Deno integration test for
`create-addon-checkout` that exercises real DB fixtures. The cap math is
covered by the Vitest suite, and end-to-end behaviour is covered by the
Playwright spec — adding the Deno layer would duplicate logic without
catching a new bug class. Revisit if the cap rules diverge between
client and server again.
