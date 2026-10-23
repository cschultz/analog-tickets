# Analog Tickets v0.1.0-test.1

Source-available **TEST beta**. This is a developer-operated evaluation release,
not a hosted ticket seller or a real-admission launch. No live payment or
real-recipient email activation is included.

## Included

Neutral event catalog and restrained checkout branding; account-optional guest
purchase; quantities/promotion codes/saved pricing; signature-verified Stripe
TEST fulfillment; Mailtrap TEST receipt/recovery; optional account library;
online door/duplicate checks; organizer search, bounded CSV and eligible-ticket
partial TEST refunds. Setup uses one reviewed 51-step installer, an opt-in
synthetic event/tier, and explicit Auth/staff mapping.

Read [installation](RELEASE_FIRST_RUN.md), [remixing](REMIXING.md),
[licensing](../LICENSE.md) and [security reporting](../SECURITY.md).

## Evidence and limits

The unchanged private application passed a hosted synthetic purchase, actual
provider fulfillment, fresh recovery/account link, organizer tools, door and
denial checks, and one partial refund. The clean source package passed frozen
dependency install, build and types; the installer passed 192 local regression
checks and a real disposable Supabase/Auth/Data API rehearsal with 73 assertions.
The disposable backend was removed. Those results are retained, not a claim that
each new remix has already passed provider acceptance.

Physical-phone camera scanning and unaided independent human installation are
**unverified accepted TEST-beta limitations**. USD only; zero added fees; no tax
calculation, offline scanning, seating/waitlist/resale features or complete event
administration UI. CSV is capped at 500 matching rows. Operator URLs retain six
gated `/staging/` paths for compatibility; signing in does not grant staff access.

The exact source manifest and archive checksum identify the release bytes, not
proof of publisher identity or complete security/legal clearance. Upstream notice
collection is bounded: 497 texts from the collector's platform, with 244 absent
locked entries and 36 missing root notices explicitly recorded. Dependency
binaries/node_modules and festival media are not part of this source archive.
Review what actually ships in any later binary/bundled distribution.

## License transition and update discipline

The Foundation's selected beta terms are PolyForm Shield 1.0.0 with the separate
Analog Tickets Additional Permissions. This is not OSI-approved open source.
Earlier Apache grants and third-party licenses remain in force; see
[the pinned prior-source record](PRIOR_SOURCE_LICENSES.md). The previous app's
history is preserved, but its old migrations, workflows and runtime files are
not mixed into the beta working tree.

The code release and clean remix template are separate from the Cosmico showcase.
No mask, wordmark, photograph, festival font or Artist Assets are granted. Keep
price calculation, authorization and fulfillment contracts separate from theme
edits. Stop on uncertain TEST payment/refund outcomes and reconcile retained
records rather than submitting another charge.
