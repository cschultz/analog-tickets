# Analog Tickets — festival website + ticketing platform

**Analog Tickets** is a free, remixable platform for running a small independent gathering: a presentation site, ticketing and checkout flow, box-office check-in, and admin layer driven by one event configuration.

It is part of **Analog Commons**, Launch Pad Foundation's open-source commons for mission-aligned analog experiences.

## Brand architecture

| Name | What it is |
| --- | --- |
| Analog Commons | The open-source commons for mission-aligned analog experiences. |
| Analog Tickets | The free, remixable festival-site and ticketing platform in this repository. |
| Cosmico | A former Launch Pad Foundation festival used privately as the demonstration site's mythology and design reference. It is not an active event. |

The production Cosmi/Cosmico system is separate and is not included in, connected to, or required by this repository.

## What is public here

This repository is the **public source release** of Analog Tickets under the Apache-2.0 license. It contains generic code, documentation, tests, configuration examples, and a small set of placeholder asset pointers. Uncleared event photography, production-era media, customer data, credentials, live integrations, and production database/schema state are intentionally excluded.

This is a source release, not a live festival launch. The private Lovable preview and Cosmico demo remain unpublished and are not a current event, ticket offer, or marketing destination.

## Remixing

Clone the repository or remix it in Lovable, then connect your own backend and infrastructure:

```sh
git clone https://github.com/cschultz/analog-tickets.git
cd analog-tickets
npm ci
cp .env.example .env
npm run dev
```

No credentials are committed. `VITE_*` values are public client configuration only; never put server secrets in them. See [docs/SECRETS_SETUP.md](docs/SECRETS_SETUP.md) and [docs/REMIXER_BACKEND_CONTRACT.md](docs/REMIXER_BACKEND_CONTRACT.md).

## Platform modes

The app can run as a site only, ticketing only, or an integrated site and ticketing surface. See [docs/PLATFORM_MODES.md](docs/PLATFORM_MODES.md).

Event identity, schedule, venue, capacity, commerce rules, module flags, and integration selections belong in the typed `EventConfig` contract:

- `src/platform/config/eventConfig.ts`
- `src/events/analog-commons/config.ts`
- `src/platform/config/loadEventConfig.ts`

Copy the demo config to `src/events/<your-event>/config.ts` when remixing. Never put an API key, token, or secret in event configuration.

## Assets and credits

The public repository intentionally excludes uncleared and production-era media. The only approved temporary placeholders are documented in [docs/ASSET_RELEASE_GATE.md](docs/ASSET_RELEASE_GATE.md); replace them with assets whose redistribution rights you control before launching your own event. Do not add photographs of identifiable people, minors, venues, artists, or partners without appropriate rights and releases.

## Legal and operational status

`/terms`, `/privacy`, and giveaway rules are illustrative templates, not legal advice. Review and replace them before operating a real event.

Fresh-backend end-to-end validation, payment-provider setup, webhook verification, and live integration testing are intentionally deferred to each remixer. The public source has not been connected to a live backend.

## Stewardship

Analog Tickets is stewarded by **Launch Pad Foundation**. The project is provided as-is, with no support or hosting promise. Contributions and remixers should read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
