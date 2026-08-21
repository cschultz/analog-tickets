# Analog Tickets — festival website + ticketing platform

**Analog Tickets** is a free, remixable platform for running a small independent
gathering: a marketing/presentation site, a ticketing and checkout flow,
box-office check-in, and an admin layer — all driven by a single event
configuration.

It is part of **Analog Commons**, the open-source commons for mission-aligned
analog experiences.

## Brand architecture

| Name | What it is |
| --- | --- |
| Analog Commons | The open-source commons for mission-aligned analog experiences (umbrella). |
| Analog Tickets | The free, remixable ticketing and festival-site platform in this repository. |
| Cosmico | A festival we previously created. It is **not** an active event — it lives on as the demonstration site for Analog Tickets. |

The names above live in one place, `src/platform/branding.ts`, together with the
demonstration-site disclaimer copy. Change them there when you remix.

### About the demonstration site

Cosmico was a festival we previously created. We no longer produce it as an
active event. It lives on here as a demonstration of Analog Tickets, in the hope
that others create their own analog experiences. The demo shows no current
lineup, no event date and no ticket availability — tickets and bookings are not
available.

The demo event *data* in this repository (schedule, venue, vendors) is
fictional placeholder content: `example.org` / `example.test` are placeholder
domains that never resolve.

## Platform modes

The app can run as a site only, a ticketing surface only, or both. See
[`docs/PLATFORM_MODES.md`](docs/PLATFORM_MODES.md) for `VITE_PLATFORM_MODE`.

## Event configuration

Event identity, schedule/timezone, venue, capacity, commerce rules, module
flags and integration selections live in a typed, validated `EventConfig`:

- Contract: `src/platform/config/eventConfig.ts`
- Demo event: `src/events/analog-commons/config.ts`
- Loader/registry: `src/platform/config/loadEventConfig.ts`
- React access: `EventConfigProvider` / `useEventConfig`

To add your own event, copy the demo config to `src/events/<your-event>/config.ts`,
edit the values, and register it in the loader. Never put an API key, token or
secret in an event config.

## Secrets

No credentials are committed to this repository. Copy `.env.example` to a local
`.env` (git-ignored) and supply your own values; backend/integration secrets are
provided to the runtime separately. See [`docs/SECRETS_SETUP.md`](docs/SECRETS_SETUP.md).

## Remixing in Lovable

This project is built with Lovable. Remix or open it in Lovable and start
prompting — changes sync to the connected repository. You can also work locally
with any IDE.

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

Publish from Lovable via Share → Publish, and connect a custom domain under
Project → Settings → Domains.

## Tech stack

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Legal pages

`/terms`, `/privacy` and the giveaway rules are **illustrative placeholders** for
the demo event. They are not legal advice; replace them with policies reviewed
by your own counsel before publishing.

## Status

Ongoing modularization notes live in
[`docs/OPEN_SOURCE_SANITIZATION_STATUS.md`](docs/OPEN_SOURCE_SANITIZATION_STATUS.md).
Event-specific media assets, edge functions and internal runbooks are still
being genericized in later passes.

## Canonical source and remix workflow

GitHub is intended as the future canonical public source for this project, while
Lovable remains the remix and build experience. The production Cosmi system is a
separate, private deployment and is never the source for public remixes. See
[`docs/GITHUB_CANONICAL_SOURCE.md`](docs/GITHUB_CANONICAL_SOURCE.md) for the
proposed flow, repository hygiene expectations, and what is intentionally not
automated yet.

