# Organizer workspace — v0.1.0-test.2

This is a developer-operated, event-scoped **TEST** workspace, not production
certification or full legacy-festival management. `/admin` opens Dashboard;
`/organizer` opens Orders. Both use the same account and event memberships.
Signing in does not grant organizer access. The clean remix template has no
backend, accounts, provider credentials or sample records until you install them.

## Install or upgrade deliberately

1. Complete the [first-run guide](RELEASE_FIRST_RUN.md), including its reviewed
   **51-step** baseline, synthetic event/tier and supported Auth/staff setup.
   An existing v0.1.0-test.1 installation must not rerun the fresh-only installer.
   Back up its isolated TEST backend and preserve its rows and memberships.
2. Review `scripts/admin-catalog-workspace.draft.sql`. It is the separately
   reviewed three-function catalog extension, not part of the 51-step baseline.
   Its draft/local-only header records development provenance; inclusion in this
   release is not permission to alter someone else's backend. Only the backend
   owner/operator may deliberately install it on their own isolated TEST system.
   It creates routines, not replacement tables or a new data model.
3. Using a secure, already configured `psql` connection to that TEST database,
   check the exact routines below. **All three must be absent before installation.**
   If any exists, stop and inspect the installed definition/grants; do not drop,
   replace or rerun the extension automatically.

```sql
SELECT
  to_regprocedure('public.read_admin_event_workspace(uuid,uuid)') AS read_workspace,
  to_regprocedure('public.save_admin_event_details(uuid,uuid,text,jsonb)') AS save_event,
  to_regprocedure('public.save_admin_ticket_tier(uuid,uuid,uuid,text,jsonb)') AS save_tier;
```

4. Rehearse the exact extension on a disposable local copy or in its own
   rollback-only transaction by changing **only the final `COMMIT;` to
   `ROLLBACK;`**. It already manages its transaction; do not wrap it in another
   transaction or pass `--single-transaction`. Confirm the three routines remain
   absent afterward. This rehearsal must not modify existing application rows.
5. Once reviewed and rehearsed, explicitly apply the unmodified artifact once:

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/admin-catalog-workspace.draft.sql
```

6. Verify three rows with `invoker=true`, `fixed_search_path=true`,
   `service_execute=true`, and `anon_execute=false`, `authenticated_execute=false`:

```sql
SELECT p.oid::regprocedure AS routine, NOT p.prosecdef AS invoker,
       p.proconfig = ARRAY['search_path=""']::text[] AS fixed_search_path,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
WHERE p.oid IN (
  to_regprocedure('public.read_admin_event_workspace(uuid,uuid)'),
  to_regprocedure('public.save_admin_event_details(uuid,uuid,text,jsonb)'),
  to_regprocedure('public.save_admin_ticket_tier(uuid,uuid,uuid,text,jsonb)')
);
```

Do not widen grants to resolve an error. The browser calls authenticated app
functions; the app checks the caller's organizer/admin membership before loading
its server-only service client. Each SQL function independently checks that
actor's membership. A door-only or buyer account does not gain organizer access.

## Configuration and first checks

Keep backend keys server-only as described in the first-run guide. Organizer
reads require `PAYMENTS_TEST_MODE=true` and `PAYMENT_PROVIDER=stripe_test`, plus
the TEST backend URL/publishable key and server-only service key where required.
These flags do not require making a payment or supplying Stripe/Mailtrap keys
just to browse application records. Do not expose a service key in `VITE_*`.

Keep `ADMIN_CATALOG_TEST_MODE` blank until setup is verified. Then, if you intend
to test event/tier editing, set it to exactly `true` in server settings. Blank
disables catalog edits, not the existing authorized order/promotion tools.
No screen creates the initial event or assigns its first organizer; those remain
installation-owner setup. No role, publication or account-setting editor is added.

With synthetic actors and no provider transaction:

- Signed out: protected views must show sign-in and no event records.
- Organizer: select only an assigned event; recent orders and connected detail
  should load. An empty installation should show honest empty results, not samples.
- Buyer/door-only account: organizer records must remain inaccessible.
- Dashboard/report: extension success, original paid totals and current inventory
  should match known TEST records. Missing extension is explicit, not an empty report.
- Catalog: review a draft and cancel it first. Any later synthetic save needs
  separate confirmation; reload after completion. Never retry an uncertain write.
- Setup & readiness: distinguish missing/disabled configuration from unavailable
  reads and recorded delivery states. This screen sends no mail or provider request.

## Everyday workflows and limits

Orders/Attendees show newest records first, 50 per page, with name/email/full-ID
search and status, UTC creation-date and tier filters. A complete CSV export uses
the same filters and caps at 500 rows. List context stays in memory per account,
event and resource during navigation, not in a buyer-search URL or durable storage;
reload/account changes clear it. Order links are hints, never access grants.

Order detail separates buyer and holder, saved item/discount prices, original
paid shares, ticket/check-in status, recorded reversals and actual recorded activity.
It does not calculate a live provider balance or guess an unknown refund amount.
Buyer recovery is buyer-owned email verification, not staff access to pass secrets.
Refund support reuses eligibility, a separate exact-amount confirmation and the
existing TEST command. Checked-in, void or nonrefundable tickets cannot be overridden.
Inspect uncertain outcomes; do not resubmit a financial command as a diagnostic.

Catalog edits are selected-event only. Existing slugs, currency, refundability,
publication state, committed stock and historical order prices are protected.
Tier capacity cannot fall below reserved-or-sold stock. Revision conflicts need
a fresh read; there is no automatic write retry. Dates display in the event zone
(explicit UTC fallback if unavailable); schedule inputs are labeled UTC.

Sales Report offers inclusive windows of at most 90 calendar days when the
existing latest-90-nonempty-date aggregate proves complete coverage. Earlier
omitted history is refused rather than partially summed/exported. Totals are
original paid/refunded orders by creation date, not settlement or refund dates,
net revenue, fees or a provider balance. All-time context is separately labeled.
Use a current Postgres timezone database: older Supabase versions have known
local-time errors for Vancouver, Edmonton and Casablanca; see the
[upstream notice](https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca).
This release does not upgrade a database for you.

Receipt diagnostics require a complete event-scoped read up to 1,000 rows;
capped/malformed/failed reads are unavailable, not healthy zero counts. A recorded
send acknowledgment is not independent inbox proof. Door entry reuses the online
single-event TEST pilot; opening its link does not request a camera or admit anyone.
Physical-phone scanning and unaided independent installation remain explicitly
unverified beta limitations, not claims established by a build or agent rehearsal.
