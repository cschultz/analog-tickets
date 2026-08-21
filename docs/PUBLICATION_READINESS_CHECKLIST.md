# Publication Readiness Checklist

**Status:** This checklist is intentionally incomplete. Several high-risk items remain **unresolved** and require explicit approval from Chris before any public GitHub release or Lovable remix publication.

**Scope:** Applies to any public release of the `festival-platform` remixable source code or any Lovable remix template derived from it. Does not apply to the private preview-only development project.

**Related docs:**
- [Open Source Release Baseline](./OPEN_SOURCE_RELEASE_BASELINE.md)
- [Remixer Backend Contract](./REMIXER_BACKEND_CONTRACT.md)
- [Platform Modes](./PLATFORM_MODES.md)
- [Open Source Sanitization Status](./OPEN_SOURCE_SANITIZATION_STATUS.md)
- [Secrets Setup](./SECRETS_SETUP.md)
- [GitHub Canonical Source and Remix Workflow](./GITHUB_CANONICAL_SOURCE.md)


---

## 1. Source / Secret Isolation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | `.env` is not tracked and is listed in `.gitignore` | ✅ verified | `.gitignore` excludes `.env` and `.env.*` except `.env.example` |
| 1.2 | `.env.example` contains only placeholder public variables and no real values | ✅ verified | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` are placeholders |
| 1.3 | `supabase/config.toml` is not tracked; `config.example.toml` is a neutral template | ✅ verified | `.gitignore` excludes `supabase/config.toml`; example file contains no real `project_id` |
| 1.4 | No production Supabase URL, project ID, anon key, or service-role key in source | ✅ verified | Search performed; no live refs remain in `src/` or tracked config |
| 1.5 | No payment provider secrets, API tokens, webhooks, or signing keys in source | ✅ verified | Edge function env names are documented only as categories |
| 1.6 | No customer PII, email lists, or attendee data in source | ✅ verified | `public/data/sales-*.csv` were removed in earlier gate; demo data uses fictional examples |
| 1.7 | No hardcoded redirect URLs to `cosmi.co` or other production domains | ✅ verified | `example.org` and event-config-driven values used for frontend copy |

**Approver sign-off:** ___________________ Chris Schultz

---

## 2. Generic Identity / Copy

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | Production brand name "Analog Reunion" removed from frontend source and docs | ✅ verified | Replaced with fictional "Analog Commons" demo event |
| 2.2 | Production domain `cosmi.co` removed from frontend source and docs | ✅ verified | Replaced with `example.org` placeholders |
| 2.3 | Demo event config is clearly fictional and not tied to real dates/people | ✅ verified | `src/events/analog-commons/config.ts` uses neutral placeholder values |
| 2.4 | Legal pages (Terms, Privacy, Refund) are marked as illustrative templates | ⚠️ partial | Text has been genericized; must be reviewed by a legal professional before any release |
| 2.5 | No real vendor, artist, winery, or partner names in frontend data | ✅ verified | `src/data/` vendors/artists use fictional examples |
| 2.6 | No real email addresses or phone numbers in frontend source | ✅ verified | `example.org` and placeholder values used; edge function email identities remain in unreviewed backend code |

**Approver sign-off:** ___________________ Chris Schultz

---

## 3. Media / Font Licensing and Human-Privacy Clearance

> **⚠️ CRITICAL — DO NOT DELETE OR REPLACE ASSETS WITHOUT EXPLICIT APPROVAL.** This slice is documentation-only. Asset removal, replacement, or licensing review is a separate, gated decision.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | List of all binary assets in `public/` and `src/assets/` created and classified | ❌ unresolved | Inventory exists (`gate3-slice6a-inventory.md`) but has not been formally reviewed |
| 3.2 | Font files (Tay Losa, etc.) licensed for redistribution or replaced with open fonts | ❌ unresolved | Proprietary fonts remain in source; license terms not verified |
| 3.3 | Photography and video of identifiable people cleared for public distribution | ❌ unresolved | Event photography of attendees/performers remains in source; model/usage rights not verified |
| 3.4 | Partner/vendor logos and artist media cleared for redistribution | ❌ unresolved | Winery logos, artist photos, and partner marks remain |
| 3.5 | Duotone/filtered assets derived from real event photos reviewed for rights | ❌ unresolved | SVG duotone processing does not remove underlying rights requirements |
| 3.6 | Favicon, social-share preview, and OG imagery are generic or cleared | ⚠️ partial | Demo identity is generic; underlying imagery rights unresolved |

**Approver sign-off:** ___________________ Chris Schultz

---

## 4. Dependency / License Decision

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | License chosen and approved by Chris / legal counsel | ✅ verified | Apache License 2.0 selected; root `LICENSE` file added with "Copyright 2026 Launch Pad Foundation" |
| 4.2 | License compatible with all direct dependencies | ⚠️ partial | License chosen; dependency/media/font obligations remain separate and require their own clearance |
| 4.3 | Proprietary or copyleft dependencies flagged and handled | ⚠️ partial | `package.json` and `package-lock.json` exist; [Dependency Audit](./DEPENDENCY_AUDIT.md) performed; unresolved items remain |
| 4.4 | `private: true` removed from `package.json` if publishing to npm | ❌ unresolved | Currently marked private; intentional until release decision is made |
| 4.5 | `package.json` metadata matches intended distribution name | ✅ verified | Name changed to `festival-platform` |

**Approver sign-off:** ___________________ Chris Schultz

---

## 5. Backend / Schema / Migration and RLS Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | No production database schema or migration files committed | ✅ verified | `docs/REMIXER_BACKEND_CONTRACT.md` is an inventory only, not a schema |
| 5.2 | Remix backend contract documented for fresh-project build order | ✅ verified | See `docs/REMIXER_BACKEND_CONTRACT.md` |
| 5.3 | Required tables, RPCs, and edge functions implemented and tested | ❌ unresolved | No schema/migration baseline exists; this is a future Gate 5 slice |
| 5.4 | Row-Level Security (RLS) policies implemented and reviewed for all tables | ❌ unresolved | Auth/RLS assumptions documented as open questions only |
| 5.5 | `user_roles` table used correctly; no roles stored on `profiles` | ⚠️ partial | Frontend code assumes `user_roles`; RLS not verified |
| 5.6 | Admin/box-office route guards aligned with backend role checks | ✅ verified | `AdminGuard` and `BoxOfficeGuard` implemented; backend `has_role` RPC must match |
| 5.7 | Webhook endpoints verify signatures and are idempotent | ❌ unresolved | Edge function behavior not modified or reviewed in this gate |
| 5.8 | Payment intents and confirmation flows tested end-to-end | ❌ unresolved | No test backend exists in this repository |

**Approver sign-off:** ___________________ Chris Schultz

---

## 6. Security Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1 | All `dangerouslySetInnerHTML` call sites use a sanitized utility | ✅ verified | `src/lib/sanitizeHtml.ts` used across 21 sites; no raw calls remain in frontend |
| 6.2 | Admin routes enforce authentication + admin role at boundary | ✅ verified | `AdminGuard` in `src/routes/RouteWrappers.tsx` |
| 6.3 | Box-office data screens require authentication + admin/box-office role | ✅ verified | `BoxOfficeGuard` protects roster/manifest screens; scanner PIN flow preserved |
| 6.4 | Customer PII no longer logged in frontend | ✅ verified | `src/test/no-pii-logging.test.ts` regression check added |
| 6.5 | Centralized environment validation does not log secrets | ✅ verified | `src/platform/config/env.ts` validates without logging |
| 6.6 | Unconfigured clone renders a safe setup screen instead of crashing | ✅ verified | `SetupRequired.tsx` shown when required env vars are missing |
| 6.7 | CORS, content-security, and frame-options reviewed for remix templates | ❌ unresolved | No hosting/security headers audited |
| 6.8 | Server-side authorization and input validation reviewed in edge functions | ❌ unresolved | Edge functions not reviewed in this gate |
| 6.9 | Unsafe redirects, open redirects, and OAuth redirect_uri hardening | ❌ unresolved | Frontend uses `window.location.origin` but backend policies not verified |
| 6.10 | Upload/media storage buckets have appropriate RLS | ❌ unresolved | Storage policies not recreated or reviewed |

**Approver sign-off:** ___________________ Chris Schultz

---

## 7. Fresh-Clone / Remixer Setup Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | `npm ci` works from a clean clone with the single lockfile | ✅ verified | `package-lock.json` retained; `bun.lock`/`bun.lockb` removed |
| 7.2 | `npm run typecheck` passes without a configured backend | ✅ verified | Build-time validation is lazy |
| 7.3 | `npm run build` passes without a configured backend | ✅ verified | Setup screen handles missing env gracefully |
| 7.4 | README explains `.env.example` and backend setup | ✅ verified | See `docs/OPEN_SOURCE_RELEASE_BASELINE.md` |
| 7.5 | Platform modes (`site`, `ticketing`, `integrated`) documented and tested | ✅ verified | `docs/PLATFORM_MODES.md` and route tests |
| 7.6 | Demo event can run without payments or live integrations | ⚠️ partial | Setup screen renders; ticketing and checkout still require backend schema |
| 7.7 | No assumption that a production backend is reachable | ✅ verified | `VITE_SUPABASE_URL` is required but not defaulted to a live URL |

**Approver sign-off:** ___________________ Chris Schultz

---

## 8. GitHub Canonical Source and Lovable Remix Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 8.1 | GitHub repository created and configured with no secrets in history | ❌ unresolved | GitHub integration not connected; commit history still contains prior identifiers in older commits |
| 8.2 | `.gitignore` and history scrubbed for any leaked `.env` or `config.toml` | ❌ unresolved | Requires a new history-rewrite or new repo start; current working copy is clean but history is not |
| 8.3 | Lovable remix template settings reviewed (visibility, badge, Trust Center) | ❌ unresolved | No publication settings changed; default visibility unknown until publish |
| 8.4 | `README.md` describes the project as a remixable template, not a live event | ✅ verified | README genericized to festival platform |
| 8.5 | Issue templates and contribution guidelines prepared | ❌ unresolved | Not created |
| 8.6 | Code of conduct and security policy prepared | ❌ unresolved | Not created |

**Approver sign-off:** ___________________ Chris Schultz

---

## 9. Production Isolation and Publication Controls

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 9.1 | No deployment or publish action triggered by this gate | ✅ verified | This is a documentation-only slice |
| 9.2 | No changes to project visibility, custom domains, or GitHub integration | ✅ verified | None performed |
| 9.3 | No production Cosmi database, secrets, or integrations touched | ✅ verified | Scope restricted to private project files |
| 9.4 | No Stripe, Dropbox, Meta, Resend, or other live integrations configured | ✅ verified | Integration secrets not added |
| 9.5 | Clear decision documented that any future release must be a separate public project, not a rename of the private production project | ✅ verified | See baseline docs |

**Approver sign-off:** ___________________ Chris Schultz

---

## Named Approval Fields

I, Chris Schultz, confirm the following before any public release:

- [x] License choice approved: Apache License 2.0 (2026-08-21)
- [ ] Asset / media / font clearance approved or explicitly scoped for later removal
- [ ] Backend readiness: schema, RLS, webhooks, and payment flows reviewed and approved
- [ ] Security audit completed and critical findings resolved
- [ ] GitHub history scrubbed or new repository created with no leaked secrets
- [ ] Lovable publication visibility, badge, and Trust Center settings reviewed
- [ ] Final publication authorization: **APPROVED / DENIED / DEFERRED**

**Signature / Date:** ___________________ Chris Schultz, _______________

---

## Summary

| Category | Verified | Partial | Unresolved | Blocked |
|----------|----------|---------|------------|---------|
| Source / Secret Isolation | 7 | 0 | 0 | 0 |
| Generic Identity / Copy | 5 | 1 | 0 | 0 |
| Media / Font / Privacy | 0 | 1 | 5 | 0 |
| Dependency / License | 2 | 2 | 1 | 0 |
| Backend / RLS | 2 | 1 | 4 | 0 |
| Security | 6 | 0 | 3 | 0 |
| Fresh-Clone / Remixer | 5 | 1 | 0 | 0 |
| GitHub / Lovable Remix | 1 | 0 | 5 | 0 |
| Production Isolation | 5 | 0 | 0 | 0 |
| **Total** | **33** | **6** | **18** | **0** |

**Release recommendation:** **NOT READY** — 18 unresolved items remain. Do not publish to GitHub or as a Lovable remix until the approval fields above are completed and the unresolved items are resolved.
