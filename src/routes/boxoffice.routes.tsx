import { Navigate } from "react-router-dom";

import { lazyWithRetry } from "@/lib/lazy-with-retry";

import { BoxOfficeRoute, LazyRoute } from "./RouteWrappers";
import type { RouteManifest } from "./types";

const CheckIn = lazyWithRetry(() => import("@/modules/box-office/pages/CheckIn"));
const CheckInGuide = lazyWithRetry(() => import("@/modules/box-office/pages/CheckInGuide"));
const BoxOfficeScanner = lazyWithRetry(() => import("@/modules/box-office/pages/BoxOfficeScanner"));
const BoxOfficeManifest = lazyWithRetry(() => import("@/modules/box-office/pages/BoxOfficeManifest"));
const DoorList = lazyWithRetry(() => import("@/modules/box-office/pages/DoorList"));
const StationScanner = lazyWithRetry(() => import("@/modules/box-office/pages/StationScanner"));
const PrintableCheckIn = lazyWithRetry(() => import("@/modules/box-office/pages/PrintableCheckIn"));
const PrintableManifest = lazyWithRetry(() => import("@/modules/box-office/pages/PrintableManifest"));
const PrintableDinnerManifest = lazyWithRetry(() => import("@/modules/box-office/pages/PrintableDinnerManifest"));

export const boxOfficeRoutes: RouteManifest = {
  area: "boxoffice",
  routes: [
    // Preserves the original non-AdminLayout chrome; auth is enforced at the route boundary
    { path: "/admin/checkin", element: <BoxOfficeRoute><CheckIn /></BoxOfficeRoute> },
    { path: "/check-in", element: <LazyRoute><CheckInGuide /></LazyRoute> },
    // Legacy scanner deprecated — Box Office is the single per-ticket scanner
    { path: "/check-in-scanner", element: <Navigate to="/box-office" replace /> },
    { path: "/box-office", element: <LazyRoute><BoxOfficeScanner /></LazyRoute> },
    { path: "/box-office/manifest", element: <BoxOfficeRoute><BoxOfficeManifest /></BoxOfficeRoute> },
    { path: "/box-office/door-list", element: <BoxOfficeRoute><DoorList /></BoxOfficeRoute> },
    { path: "/station", element: <LazyRoute><StationScanner /></LazyRoute> },
    { path: "/printable-checkin", element: <BoxOfficeRoute><PrintableCheckIn /></BoxOfficeRoute> },
    { path: "/printable-manifest", element: <BoxOfficeRoute><PrintableManifest /></BoxOfficeRoute> },
    { path: "/printable-dinner-manifest", element: <BoxOfficeRoute><PrintableDinnerManifest /></BoxOfficeRoute> },
  ],
};
