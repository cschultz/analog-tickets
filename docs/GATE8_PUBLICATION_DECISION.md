# Gate 8 — Publication Decision Record

**Status:** Closed — no public release authorized by this document.

**Date:** 2026-08-21

**Verified baseline commit:** `c1dc847f7de4e708db5104600046bac22b1e6007`

**Scope:** This document records the current publication-readiness state of the
private `festival-platform` project. It applies only to the private working copy
and does not authorize any public release, GitHub publication, Lovable remix,
or deployment.

---

## Current State

- The project is **private and unpublished**.
- The project is **not connected to GitHub**.
- **Production Cosmi** data, services, domains, and secrets remain isolated from
  this repository and were not modified by any open-source readiness gate.
- No publication, visibility change, or deployment action has been performed.

---

## Completed Gates

The following readiness work has been completed in the private project:

| Gate | Summary |
| --- | --- |
| Gate 2 | Removed `public/data/sales-*.csv`, tracked `.env`, and production identifiers from frontend/docs. Created `.env.example` and `docs/OPEN_SOURCE_SANITIZATION_STATUS.md`. |
| Gate 3 | Modularized the frontend into `src/modules/site`, `src/modules/ticketing`, `src/modules/admin`, and `src/modules/box-office`. Introduced a Zod-validated `EventConfig` contract and platform mode resolver (`site` / `ticketing` / `integrated`). Documented in `docs/PLATFORM_MODES.md`. |
| Gate 5 | Hardened security: DOMPurify for HTML, `AdminGuard`/`BoxOfficeGuard` route boundaries, PII-logging regression tests, redirect hardening (`src/lib/safeRedirect.ts`), Zod env validation, `SetupRequired` screen, and `LICENSE` (Apache-2.0). Created backend contract inventory and dependency/license docs. |
| Gate 6 | Established brand architecture: `Analog Commons` umbrella, `Analog Tickets` platform name, `Cosmico` as a non-active demo. Added `DemoSiteNotice` and `docs/BRAND_ARCHITECTURE.md`. |
| Gate 7 | Performed controlled bare-remix validation (`docs/REMIX_VALIDATION_REPORT.md`). Made tracking opt-in via `src/platform/config/tracking.ts`. Removed hardcoded production analytics identifiers. Cleaned remaining frontend production event UUIDs and external links into config-driven helpers (`src/platform/config/eventIds.ts`, `src/platform/externalLinks.ts`). |

---

## Remaining Release Blockers

Updated after Gate 9 (backend genericization), approved by Chris Schultz on
2026-08-21 and applied in source only.

### Resolved by Gate 9

1. ~~**Edge-function `SITE_URL` fallback**~~ — every production-domain fallback
   is now the reserved, non-routable placeholder `https://example.invalid`, and
   `supabase/functions/_shared/operator-config.ts` provides a validated
   `getSiteUrl()` plus a `requireSiteUrl()` that throws when unconfigured.
2. ~~**Real backend operator emails**~~ — all sender, reply-to, alert, CC and
   platform-admin addresses now come from `OPERATOR_*` /
   `PLATFORM_ADMIN_EMAILS` environment variables with empty defaults. No real
   address remains in source.
3. ~~**Production event UUIDs in edge functions**~~ — replaced with
   `getEventId(...)`, defaulting to the nil UUID.

Additionally scrubbed in Gate 9: live Stripe price ids (now `STRIPE_PRICE_*`
env vars), legacy `Analog Reunion` brand strings in backend copy, and four
one-off customer-recovery functions that embedded real customer PII
(`admin-charge-wynona`, `attach-stephanie-pm`, `send-stephanie-recovery`,
`send-cashbust-followup`), which were deleted after confirming no caller.

Static proof: `src/test/backend-identifiers.test.ts`.

### Still open

1. **Partner-named routes and assets** — route slugs and asset filenames (e.g.,
   `/sessions/analogxh2hotel`, `hero-h2hotel.webp`) retain a real partner name.
   The outbound booking links and promo code on that page are already disabled
   by default, but the names remain in the repo.
2. **Legacy edge-function directory names** — a few function names still carry
   legacy wording (`create-cosmico-checkout`, `sync-ar2026-only`). Retained
   deliberately: they are the deployed invoke contract. Not judged a blocker,
   recorded for transparency.
3. **Git history** — the repository history still contains every pre-scrub
   value. A fresh repository or a full history rewrite is mandatory before any
   public release.
4. **GitHub canonical-source setup** — the project is not connected to GitHub,
   has no public repository, and has no scrubbed commit history.

These remaining blockers require separate approval.

---

## Required Approvals

Publication cannot proceed until Chris Schultz has explicitly approved both of
the following, in writing, outside of this document:

### Part A — Backend Genericization — APPROVED 2026-08-21 (Chris Schultz)

Granted and applied in Gate 9, source only (no deployment, no schema change, no
secret rotation, no production invocation):

- `supabase/functions/` sources (`SITE_URL` fallback, real operator emails,
  production event UUIDs, live Stripe ids, customer PII) — done.
- Remaining server-side references to `cosmi.co`, `Analog Reunion`, or
  production operator identities — done.
- Storage bucket policies and RLS review.
- Webhook endpoint signatures and idempotency review.

### Part B — Publication & Visibility

Approval to connect the project to GitHub, create or expose a public repository,
change Lovable project visibility, or publish a Lovable remix template:

- GitHub repository creation and history scrubbing.
- Lovable project visibility, badge, and Trust Center settings.
- Final publication authorization (public GitHub release, Lovable remix, or
  both).

---

## Authorization Statement

**No public release is authorized by this document.** The project remains
private, unpublished, and unconnected to GitHub. Any future release requires the
two-part approvals listed above and resolution of all remaining release blockers.

---

## Related Documents

- [docs/OPEN_SOURCE_SANITIZATION_STATUS.md](OPEN_SOURCE_SANITIZATION_STATUS.md)
- [docs/REMIX_VALIDATION_REPORT.md](REMIX_VALIDATION_REPORT.md)
- [docs/BRAND_ARCHITECTURE.md](BRAND_ARCHITECTURE.md)
- [docs/PLATFORM_MODES.md](PLATFORM_MODES.md)
- [docs/GITHUB_CANONICAL_SOURCE.md](GITHUB_CANONICAL_SOURCE.md)
- [docs/PUBLICATION_READINESS_CHECKLIST.md](PUBLICATION_READINESS_CHECKLIST.md)
- [docs/SECRETS_SETUP.md](SECRETS_SETUP.md)
- [docs/PHOTOGRAPHY_MEDIA_INVENTORY.md](PHOTOGRAPHY_MEDIA_INVENTORY.md)
- [LICENSE](../LICENSE)
