# GitHub canonical source and Lovable remix workflow

**Status:** Private staging repository created; public GitHub release and Lovable publication remain explicitly pending Chris's approval.

**Canonical repository:** `cschultz/analog-tickets` (private, default branch `main`).

**Scope:** This document describes the intended distribution architecture for Analog Tickets. The private production Cosmi system remains separate and is never the source for public remixes.

## Roles

| Platform | Purpose |
|----------|---------|
| **GitHub** | Canonical source repository; currently private staging. |
| **Lovable** | Remix and build experience; the working project remains private and unpublished. |
| **Production Cosmi** | Separate private deployment, data, secrets, and integrations. |

## Release flow

```
private Lovable review
       |
       v
private GitHub staging
       |
       v
Chris approval gate
       |
       v
public GitHub release (future)
       |
       v
Lovable remix / template (future)
       |
       v
remixer creates their own backend
```

The private repository was created as a fresh repository so its history begins with the sanitized transfer. It contains source and documentation only; photographic binaries remain withheld pending rights clearance.

## Current safeguards

- GitHub repository visibility: **private**.
- Lovable project visibility: **private**; `is_published: false`.
- Production Cosmi was not renamed, connected, deployed, or modified.
- No database schema, live secrets, payment credentials, or external integrations were transferred.
- The repository contains no `.env` file or customer sales exports.
- Each remixer must supply their own backend, secrets, storage, payment account, and integrations.

## Requirements before public release

- Complete the publication checklist, including backend/schema/RLS and edge-function review.
- Clear or replace all photography, video, fonts, logos, and partner marks.
- Confirm the clean repository history and run a fresh-clone and actual Lovable-remix test.
- Review legal placeholder pages with appropriate counsel.
- Obtain Chris's explicit publication authorization for GitHub, Lovable, or both.

No setting in this document authorizes publication or visibility changes.
