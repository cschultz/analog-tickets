import { getPlatformMode, type PlatformMode } from "@/platform/modes/platformMode";

import { adminRoutes } from "./admin.routes";
import { boxOfficeRoutes } from "./boxoffice.routes";
import { siteRoutes } from "./site.routes";
import { ticketingRoutes } from "./ticketing.routes";
import { AREAS_BY_MODE, type RouteManifest, type RouteManifestEntry } from "./types";

export const ALL_MANIFESTS: RouteManifest[] = [
  siteRoutes,
  ticketingRoutes,
  boxOfficeRoutes,
  adminRoutes,
];

/** Manifests exposed for a given platform mode. */
export function manifestsForMode(mode: PlatformMode): RouteManifest[] {
  const areas = AREAS_BY_MODE[mode];
  return ALL_MANIFESTS.filter((manifest) => areas.includes(manifest.area));
}

/** Flat route list for a given platform mode. */
export function routesForMode(mode: PlatformMode = getPlatformMode()): RouteManifestEntry[] {
  return manifestsForMode(mode).flatMap((manifest) => manifest.routes);
}

export { siteRoutes, ticketingRoutes, boxOfficeRoutes, adminRoutes };
export type { RouteManifest, RouteManifestEntry } from "./types";
