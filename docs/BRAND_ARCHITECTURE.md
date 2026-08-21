# Brand architecture

Approved 2026-08-21 (Chris Schultz). Single source of truth in code:
[`src/platform/branding.ts`](../src/platform/branding.ts).

| Name | Role |
| --- | --- |
| **Analog Commons** | The open-source commons for mission-aligned analog experiences. Umbrella name. |
| **Analog Tickets** | The free, remixable festival website + ticketing platform contained in this repository. |
| **Cosmico** | A festival we previously created. Not an active event. Used only as the demonstration site for Analog Tickets. |

## Demonstration-site rules

The Cosmico surfaces are a demonstration, not a live event. Copy must:

- state that Cosmico was previously created and is no longer produced;
- state that it lives on as a demonstration of Analog Tickets, in the hope that
  others create their own analog experiences;
- state plainly that this is a demonstration site and that tickets and bookings
  are not available.

Copy must **not** imply a current lineup, an event date, ticket availability, or
an actively operating organization, and must not invent a repository URL.

The shared component is `src/components/DemoSiteNotice.tsx`; it renders sitewide
in the footers and once on the homepage.

## Remaining old-brand assumptions

- Visible copy now calls the example event **Cosmico** (Gate 6, slice 22). The
  config slug `analog-commons` and the directory `src/events/analog-commons/`
  are intentionally unchanged: they are internal keys, not copy.
- Test fixtures (`src/test/mocks/handlers.ts`, `src/test/e2e/checkout-flow.test.ts`)
  still use the old event title on purpose — they assert stored data shapes.
- Edge function names (e.g. `create-cosmico-checkout`), asset filenames and
  legacy `cosmico_` storage keys are backend/asset contracts and remain
  unchanged.

## Tests

- `src/test/branding.test.ts` — locks the approved names and the disclaimer.
- `src/test/brand-genericization.test.ts` — still blocks production leakage
  (`cosmi.co`, "Analog Reunion", real venue/vendor/organizer names). "Cosmico"
  is intentionally allowed as the approved demo-festival name.
