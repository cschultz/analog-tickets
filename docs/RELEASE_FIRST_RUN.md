# Analog Tickets TEST beta — first run

This guide is for the v0.1 source-available TEST beta and an isolated TEST
backend. It is not a real-money deployment guide or event-launch certification.
Begin with the source build; provider credentials are not needed for that step.
There is one fresh-install path: the generated **51-step** installer below.

## 1. Verify and build the source

Use an empty source directory, Bun, Node.js (for the built Worker preview), and
the exact candidate archive with its `SOURCE_MANIFEST.sha256`. Compare the
manifest's SHA-256 with the value supplied independently by the release owner.
The manifest alone establishes byte integrity, not publisher identity.

From the archive root, before installing or building:

```sh
bun scripts/release-import-audit.mjs
bun scripts/promotion-release-package.mjs --verify
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run typecheck
bun run typecheck:runtime
```

All commands must exit successfully and the lockfile must remain unchanged.
The import audit rejects missing, changed, unexpected, and symlinked source.
The SQL check rebuilds the three packaged artifacts without contacting a
database. Build comes before typecheck because it generates the deliberately
unshipped `src/routeTree.gen.ts`. A later exact-tree audit reports that generated
file as unexpected; retain the successful pre-build audit instead of silently
allowing other source additions. The private automated test suite is not shipped.

An editor remix can add starter files or change generated integration files.
Inventory those changes rather than adding dependencies to make an unexplained
starter test compile. The only pre-reviewed type-only exception is a different
`PostgrestVersion` literal in `src/integrations/supabase/types.ts`, with every
other byte unchanged. Record any exception; build success is not source parity.
Use a clean directory if the editor cannot preserve the release cut.

## 2. Install the empty TEST backend

The backend needs Supabase-compatible Auth infrastructure and the `anon`,
`authenticated`, and `service_role` database roles. Confirm its identity and
that it has zero Auth users and no public application relations, routines, or
user-defined types. A remix with cloned tables but zero rows is **not empty**.
This guide never resets a schema or changes an existing project's database.

### Optional local backend: the tested native runtime

The 2026-10-22 agent-run rehearsal used official Supabase CLI **2.121.0** on
Apple Silicon macOS with its experimental native runtime, not Docker or another
hosted project. Follow the [runtime prerequisites](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).
Use an empty backend directory outside the app source and a dedicated absolute
`SUPABASE_HOME` directory for this disposable stack; do not replace your normal
CLI state. Set `SUPABASE_EXPERIMENTAL_STACK=1` for these commands, then run
`supabase init` in that empty backend directory.

Before starting, edit the existing `supabase/config.toml` sections (do not append
duplicate sections): disable `db.migrations.enabled`, `db.seed.enabled` and
`storage.vector.enabled`; set `auth.enable_anonymous_sign_ins=true` and
`auth.minimum_password_length=12`. For synthetic confirmed users without mail,
use `auth.email.enable_signup=true` and `auth.email.enable_confirmations=false`.
These are local TEST settings, not instructions for an existing hosted backend.

```sh
supabase start --runtime native --exclude realtime,storage,functions,studio,mail,analytics,pooler --eager
```

Use the stack's actual allocated loopback endpoints, not assumed default ports.
Keep CLI credential output local and out of shared logs. Pass the database
connection privately to `psql`; pass only the public URL/publishable key to the
app. Auth administration in step 3 may use the supported `auth.admin.createUser`
API with `email_confirm: true` and strong temporary passwords; never SQL-insert
Auth users or put the service key into the browser. No provider is needed for
the installer, catalog or Auth/Data API isolation checks.

When finished, confirm the full stack ID and project root, stop only that stack
with `supabase stack stop --stack-id <owned-stack-id>`, then destroy only it with
`supabase stack destroy --stack-id <owned-stack-id> --yes`. Destruction removes
its synthetic users and database; retain evidence first. Do not use `--all` or
delete a shared backend. This recipe records the setup discovered during the
agent-run rehearsal; it has not yet had an unaided independent human trial.

### Apply the packaged installer

Review `scripts/promotion-install.review.sql`. Rehearse on the confirmed empty
TEST backend by changing only its final `COMMIT;` to `ROLLBACK;`, then review
the outcome. Apply the same unmodified artifact once. With a preconfigured
secure `psql` connection to that backend:

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/promotion-install.review.sql
psql -X -v ON_ERROR_STOP=1 -f scripts/verify-promotion-install.sql
```

Do not add `--single-transaction`: the installer manages its own transaction.
Do not also apply the historical migrations or component drafts. On error,
stop and establish whether anything committed before considering another run.
The verifier expects 29 RLS-enabled tables, 15 policies, 34 application triggers,
62 routines, and exact definitions and grants. It does not test Auth or providers.

Already have an installation? Stop here and use
[the upgrade reference](PROMOTION_RELEASE_INSTALL.md), which accepts only exact
reviewed baselines. Never run the fresh installer or clear tables to force an
upgrade to pass.

## 3. Create the sample event and staff

On this newly installed TEST backend, the optional seed creates one synthetic
event and a $12 tier with 12 seats and a four-ticket per-order limit:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/seeds/synthetic-first-event.sql
```

It refuses existing inventory. It creates no user, credential, or staff grant.
There is no complete event/ticket authoring UI in v0.1: event facts and ticket
inventory are configured through reviewed database setup. Do not substitute a
real event or promise real admission in this TEST beta.

Through the backend's supported Auth administration, enable email/password
sign-in and anonymous sign-in for guest checkout if not already enabled.
Create confirmed synthetic organizer and door users under `@example.test`,
without sending confirmation emails. Keep passwords in a secure store, not SQL.
For each actor, create a `public.profiles` row with `id` equal to its actual
Auth user UUID if the Auth flow did not create it. Using the seed event's actual
UUID, add exactly these `public.event_memberships` rows:

| User          | `event_id`      | `user_id`           | `role`       |
| ------------- | --------------- | ------------------- | ------------ |
| Organizer     | Seed event UUID | Organizer Auth UUID | `organizer`  |
| Door operator | Seed event UUID | Door Auth UUID      | `box_office` |

A synthetic buyer/account actor, when needed, gets a profile but **no staff
membership**. Guest checkout creates its own anonymous buyer; staff sign-in is
not a prerequisite for buying. Do not create Auth users by inserting SQL rows.
Check signed-out private-table access (no rows or permission denial), then
verify signed-in actors cannot read another person's profile or membership
through the Data API. Catalog counts alone do not prove access isolation.

## 4. Configure a read-only preview first

Provide `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the app server, or the
browser-visible `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build
time. Use only this TEST backend. Never put a service-role key, provider secret,
or password in a `VITE_*` variable or publishable-key setting.

Start `bun run dev` and visit its reported local URL. Verify the synthetic event
and ticket option appear and private operator screens deny signed-out access.
Workflow switches are off by default. No provider credential is needed merely
to show the catalog. The package supplies a neutral catalog and text-only
checkout branding with system fonts, not the private festival showcase. No
Cosmico media is required or licensed for a remix.

The packaged `.env.example` is a value-free reference for this guide, not a
request to supply every setting before preview. The included `.gitignore`
excludes populated `.env` files and build output. Prefer a secure process or
host settings for real values; never commit a populated template. If creating a
local config file, do it after the clean source audit and do not include it in
a shared source archive or its checksum manifest.

## 5. Enable only the intended TEST workflows

Configure server-only values in a secure process or the host's secure settings;
do not commit populated files, print configuration, or paste secrets into chat.
Use existing restricted TEST credentials where available. Installing another
copy is not a reason to rotate keys or create another provider account.

| Workflow                 | Server settings                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend writes           | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                                                                                                     |
| Guest pricing/checkout   | `GUEST_CHECKOUT_SANDBOX_MODE=true`, `PROMOTION_PRICING_SANDBOX_MODE=true`, `PAYMENTS_TEST_MODE=true`, `PAYMENT_PROVIDER=stripe_test`, `STAGING_ALLOWED_ORIGIN`              |
| Stripe TEST              | `STRIPE_TEST_RESTRICTED_KEY` (restricted TEST key), `STRIPE_TEST_WEBHOOK_SECRET`                                                                                            |
| Receipt and recovery     | `GUEST_RECOVERY_SANDBOX_MODE=true` and the Mailtrap settings below                                                                                                          |
| Optional account library | `GUEST_ACCOUNT_SANDBOX_MODE=true` plus guest recovery                                                                                                                       |
| Ticket passes and door   | `ATTENDEE_PASS_SANDBOX_MODE=true`, `CHECKIN_SANDBOX_MODE=true`, `BOX_OFFICE_MODULE=true`                                                                                    |
| Mailtrap Email Testing   | `MAILTRAP_TESTING_MODE=true`, `MAILTRAP_API_TOKEN`, `MAILTRAP_ACCOUNT_ID`, `MAILTRAP_INBOX_ID`, synthetic `MAILTRAP_FROM_ADDRESS`, `MAILTRAP_RECIPIENT_DOMAIN=example.test` |

`STAGING_ALLOWED_ORIGIN` is the app's exact bare HTTPS origin, with no path or
trailing slash, not a different site's return URL. Public backend URLs permit
plain HTTP only for exact loopback hosts. The payment return-origin constraint
still requires HTTPS. Managed hosts may not expose the server-only service key;
that is an installation capability to resolve, not a reason to expose a secret
to the browser or bypass access control.

The provider's TEST webhook destination is `/api/public/payment-webhook` on the
app's approved host. Configure these events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `charge.refunded`, and `refund.updated`. Use its
matching signing secret; payment fulfillment must come from a signature-verified
webhook, not a browser success redirect. A locally signed test event verifies
the handler, not actual provider delivery to a hosted destination.

Setting names containing `SANDBOX` or `STAGING` are retained for compatibility;
do not rename the variables when adapting the site's presentation. See the
[release installation reference](PROMOTION_RELEASE_INSTALL.md) for pricing
limits and source/database activation ordering.

## 6. Record acceptance honestly

The existing published TEST demonstration has observed purchase, provider
completion, receipt/recovery, optional account link, promo/search/export, door
and partial-refund evidence. Reuse that evidence for unchanged code; do not
repeat a payment merely to compare source checksums or edit a guide.

For a newly authorized integrated test, reconcile one bounded synthetic order:
purchase, signature-verified issuance, fresh recovery, staff access, first and
duplicate scan, one eligible partial refund, void/restock, unchanged scanned
ticket, and replay denial. Use only TEST funds and `@example.test` recipients.
Stop on uncertain payment/refund outcomes; retain records for reconciliation
rather than buying again. Preserve provider and append-only audit history.

Use the actual application screens for the authorized current-release journey:

| Step                                                | Entry point                                                                    | Expected result                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Browse and buy as a guest                           | `/`, then the tier's TEST checkout link                                        | No required account; quantity, contact, promo and final saved USD total shown before payment                               |
| Configure a synthetic promotion and inspect records | `/organizer` as the event's organizer                                          | Event-scoped access, original saved total, matching contact search and bounded CSV                                         |
| Recover in a fresh browser                          | `/tickets/recover` and the exact synthetic recipient's captured TEST email     | The paid purchase and its passes return without a required account                                                         |
| Optional account link                               | Recovery view, then `/tickets/account`                                         | The purchase appears for that verified account; no organizer/door role is added                                            |
| Scan one of two tickets                             | `/staging/box-office/check-in` as the event's door actor                       | First scan accepted; duplicate and unprivileged actor denied                                                               |
| Refund the other ticket                             | `/staging/admin/refund-review` as the organizer                                | Only the unscanned eligible ticket can be refunded, at its original paid share                                             |
| Reconcile                                           | Recovery/account view, provider TEST history and exact backend fixture records | One payment, at most one refund; refunded pass invalid, seat returned, scanned ticket unchanged, no second eligible refund |

The old private Gate 95/125 runners and their Python/browser requirements are
not included: they exercise legacy workflow settings rather than this current
guest/promotion journey. No extra runner upload or Python setup is needed to
follow the manual checklist. Record any missing UI/setup step as installation
friction rather than silently repairing it and calling the original guide a
pass. The agent-run native rehearsal passed real Auth and Data API checks,
but unaided independent human installation and physical-phone camera scanning
remain unverified. These are accepted TEST-beta limitations, not passing checks.
Validate both for your own deployment; a build is not either check.

The package includes the Foundation's approved Shield/additional-permissions
terms, collected distribution notices and support/security destinations. This
is source-available, not unrestricted open source. Preserve earlier grants and
upstream rights, and review the actual contents of anything you redistribute.
Publication of this TEST beta does not authorize real funds, real email or
deployment changes to another operator's system.
