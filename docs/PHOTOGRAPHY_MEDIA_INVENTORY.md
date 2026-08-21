# Photography / Media Rights Inventory

**Status:** Inventory and guidance only. This document does not grant, confirm, or transfer any rights. No assets have been copied, deleted, replaced, optimized, renamed, published, or otherwise modified in the creation of this document.

**Scope:** `festival-platform` open-source festival website + ticketing template.

**Related:**
- [Publication Readiness Checklist](./PUBLICATION_READINESS_CHECKLIST.md)
- [Open Source Release Baseline](./OPEN_SOURCE_RELEASE_BASELINE.md)
- [License Options](./LICENSE_OPTIONS.md)
- [Dependency Audit](./DEPENDENCY_AUDIT.md)

---

## Purpose

The `festival-platform` template currently contains real event photography, venue imagery, and partner/vendor marks carried over from the original private project. This inventory distinguishes:

- **Private source photography** — images from the original event production Dropbox, whose redistribution rights have not been verified for public release.
- **Template-eligible assets** — images that are either rights-cleared or generic enough to be safely included in a public, remixable festival template.

Nothing in this document is a substitute for a legal clearance or a photographer/attendee release. It is a starting point for Launch Pad Foundation to make explicit keep-or-remove decisions.

---

## Candidate source folders discovered in Dropbox

These folders were identified as potential sources of photography used in the original private project. They are **not** presumed to be cleared for public use.

| Folder | Attribution / likely photographer | Contents | Notes |
|---|---|---|---|
| `/Cosmico 2025 Photography/Cosmico 2025 Stills Joiner/` | Appears to be **J. James Joiner** | Event stills from the 2025 production | Photographer attribution visible; explicit redistribution / commercial-use permission still needs confirmation. |
| `/COSMICO/@bmaphoto - Film Camera/` | Appears to be **@bmaphoto** | Film-camera event images | Attribution visible; explicit redistribution / commercial-use permission still needs confirmation. |
| `/COSMICO/DAY1`, `/COSMICO/DAY2`, `/COSMICO/DAY3` and related 2024 folders | Not yet verified | Day-by-day event coverage | Photographer and rights metadata not yet verified. Likely contains identifiable attendees, performers, and venue-specific scenes. |
| `/{{título}} - Saul Landeros Fotografía/` | Appears to be **Saul Landeros Fotografía** | Property photography | Does not appear to be event photography; not presumed eligible for this project without separate confirmation. |

---

## Rights-status table

| Source folder | Likely photographer | Intended use in template | Identifiable people / minors risk | Logos / venue / event specificity | Redistribution status | Required action | Decision |
|---|---|---|---|---|---|---|---|
| `/Cosmico 2025 Photography/Cosmico 2025 Stills Joiner/` | J. James Joiner | Hero / lifestyle / editorial imagery | High — likely performers and attendees | High — event-specific scenes, branded backdrops, identifiable venue | **Uncleared** — not confirmed for public release | Contact photographer / rights holder; obtain written redistribution and attribution terms | Pending Launch Pad confirmation |
| `/COSMICO/@bmaphoto - Film Camera/` | @bmaphoto | Lifestyle / candid / editorial imagery | High — likely attendees and performers | High — event-specific film shots | **Uncleared** — not confirmed for public release | Contact photographer / rights holder; obtain written redistribution and attribution terms | Pending Launch Pad confirmation |
| `/COSMICO/DAY1`, `/DAY2`, `/DAY3` and related 2024 folders | Not verified | Day-of event coverage, crowd, performance, venue | High — crowds, minors, performers, staff | High — venue-specific and year-specific event content | **Uncleared** — photographer and rights metadata unknown | Identify photographer(s); verify rights and model releases; document attribution | Pending Launch Pad confirmation |
| `/{{título}} - Saul Landeros Fotografía/` | Saul Landeros Fotografía | Not intended for festival template unless unrelated | Unknown | Unknown — property photography | **Uncleared** — not relevant to template unless confirmed | Determine whether any images from this folder were used; if not, no action needed | Pending Launch Pad confirmation |
| Existing assets in `public/` and `src/assets/` | Mixed — see above | Currently wired into demo pages | High — many contain identifiable people and event-specific branding | High — venue names, partner logos, artist names, year-specific designs | **Uncleared** for public release | Cross-reference with this inventory; replace or remove until clearance is confirmed | Pending Launch Pad confirmation |

---

## Approved temporary placeholder media (2026-08-21)

Chris Schultz approved the **@bmaphoto film-camera set** for **temporary placeholder use** inside the generic template on **2026-08-21**.

| Item | Detail |
|---|---|
| Source | `/COSMICO/@bmaphoto - Film Camera/` |
| Credit | Must be shown/recorded as **@bmaphoto** |
| Location in repo | `src/assets/placeholders/film-camera/` (CDN asset pointers, plus a `README.md` carrying the credit) |
| Files | `film-camera-01.jpg` (hero placeholder), `film-camera-02.jpg` (gallery placeholder) |
| Usage | Only through `src/platform/media/placeholderMedia.ts`, in generic hero/gallery slots with no event-, venue-, artist-, or year-specific copy |
| Scope of approval | Temporary placeholder use only — **not** a public redistribution clearance |
| Follow-up (tracked, open) | Obtain written redistribution terms and final legal clearance from @bmaphoto before any public release |

A third file (`placeholder-film-03.jpg`) was referenced in the approval but not supplied; only two images are in the repository.

### Explicit exclusion — Joiner imagery

- `cosmico2025_jjamesjoiner_45.jpg` is **explicitly excluded** and must not be used.
- No J. James Joiner imagery is approved for the template, **including any images containing minors**.
- No Joiner asset has been copied into the repository.

Existing assets were preserved; the placeholder wiring is a one-file swap (`src/platform/media/placeholderMedia.ts`).

---


## Policy

- **Only use a real image in the public template after Launch Pad Foundation has confirmed redistribution rights and an appropriate credit.**
- If rights cannot be confirmed, the image must be treated as **private source material** and removed from any public release branch, Lovable remix, or GitHub publication.
- Identifiable minors, performers, staff, or attendees require model releases or verified editorial/publicity rights beyond a simple photographer license.
- Logos, partner marks, venue names, and artist names embedded in images require separate trademark / partner clearance even if the photograph itself is rights-cleared.

---

## Starter-template guidance

When building a generic, remixable festival template from this codebase:

1. **Prefer venue-neutral, non-identifying images.**
   - Open landscapes, empty stages, crowd silhouettes, abstract textures, and color fields.
   - Avoid faces, branded backdrops, wristbands with event names, and venue-specific signage.

2. **Use placeholders or abstract textures when rights are uncertain.**
   - SVG patterns, duotone gradients, generative textures, or solid-color panels can replace photography while preserving the editorial design system.
   - Document every generated or placeholder image as such in the inventory or in the asset folder README.

3. **Generated photography is a fallback only.**
   - AI-generated images may be used for demo purposes if they contain no identifiable people, no real logos, and no real venue references.
   - Any generated image must be clearly labeled as generated in the inventory and in the asset filename or metadata.

4. **Every public-facing asset must be traceable.**
   - For each asset in the final template, a reviewer should be able to answer: *Who made this?* *What rights cover it?* *Where is the proof?*

---

## Disclaimers

- This is an **inventory**, not a clearance decision.
- No legal advice is provided here.
- No assets have been changed, moved, copied, or deleted in the repository as a result of this document.
- The Launch Pad Foundation (or its designated legal counsel) must review and approve each asset before public release.
- Until clearance is confirmed, the default assumption is **do not include**.

---

## Next steps

1. Confirm which images from the listed Dropbox folders actually appear in the repository.
2. For each image, identify the photographer and the rights holder.
3. Obtain written confirmation of redistribution rights and required attribution.
4. Document clearance in a separate `PHOTOGRAPHY_MEDIA_CLEARANCE.md` file or asset metadata.
5. Replace or remove any assets that cannot be cleared before public release.

**Last updated:** 2026-08-21
