# Current TEST release: promotions, clear pricing and organizer tools

This is the installation reference for the current source-available TEST beta.
It is not event-launch certification or permission to change someone else's backend.
All payments, contacts and fixtures remain synthetic/TEST. The historical
45-step guest installer alone is not sufficient for this runtime's promo mode.

## Verify the package before installation

From the staged archive root, with Bun available:

```sh
bun scripts/release-import-audit.mjs
bun scripts/promotion-release-package.mjs --verify
```

The first command rejects missing, modified, unsafe or unexpected source files.
The second rebuilds and byte-compares all three generated SQL artifacts against
their included source and locally captured catalog profiles. Neither connects
to a database. Keep the manifest with the archive; do not mix release versions.
After verifying, install the locked dependencies, run `bun run build` **first**,
then `bun run typecheck:runtime`. The build generates `src/routeTree.gen.ts`,
which is deliberately absent from the archive; checking types before generation
fails. Build directories and dependencies are excluded from the source audit,
but that generated route source is reported as unexpected if the audit is run
again after build. Keep the clean pre-build audit as evidence; do not introduce
other unmanifested source. The full private test suite is not in this cut.

The reviewed source package generates:

| Path                                   | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `scripts/promotion-install.review.sql` | Fresh empty-backend install, 51 source-backed steps in one transaction |
| `scripts/promotion-upgrade.review.sql` | Preserve-data upgrade from the exact 45-step guest baseline            |
| `scripts/verify-promotion-install.sql` | Read-only catalog, routine and permission verification                 |

The files are generated during source-cut staging and covered by
`SOURCE_MANIFEST.sha256`; they are not independent hand-maintained SQL copies.
In the source repository, `bun scripts/promotion-release-package.mjs --check-source`
checks generation without requiring a staged archive. The three `--emit-*`
options print SQL for review only; there is no database URL or apply mode.

## Choose one installation path

Use the original installer role, a quiet backend with app writers stopped and a
backup appropriate to the target. Review the complete SQL, rehearse it by
replacing only its final `COMMIT;` with `ROLLBACK;`, inspect the result, then
apply that same reviewed artifact once with SQL errors set to stop execution.
Do not execute individual layers separately or continue after an error.

For a fresh install, use `promotion-install.review.sql` only on an isolated
backend with zero Auth users and an empty public application schema. The
existing Auth infrastructure and anon/authenticated/service roles must exist.
The fresh installer retains the reviewed baseline's default-grant normalization;
it must not be used as an upgrade or as a reset tool.

For an upgrade, use `promotion-upgrade.review.sql` only on the exact canonical
45-step guest baseline or its explicitly captured managed-platform variant.
The preflight compares fourteen catalog/permission fingerprints, checks the
installer role, and locks existing application tables before adding anything.
An older 42-step install needs its separately reviewed guest-upgrade path first.
A modified, partially installed, or unrecognized schema is refused—not reset,
repaired automatically or accepted with a bypass flag. Review that mismatch
before choosing a new migration. No user, ticket, refund, cart or audit cleanup
is part of this upgrade; historical rows are not repriced or backfilled.

Both paths install quote storage, paid/refund integration, expiry audit/release,
guest promo RPCs, expiry dispatch, then organizer promotion RPCs. This order is
required: the guest reader depends on the expiry audit table. The final catalog
has 29 RLS-enabled tables, 15 policies, 34 application triggers and 62 routines.
New pricing tables and RPCs are not directly accessible to browser roles or the
managed sandbox role. Upgrade preserves existing grants and platform defaults;
it introduces no role changes or global default-grant normalization.

After either path, run the read-only verifier using the same installer role.
It checks exact function definitions/configuration as well as permissions; row
counts alone are not acceptance. The fresh installer refuses a second install;
the upgrade refuses repeat application. Do not drop tables to make either pass.

## Keep activation separate from source and database installation

Deploying/syncing runtime or applying SQL to a hosted project requires separate
authorization. Keep promotion mode off until the matching database and runtime
have been checked together. The pricing/organizer promotion branch requires
`PROMOTION_PRICING_SANDBOX_MODE=true`, `PAYMENTS_TEST_MODE=true` and
`PAYMENT_PROVIDER=stripe_test`; guest checkout also requires its existing guest
TEST opt-in and exact allowed origin. Retain the existing receipt, recovery,
door and provider TEST setup described in `RELEASE_FIRST_RUN.md`. Do not create
or rotate credentials simply to install source; use the approved secure store.

Buyer scope: USD, 1–10 tickets, fixed order discounts or percentage discounts,
saved server-owned totals and deterministic per-ticket refund shares. Added
fees are zero; tax is explicitly not calculated, not represented as exemption.
Free/sub-minimum purchases and newly enabled 100% codes are unsupported.

Organizer scope: event-scoped search, 50-row pages, safe all-matching CSV capped
at 500 rows, and version-checked promotion creation/editing with current
membership checks. Narrow an oversized export; it never silently truncates.
There is no public cron/cleanup endpoint or automatically installed scheduler.

## Evidence and remaining gate

The disposable local installation rehearsal checks fresh install, standard and
managed upgrades, rollback, drift refusal, preservation of historical ticket /
refund / door / active-cart rows, and continued legacy fulfillment. It does not
prove a hosted install or a real provider journey for this new release.

The current source candidate passed 129 assembled local purchase, saved-quote
reuse, recovery, partial-refund, door and caller-RLS organizer assertions using
the packaged SQL and matching runtime. Auth/provider/mail were explicit local
stand-ins; this is not deployed ingress or real-provider evidence. The finalizer
also now copies buyer contact from the exact immutable guest cart into **new**
orders for buyer-name/email search, without rewriting old orders or inferring
ticket-holder names. Use the current package, not a pre-repair archive.

The existing demo subsequently passed its specifically approved upgrade,
publication and provider TEST acceptance: purchase, hosted completion,
receipt/recovery/account link, organizer search/CSV, door and partial refund.
Do not repeat that consumed batch to verify package bytes. This evidence does
not establish an unaided installation of this archive or real-money operation.
Other hosted activation still requires its own applicable authorization. Retain
uncertain payment records for reconciliation; a source merge or local stand-in
journey alone does not prove hosted installation or provider delivery.
