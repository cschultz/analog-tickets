# Open-source release baseline

This repository is a remixable festival website + ticketing platform. It ships
with **no production backend reference and no secrets**.

## Package manager

npm is the single supported package manager. `package-lock.json` is the only
authoritative lockfile — install with:

```sh
npm ci    # reproducible install (CI)
npm i     # local development
```

Do not commit lockfiles from other package managers.


## Bring your own backend

Every remixer must create and configure their own Supabase project:

1. Create a Supabase project under your own account (or use Lovable Cloud,
   which provisions one for you).
2. Copy `.env.example` to `.env` and fill in your own
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, and
   `VITE_SUPABASE_PUBLISHABLE_KEY`. `.env` is git-ignored.
3. If you use the Supabase CLI, copy `supabase/config.example.toml` to
   `supabase/config.toml` and set your own `project_id`.
   `supabase/config.toml` is git-ignored so a real project ref can never be
   recommitted. The Lovable platform regenerates this file locally for
   preview; that regenerated copy stays untracked.
4. Server-side credentials (payments, email, SMS, analytics) are supplied at
   runtime through your own secret store. See `docs/SECRETS_SETUP.md`.

## No production reference is included

- No Supabase project ref, URL, or key is tracked in this repository.
- No API keys, tokens, signing secrets, or customer PII are tracked.
- Frontend copy, demo data, and metadata describe the fictional
  **Analog Commons** demo event.

## Database schema and migrations

There is **no checked-in schema or migration baseline yet**. A fresh clone
therefore has no tables, functions, or RLS policies, and any data-backed
surface will fail until a schema exists. Producing that baseline is a
**separate Gate 5 slice** and is intentionally out of scope here — nothing in
this slice creates or modifies schema.

## License decision — PLACEHOLDER

**No license has been chosen yet.** Until a `LICENSE` file is added, this code
is *not* open source and carries no grant of rights. The license decision is
deferred to a later gate.

<!-- TODO(gate5): choose and add a LICENSE file (candidates: MIT, Apache-2.0). -->
