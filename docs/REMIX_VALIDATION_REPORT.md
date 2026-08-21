# Remix validation report (Gate 7, Slice 23)

**Commit under review:** `d0f28b7b481e69a8d3d63afee2d3aecef8210837`
**Date:** 2026-08-21
**Scope:** read-only validation in the private working copy. No GitHub clone, no
Lovable remix, no publication, no deployment, no database/edge-function/
integration/dependency/asset changes were performed. The only file added by this
slice is this report.

## What "bare remix" means here

A real external remix was **not** performed. Instead the tracked contents of the
commit were exported with `git archive HEAD` into a clean directory (so the
git-ignored `.env` and `supabase/config.toml` were absent), all `VITE_*`
variables were cleared from the build environment, and the app was built and
loaded in a headless browser. This approximates a fresh clone with no
configuration; it does not substitute for the manual checks listed at the end.

## Configuration surfaces inspected

| Surface | Finding |
| --- | --- |
| `.env.example` | Placeholders only (`<supabase-project-ref>`, `<publishable-anon-key>`). No real values. |
| `.gitignore` | Ignores `.env` and `.env.*`, with `!.env.example` re-included. |
| Tracked env/config | `.env` and `supabase/config.toml` are untracked (`git ls-files` reports no match). `supabase/config.example.toml` carries a placeholder ref. |
| `src/main.tsx` → `shouldRenderSetupScreen()` | Startup gate runs before the app graph is imported, so the backend client is never constructed when config is missing. |
| `src/platform/config/env.ts` | Zod-validated public env; importing never throws; errors name variables only, never values. |
| `src/platform/config/SetupRequired.tsx` | Dependency-free screen listing required variable names only. |
| `package.json` scripts | `dev`, `build`, `build:dev`, `lint`, `preview`, `typecheck`, `smoke` (`smoke` requires `SMOKE_BASE_URL` / `VITE_SUPABASE_URL`). |
| `README.md` setup section | Generic clone/`npm i`/`npm run dev` plus "copy `.env.example`"; no real refs, keys, endpoints, or customer data. |
| `docs/SECRETS_SETUP.md` | Generic guidance, deliberately lists no production secret names or values. |

## Checks run

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass |
| Focused tests | `vitest run` over `platform/config`, `platform/modes`, `routes/__tests__`, `branding`, `brand-genericization`, `no-pii-logging`, `safeRedirect`, `sanitizeHtml` | Pass — 11 files, 80 tests |
| Production build (configured) | `npm run build` | Pass |
| Bare-clone build (no env at all) | `git archive HEAD` → clean dir → `vite build` with every `VITE_*` unset | Pass |
| Bundle secret scan | grep of bare-clone `dist/` for the backend project ref, the publishable key, and `cosmi.co` | No matches |
| Unconfigured startup, in browser | headless Chromium against the bare-clone build | Setup screen rendered; see below |

## Unconfigured startup behaviour (verified)

Loading the bare-clone build produced:

- `<h1>` = "Backend configuration required", with the three required variable
  names and pointers to `.env.example`, `docs/OPEN_SOURCE_RELEASE_BASELINE.md`
  and `docs/SECRETS_SETUP.md`.
- **Zero requests to any backend/Supabase origin.**
- Zero console errors and zero uncaught page errors.

The bare remix therefore fails closed and does not contact production backend
services.

## Blocker found — RESOLVED in Slice 24

**`index.html` hardcoded production analytics and advertising identifiers, and
they fired on an unconfigured bare remix.** While the setup screen was displayed
— with no backend configured at all — the page still issued outbound requests to
Google Tag Manager, GA4, Google Ads conversion endpoints, Meta/Facebook pixels,
and a third-party script host. The container/measurement/pixel IDs were committed
literals in `index.html` (GTM container, GA4 property, two Google Ads
conversion IDs, two Meta pixel IDs, plus a third-party content script host).

Consequences that made this a release blocker:

1. Every remixer's traffic would be reported into the original operator's
   analytics and ad accounts.
2. The IDs are production identifiers that should not ship in an open-source
   template.
3. Trackers loading before any consent or configuration is a privacy problem
   independent of the ownership issue.

**Resolution (Slice 24):** all identifiers were removed from `index.html` and
from `src/components/AnalyticsTracking.tsx`. Tracking is now resolved at runtime
from optional `VITE_*` variables via `src/platform/config/tracking.ts`. With no
variables set — the default fresh remix — no tag manager, analytics, pixel or
third-party script is injected and no tracking endpoint is contacted. Admin and
box-office paths never load tracking even when it is configured. Regression
coverage lives in `src/test/tracking-optin.test.ts`, which fails if any of the
former production identifiers reappear anywhere in `src/` or `public/`.


A second, lower-severity observation: **any** `VITE_*` variable present in the
build environment is inlined into the bundle by Vite. During validation a
`VITE_SUPABASE_ANON_KEY` variable that exists in this workspace's shell
environment (but not in the repository) was baked into an intermediate build.
This is a property of the build environment, not a repository leak, but release
builds should run from a clean environment and the resulting bundle should be
scanned.

## Manual checks still required before any public GitHub or Lovable release

1. Perform an actual `git clone` of the public repository into a clean machine
   and run `npm ci && npm run dev` with no `.env` present.
2. Perform an actual Lovable remix from the published project and confirm the
   remix boots to the setup screen without inheriting any credentials.
3. Re-run the bare-clone network check after Slice 24 on a real clone to
   confirm zero third-party requests end to end.

4. Genericize the `supabase/functions/**` sources, which still contain
   production domains, sender addresses, and personal names.
5. Clear third-party media, fonts, and photography rights
   (`docs/PHOTOGRAPHY_MEDIA_INVENTORY.md`).
6. Confirm the deployed backend of any demo instance carries no customer PII.
7. Decide whether `bun.lock` should remain alongside `package-lock.json`.
8. Have a human review `README.md`, `docs/SECRETS_SETUP.md`, and this report
   before publication.

---

## Slice 25 — residual production-assumption inventory (frontend remediated)

### Remediated in this slice (frontend / config only)

| Finding | Was | Now |
| --- | --- | --- |
| Primary event row UUID hardcoded in 6 surfaces (lineup, get-involved, volunteer interests, event photos, registrations, sales pacing) | `e40bacfe-…` literal | `getPrimaryEventId()` from `src/platform/config/eventIds.ts`, `VITE_PRIMARY_EVENT_ID`, nil UUID when unset |
| Lodging event row UUID in `FamilyStyleUnits` | `a2a74abc-…` literal | `getLodgingEventId()`, `VITE_LODGING_EVENT_ID` |
| Sessions event row UUID in the sessions RSVP page | `60ad3685-…` literal | `getSessionsEventId()`, `VITE_SESSIONS_EVENT_ID` |
| Operator social accounts (Instagram/Facebook/YouTube) in footers and photo credits | real handles | `configuredSocialLinks()` in `src/platform/externalLinks.ts`, unset by default (icons not rendered) |
| Operator newsletter link | real Substack URL | `NEWSLETTER_LINK`, unset by default |
| Producing charity name, website, and postal address in footers, terms, privacy, giveaway rules, ticket page | real 501(c)(3) name/URL/address | `PRODUCER` / `PRODUCER_DISPLAY_NAME` / `PRODUCER_PLACEHOLDER`, unset by default; attribution blocks are omitted entirely when unset |
| Merchandise/book link | real retailer deep link | `STORE_LINK`, unset by default |
| Partner hotel booking-engine URLs and live promo code on the sessions page | two booking URLs carrying chain/hotel ids plus a real promo code | `SESSIONS_LODGING_PARTNERS` / `SESSIONS_LODGING_PROMO_CODE`, unset by default; the block renders nothing |

With no configuration, none of these surfaces link to, book with, or query
another operator's resources. Event-scoped queries resolve against the nil UUID
(`00000000-0000-0000-0000-000000000000`) and return no rows.

Regression coverage: `src/test/production-identifiers.test.ts` scans all
`src/**/*.{ts,tsx,html}` for the retired identifiers and asserts the
unconfigured resolvers return the nil UUID and no outbound links.

### Intentional backend contracts left unchanged (documented, not remediated)

1. **Edge-function names** (~150 under `supabase/functions/`). They are the
   contract between the frontend `supabase.functions.invoke(...)` calls and the
   deployed backend. A remix operator must deploy functions under the same
   names. Some names carry legacy wording (`create-cosmico-checkout`,
   `sync-ar2026-only`). Not a release blocker.
2. **Route slugs and asset filenames** that name a real partner (for example
   `/sessions/analogxh2hotel`, `hero-h2hotel.webp`). Renaming routes and assets
   was explicitly out of scope; the outbound links and promo code on that page
   are now unset, so the page no longer drives bookings to that partner.
3. **Storage bucket names** (for example `event-photo-covers`) are backend
   contracts and are generic already.

### Verification (this slice)

- Typecheck (`tsgo --noEmit -p tsconfig.app.json`): pass.
- Focused tests: `production-identifiers` (4), `branding`, `brand-genericization`,
  `tracking-optin` — all pass.
- Production build: pass.
- Pre-existing unrelated failure: `VolunteerInterests.test.ts > filters by
  contribution type` (filter logic, untouched by this slice).


---

## Slice 26 (Gate 9) — backend genericization

Approved by Chris Schultz, 2026-08-21. Source-only change: no deployment, no
schema/migration change, no secret rotation, no production invocation.

### Remediated

| Finding | Was | Now |
| --- | --- | --- |
| `SITE_URL` fallback in 114 edge functions | `https://cosmi.co`, `https://cosmico.org`, `https://cosmicofeast.com`, `https://cosmico.lovable.app`, `https://cosmico.lp.foundation` | reserved, non-routable `https://example.invalid`; `_shared/operator-config.ts` adds `getSiteUrl()` (validated, warns) and `requireSiteUrl()` (throws) |
| Platform admin recipient list | `cbschultz@gmail.com` literal | `PLATFORM_ADMIN_EMAILS` env, empty list by default (no alert is sent) |
| Sender/reply-to/alert/CC identities in `_shared/email-sender-config.ts` | `catchavibe@…`, `chris@…`, `noreply@app.…`, `inbox@app.…`, `alerts@…` | `OPERATOR_FROM_EMAIL`, `OPERATOR_REPLY_TO_EMAIL`, `OPERATOR_ALERT_EMAIL`, `OPERATOR_BRAND_NAME`, `OPERATOR_MAIL_DOMAIN`; empty string when unset, pipeline CC suppressed |
| Inbound-email internal/admin filters | real domains and personal addresses | `INTERNAL_EMAIL_PATTERNS` / `PLATFORM_ADMIN_EMAILS`, empty by default |
| Production event UUID `e40bacfe-…` in 3 edge functions | literal | `getEventId("PRIMARY_EVENT_ID")`, nil UUID when unset |
| Live Stripe price ids in 5 edge functions | `price_1S…` literals | `STRIPE_PRICE_*` env; canary/health checks report `skipped` when unset |
| One-off customer-recovery functions containing PII | `admin-charge-wynona`, `attach-stephanie-pm`, `send-stephanie-recovery`, `send-cashbust-followup` (real names, emails, `cus_`/`pi_` ids, promo codes) | deleted; they were operator one-offs with no caller anywhere in the repo |
| Legacy brand strings in backend email/chat copy | `Analog Reunion`, `Chris & Anne`, `Chris Schultz` | `Cosmico` / `The Cosmico Team` / `Event Organizer` |
| Hardcoded partner/producer emails and hosts | `mail.cosmico.live`, `cosmicoevents.com`, personal vendor mailboxes, an operator `lovableproject.com` host | `example.invalid` placeholders |

### Fail-closed behaviour with no configuration

- Links resolve to `https://example.invalid` (RFC 6761 reserved, never routes).
- Outbound mail has an empty From address, so notification helpers send nothing.
- Event-scoped backend jobs read the nil UUID and return no rows.
- Stripe canaries skip instead of retrieving another account's prices.

### Regression coverage

`src/test/backend-identifiers.test.ts` (23 assertions) statically scans every
file under `supabase/functions/` for each retired domain, mailbox, event UUID
and Stripe id, and asserts the fail-closed defaults in
`_shared/operator-config.ts` and `_shared/admin-notify-recipients.ts`.

### Residual risks after this slice

- Legacy wording persists in **edge-function directory names** and a few
  variable names. Deliberate: renaming breaks the deployed invoke contract.
- **`supabase/config.toml`** remains untracked/git-ignored; only
  `config.example.toml` ships.
- Partner-named **route slugs and asset filenames** are unchanged (see above).
- **Git history** still contains the pre-scrub values. A fresh repository or a
  history rewrite is required before any public release.
