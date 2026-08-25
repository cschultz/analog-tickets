# Publication readiness checklist

**Current scope:** public source repository only.  
**Repository:** `cschultz/analog-tickets`  
**Steward:** Launch Pad Foundation  
**License:** Apache-2.0

Chris Schultz authorized the public source release on 2026-08-25. This checklist distinguishes that source release from a live demo, Lovable remix template, or marketing launch.

## Public source release

| Check | Status | Evidence |
| --- | --- | --- |
| New dedicated `analog-tickets` repository | ✅ | `cschultz/analog-tickets` |
| Sanitized history / no inherited production history | ✅ | Separate repository with fresh sanitized history |
| Apache-2.0 license | ✅ | Root `LICENSE` |
| No customer or sales data | ✅ | Sales-data files removed; no customer data included |
| No credentials or live backend configuration | ✅ | `.env.example` uses placeholders; secrets supplied at runtime |
| Production Cosmi isolated | ✅ | No production database, schema, secrets, integrations, or domains touched |
| Uncleared and production-era media excluded | ✅ | Public package retains no uncleared binary media; see `docs/ASSET_RELEASE_GATE.md` |
| Public source release authorized | ✅ | `docs/GATE8_PUBLICATION_DECISION.md` |
| README identifies source-only release and steward | ✅ | Root `README.md` |

## Deferred before operating a real event

| Check | Status | Required before live use |
| --- | --- | --- |
| Fresh backend schema and RLS | ⏸ deferred | Build and review the remixer's own backend |
| Stripe checkout and webhook validation | ⏸ deferred | Configure and test the remixer's own payment account |
| Email/ticket delivery | ⏸ deferred | Configure and test the remixer's own provider |
| Full E2E against a fresh backend | ⏸ deferred | Run before selling tickets |
| Media, font, logo, and copy clearance | ⏸ deferred | Obtain rights and attribution for each asset |
| Legal pages | ⏸ deferred | Replace illustrative templates with counsel-reviewed policies |

## Separately deferred publication surfaces

These remain private and unpublished:

- Lovable project and preview URL
- Cosmico demonstration site
- Production Cosmi
- Custom domains and traffic promotion
- Public Lovable remix template, badge, or Trust Center settings

The public repository is a source release, not a current festival, ticket offer, hosted service, or marketing destination.
