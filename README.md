# Analog Tickets — v0.1 source-available TEST beta

A self-hosted ticketing application for developers evaluating a remixable event
website and a standardized checkout. This release is **TEST-only**, not a
service for selling real admission. The Foundation's original code is
source-available under PolyForm Shield 1.0.0 with Analog Tickets Additional
Permissions; see [LICENSE.md](LICENSE.md) and [the licensing FAQ](docs/LICENSING_FAQ.md).
Organizer use and paid developer assistance are expressly permitted; competing
platform products/services require a separately negotiated commercial license.
This is not unrestricted open source. Earlier Apache grants remain valid for
the earlier public source and applicable retained portions; see
[prior-source licensing](docs/PRIOR_SOURCE_LICENSES.md).

## What you can evaluate

- Guest checkout without a required account; optional account linking afterward.
- Ticket quantities, fixed/percentage promotion codes, saved price breakdowns,
  and deterministic partial-refund amounts.
- Stripe TEST checkout and signature-verified webhook fulfillment.
- Receipt/recovery links captured in Mailtrap Email Testing, ticket passes,
  online door scanning, and duplicate-scan denial.
- Event-scoped organizer search, bounded CSV export, promotion editing, and
  eligible-ticket TEST refunds.

## Start here

Get the versioned TEST-beta release from
[GitHub releases](https://github.com/cschultz/analog-tickets/releases), or clone
the repository and check out its published TEST-beta tag. Use the archive
checksum and source manifest supplied with that release, not a private editor
copy or the older Apache application's installation commands.

For a Lovable copy, follow [remixing](docs/REMIXING.md). The clean template is
separate from the Cosmico showcase. A remix is code, not a ready-to-sell event;
you still need your own isolated TEST backend and configuration.

Follow [the first-run guide](docs/RELEASE_FIRST_RUN.md). It separates a
credential-free source build, installation on an empty TEST backend, and optional
provider acceptance. The current schema is the generated **51-step** installer;
do not replay individual historical migration files.

The package includes a locked Bun dependency graph, a source checksum manifest,
SQL artifact verification, and a documented synthetic acceptance checklist. It does
not include Git history, private development reports, or festival media. The
public Git repository preserves its earlier public history; the versioned
source archive contains only the current curated tree.
Lovable is an optional editor/preview surface, not a required application server.
A visual remix alone does not install a backend or transfer provider access.

`.env.example` lists only current TEST configuration names, with every value
blank and every workflow disabled. `.gitignore` excludes populated local settings
and generated output; use secure process/host settings for credentials.

`THIRD_PARTY_NOTICES.txt` preserves collected upstream notice texts and their
hashes. `THIRD_PARTY_INVENTORY.json` identifies every locked dependency and
explicitly marks absent packages and missing root notices. Collection is offline
and platform-dependent, not a complete distribution-license clearance. No
dependency binaries or `node_modules` are included. Review notices against the
final source/binary distribution; these files do not license the app itself.

## Deliberate limits

- USD only; no free/sub-minimum checkout or newly enabled 100% discount codes.
- Added fees are zero. Tax is not calculated; this is not a tax-exemption claim.
- Email goes only to synthetic recipients in Mailtrap Email Testing. No live
  payment or real-recipient email setup is supplied.
- No offline scanning, reserved seating, waitlists, resale, or complete event
  administration UI. Event/ticket setup currently uses reviewed database setup.
- Organizer CSV is capped at 500 matching rows; narrow an oversized export.
- Six gated operator routes still use `/staging/` names. They are not public
  administration access and do not grant a signed-in user staff permissions.
- Physical-phone camera scanning and unaided independent human installation
  are **unverified**. These are accepted limitations of this TEST beta, not
  successful tests or claims established by a source build. Validate both for
  your own deployment before relying on it for an event.

## Branding, support and release status

The Cosmico demonstration is a separate showcase. Its wordmark, photographs,
fonts, the mask logo, and Artist Assets are not licensed or included here.
The release default is a neutral catalog and text-only checkout brand,
using system fonts and no festival media. Customize the catalog presentation
in `src/routes/index.tsx` and `src/components/test-beta.css`, and the restrained
checkout brand in `src/lib/checkout-branding-config.ts`. Keep checkout behavior,
server-owned pricing and authorization separate from theme edits. The private
showcase remains unchanged by these candidate-only presentation replacements.
Its unused component, stylesheet and festival-specific content configuration
are excluded from the export as well; a remixer does not inherit that archive
copy or a claim to the festival's assets. Package verification resolves local
and `@/` imports against the final generated source before staging.

The commercial contact and Foundation mailing address are in [NOTICE.txt](NOTICE.txt).
General inquiries may use the [Foundation contact form](https://lp.foundation/about).
No guaranteed support is included. For private vulnerability reports follow
[SECURITY.md](SECURITY.md), not the website inquiry form or a public issue.
The source-package review records bounded notice coverage, not legal or binary
distribution clearance. This published TEST-beta source does not activate live
payments, real-recipient email or a shared production backend. Read
[release notes](docs/TEST_BETA_RELEASE.md) and keep the disclosed limits visible
when adapting it. Do not publish secrets or synthetic access tokens in an issue,
screenshot or exported project.
