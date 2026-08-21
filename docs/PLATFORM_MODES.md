# Platform modes and route manifests

## Modes

The route surface is selected at build time with `VITE_PLATFORM_MODE`:

| Value | Exposes |
|---|---|
| `site` | presentation / marketing routes only |
| `ticketing` | checkout, tickets, my-tickets, box office, admin |
| `integrated` | everything (default) |

Rules:

- Unset, empty, or unknown values fall back to `integrated`.
- Invalid values log a warning in development only; production fails silently to the default.
- Values are trimmed and lowercased before matching.

Example local configuration (`.env.local`, never committed):

```
VITE_PLATFORM_MODE=integrated
```

## Route manifests

Routes live in typed manifests under `src/routes/`:

- `site.routes.tsx` — presentation pages and legacy presentation redirects
- `ticketing.routes.tsx` — cart, checkout, offers, ticket-holder account
- `boxoffice.routes.tsx` — scanners, manifests, door list, printable views
- `admin.routes.tsx` — auth, admin console, pipelines, admin 404 catch-all

Each manifest exports `{ area, routes: [{ path, element }] }`. `src/routes/index.tsx`
filters manifests by the active mode via `AREAS_BY_MODE` and `App.tsx` renders the
resulting flat list. Paths and lazy-loading behavior are unchanged from the previous
inline route table; page files have not moved.

Adding a route means adding an entry to the manifest for its area — not editing `App.tsx`.
