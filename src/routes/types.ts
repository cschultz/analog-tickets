import type { ReactNode } from "react";

import type { PlatformMode } from "@/platform/modes/platformMode";

/** Which functional area a route belongs to. */
export type RouteArea = "site" | "ticketing" | "boxoffice" | "admin";

export interface RouteManifestEntry {
  /** URL path, passed verbatim to <Route path>. Must not change across refactors. */
  path: string;
  /** Fully wrapped element (suspense/error boundaries included). */
  element: ReactNode;
}

export interface RouteManifest {
  area: RouteArea;
  routes: RouteManifestEntry[];
}

/** Which areas are exposed for each platform mode. */
export const AREAS_BY_MODE: Record<PlatformMode, readonly RouteArea[]> = {
  site: ["site"],
  ticketing: ["ticketing", "boxoffice", "admin"],
  integrated: ["site", "ticketing", "boxoffice", "admin"],
};
