# Open-source sanitization status — Gate 2 (clean private baseline)

Scope of this gate: a focused, reversible sanitization pass in the private
project only. No publish, no visibility change, no GitHub/Stripe/Dropbox/
Meta/Resend connection, no secret updates, no database writes, no changes to
any production deployment.

## What was removed or neutralized

**Data files**
- Deleted `public/data/sales-2024.csv` and `public/data/sales-2025.csv`
  (and the now-empty `public/data/` directory). Not tombstoned.

**Environment and backend configuration**
- Deleted `.env` completely. It previously held environment-specific Supabase
  values (project URL, project id, publishable key) and was present in the
  working tree. It is gone, not tombstoned.
- Deleted `supabase/config.toml`. It carried a project-specific Supabase ref
  and there is no checked-in migration baseline that depends on it.
- `.env.example` is the only environment file in the tree. It contains
  placeholder values for the three public client variables only
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`). No real URL, id, key, token, email,
  domain, or credential.
- `.gitignore` ignores `.env` and `.env.*` while allowing `.env.example`.
- **No project-specific backend identifiers remain in tracked configuration.**
  A contributor must supply their own values in a local, git-ignored `.env`.

**Hardcoded backend identifiers**
Every hardcoded backend project ref in application source was replaced with a
value derived from `VITE_SUPABASE_URL`, with a safe no-op when unset:
- `src/lib/preload.ts` (preconnect origin)
- `src/lib/lazy-with-retry.ts`, `src/lib/global-error-monitor.ts`,
  `src/components/ErrorBoundary.tsx` (client-error reporting endpoint)
- `src/components/WebhookMonitor.tsx` (webhook URL shown in the admin UI)
- `src/pages/may/Mixtape.tsx`, `src/components/my-tickets/shared.tsx`
  (public storage asset bases)
- `src/test/mocks/handlers.ts` (MSW mock base URL)

**Production hostnames**
- `index.html` and `src/main.tsx` production-host allowlists now contain
  neutral placeholders (`example.test`) with a comment to configure before
  deploying. `src/test/cache-bust.test.ts` was updated to match.
- `src/lib/global-error-monitor.ts` third-party-script detection now derives
  the first-party domain from `window.location` instead of a hardcoded one.
- `index.html` Open Graph / Twitter URLs use `https://example.test`.

**Smoke tests can no longer hit a production-like environment**
- `scripts/smoke-prepublish.ts` has no defaults at all. It requires
  `SMOKE_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`
  and exits `2` with an actionable message listing the missing variable and a
  copy-pasteable invocation. The previously embedded anon key is gone.
- `.github/workflows/e2e-tests.yml` no longer defaults `BASE_URL`; it fails
  fast with an explicit error if the repository variable is unset.
- `e2e/ticketing.spec.ts` no longer branches on a production hostname.
- `scripts/load-test-checkout.js` usage example uses a placeholder.

**Documentation**
- `docs/MISSION_CRITICAL_RUNBOOK.md` and all other docs use
  `https://example.test`, `contact@example.test`, and
  `<supabase-project-ref>`. No replacement credentials were invented.

**Secret-configuration workflow**
- No file in the tree asks anyone to populate production secret names or
  values. `docs/SECRETS_SETUP.md` contains only generic guidance: secrets are
  supplied locally to your own runtime and are never committed.

## No-secrets rule

This repository contains no secrets and must never contain any. Client-side
`VITE_*` variables are compiled into the browser bundle and may hold public
values only. All server-side credentials are supplied at runtime from a secret
store owned by whoever deploys the app.

## Intentionally left for later gates

Not touched here, by instruction:

- **Event-specific product copy, branding, and routes.** Marketing pages under
  `src/pages/may/**` and `src/pages/sessions/**` still contain event-specific
  names, dates, copy, and contact addresses. Route structure is unchanged.
  → Gate 3 (modularization).
- **Event-specific image/asset directories** under `src/assets/**` and
  `public/images/**`. → Gate 3.
- **Edge functions** (`supabase/functions/**`). These still contain
  event-specific sender addresses, links, and copy. They were deliberately not
  edited: changing them would alter edge-function behavior, which is out of
  scope for this gate. → Gate 3.
Note: `supabase/config.toml` and `.env` are **no longer** deferred — both were
deleted in the corrective pass above. Because the hosting platform regenerates
them from whatever backend a deployment is connected to, a fresh clone must
create its own local `.env` from `.env.example`; the build reads no
project-specific identifier from tracked files.

## Production connections

None were touched. No integration was connected or reconfigured, no secret was
created, read, or updated, no database or storage object was written, and no
publish or visibility change was made.

## Known limitation

Lovable chat history cannot be modified from the working tree. Prior
conversation turns in this project still reference the inherited
secret-configuration request and its secret names. That history is outside
repository scope and remains as-is.

## Gate 3 · Slice 6B — frontend/demo genericization

Done in this pass (frontend and demo content only):

- Document title/description/OG defaults now come from the fictional
  **Analog Commons** `EventConfig` (`applyDefaultDocumentMeta` in
  `src/platform/config/siteIdentity.ts`, applied by `EventConfigProvider`);
  `index.html` static defaults were rewritten to match.
- Production event names replaced throughout frontend copy: Analog Reunion →
  Analog Commons, Cosmi/Cosmico → Analog Commons, Wildhaven/Dawn Ranch →
  Example Meadow, Winter Escape → Winter Commons, real locality names →
  Example Valley / Example County / Example River, dates → the demo schedule.
- Operational email identities (`@cosmi.co`, `@app.cosmi.co`, `cosmico.lovable.app`)
  replaced with fictional `example.org` placeholders; admin sender defaults are
  labelled demo-only. Edge-function sender logic is untouched.
- Real founder/staff names replaced with "Demo Organizer" placeholders.
- `src/data/wineries.ts`, `foodVendors.ts`, `saunaVendors.ts` rewritten as
  clearly labelled fictional Analog Commons demo data (no real producers,
  people, handles, or websites). Slugs changed; the few pages that referenced
  slugs directly were updated.
- Legal surfaces (`/terms`, `/privacy`, giveaway rules) now render
  `DemoLegalNotice`: illustrative placeholder language, not legal advice.
- README rewritten as a generic remixable festival website + ticketing
  platform description with the Lovable remix workflow and the demo event.
- `src/test/brand-genericization.test.ts` scans `src/`, `index.html` and
  `README.md` for the named production brands, domains, organizer names, and
  real vendor data.

Intentionally left in place (deferred):

- `supabase/functions/**` — edge function names (e.g. `create-cosmico-checkout`)
  and sender logic; the frontend must keep calling them.
- Binary assets and asset filenames under `src/assets/**` and `public/**`
  (including event photography, fonts, maps). No binaries were deleted,
  renamed, or replaced; no font licensing action was taken.
- Legacy `cosmico_` localStorage/UTM/error-monitor keys (storage identifiers,
  not visible copy) and generated database column names such as
  `class_from_wildhaven`.
- Internal runbooks under `docs/` that record past operations.

Verification: typecheck clean; `bun run build` succeeds; full vitest run is
218 passed / 1 failed with 2 failing files — both pre-existing and unrelated
(`lodgingBookingsRlsPolicy` needs the removed `supabase/config.toml` baseline,
`VolunteerInterests` filter logic).
