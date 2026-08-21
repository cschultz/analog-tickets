# GitHub canonical source and Lovable remix workflow

**Status:** Proposed workflow — not yet implemented. No GitHub repository has been created, connected, or published.

**Scope:** This document describes the intended distribution architecture for the `festival-platform` remixable source code and any Lovable remix templates derived from it. The private production Cosmi system remains a separate, non-public project and is never the source for public remixes.

---

## Roles

| Platform | Purpose |
|----------|---------|
| **GitHub** | Canonical public source repository for the festival platform. |
| **Lovable** | Remix and build experience. Users open the project from the GitHub canonical repo and start customizing. |
| **This private project** | Internal review and development workspace. Changes reach the canonical repo only through an explicit approval gate. |

## Proposed release flow

```text
private review branch
       |
       v
Chris approval gate
       |
       v
GitHub canonical public repository
       |
       v
Lovable remix / template
       |
       v
remixer creates their own backend
```

1. Development and review happen in this private project.
2. Once a gate is complete, Chris approves the set of changes for release.
3. Approved changes are pushed to a public GitHub repository with a clean, secret-free history.
4. Lovable imports the GitHub repository as a remixable project or template.
5. Each remixer provisions their own backend, secrets, and integrations; they never connect to production Cosmi.

## Repository hygiene expectations

The canonical GitHub repository must satisfy the following before any public release or remix publication:

- **License:** Apache License 2.0 in the root `LICENSE` file (see [`LICENSE_OPTIONS.md`](./LICENSE_OPTIONS.md)).
- **No secrets:** No `.env`, Supabase project refs, API keys, tokens, signing secrets, or payment credentials.
- **No customer data:** No attendee lists, sales exports, email lists, or PII.
- **No production backend references:** No real Supabase URLs, project IDs, or webhook endpoints pointing to production systems.
- **Rights-cleared media only:** All fonts, photography, video, logos, and partner marks cleared for redistribution or replaced with generic assets.
- **Authoritative package manager:** `npm` with `package-lock.json`; no alternate lockfiles committed.
- **Contribution model:** Issue templates, contribution guidelines, code of conduct, and security policy.
- **Release checklist:** All items in [`PUBLICATION_READINESS_CHECKLIST.md`](./PUBLICATION_READINESS_CHECKLIST.md) resolved and signed off.

## What is intentionally not automated yet

The following steps require explicit manual action and are not performed by any script in this slice:

- Connecting this private project to a GitHub repository.
- Changing Lovable project visibility or publication settings.
- Publishing the project as a Lovable remix or template.
- Provisioning CI secrets or GitHub Actions runner credentials.
- Provisioning databases, auth providers, or storage for remixers.
- Connecting Stripe, Dropbox, Meta, Resend, or other external integrations.

## History and production isolation

The canonical GitHub repository must start from a clean, rewritten history or a fresh repository that contains no prior commit references to production identifiers, secrets, or customer data. The private production Cosmi system is not renamed or repurposed as the public project; it remains a separate deployed instance with its own data and secrets.

## Related documents

- [`PUBLICATION_READINESS_CHECKLIST.md`](./PUBLICATION_READINESS_CHECKLIST.md) — release readiness checklist.
- [`OPEN_SOURCE_RELEASE_BASELINE.md`](./OPEN_SOURCE_RELEASE_BASELINE.md) — bring-your-own-backend contract for remixers.
- [`LICENSE_OPTIONS.md`](./LICENSE_OPTIONS.md) — license decision and approval.
- [`REMIXER_BACKEND_CONTRACT.md`](./REMIXER_BACKEND_CONTRACT.md) — backend/schema expectations for a fresh clone.
- [`PLATFORM_MODES.md`](./PLATFORM_MODES.md) — site, ticketing, and integrated platform modes.
- [`SECRETS_SETUP.md`](./SECRETS_SETUP.md) — how a remixer supplies secrets at runtime.
