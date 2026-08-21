import { Navigate } from "react-router-dom";

import { lazyWithRetry } from "@/lib/lazy-with-retry";

import { LazyRoute } from "./RouteWrappers";
import type { RouteManifest } from "./types";

const MayIndex = lazyWithRetry(() => import("@/modules/site/pages/Index"));
const MayMixtape = lazyWithRetry(() => import("@/modules/site/pages/Mixtape"));
const MayStay = lazyWithRetry(() => import("@/modules/site/pages/Stay"));
const MayLineup = lazyWithRetry(() => import("@/modules/site/pages/Lineup"));
const MayExperience = lazyWithRetry(() => import("@/modules/site/pages/Experience"));
const MayEat = lazyWithRetry(() => import("@/modules/site/pages/Eat"));
const MayStory = lazyWithRetry(() => import("@/modules/site/pages/Story"));
const MayFAQ = lazyWithRetry(() => import("@/modules/site/pages/FAQ"));
const MayTerms = lazyWithRetry(() => import("@/modules/site/pages/Terms"));
const MayPrivacy = lazyWithRetry(() => import("@/modules/site/pages/Privacy"));
const MayContact = lazyWithRetry(() => import("@/modules/site/pages/Contact"));
const MayGetInvolved = lazyWithRetry(() => import("@/modules/site/pages/GetInvolved"));
const MayGather = lazyWithRetry(() => import("@/modules/site/pages/Gather"));
const MayEscape = lazyWithRetry(() => import("@/modules/site/pages/Escape"));
const MayReal = lazyWithRetry(() => import("@/modules/site/pages/Real"));
const MayCrew = lazyWithRetry(() => import("@/modules/site/pages/Crew"));
const MayWin = lazyWithRetry(() => import("@/modules/site/pages/Win"));
const MayGiveawayRules = lazyWithRetry(() => import("@/modules/site/pages/GiveawayRules"));
const MayReserve = lazyWithRetry(() => import("@/modules/site/pages/Reserve"));
const MayAlmostHere = lazyWithRetry(() => import("@/modules/site/pages/AlmostHere"));
const MayGettingHere = lazyWithRetry(() => import("@/modules/site/pages/GettingHere"));
const MaySchedule = lazyWithRetry(() => import("@/modules/site/pages/Schedule"));
const WineCampLineup = lazyWithRetry(() => import("@/modules/site/pages/WineCampLineup"));
const WineCampWinery = lazyWithRetry(() => import("@/modules/site/pages/WineCampWinery"));
const FoodVendorPage = lazyWithRetry(() => import("@/modules/site/pages/FoodVendorPage"));
const Sauna = lazyWithRetry(() => import("@/modules/site/pages/Sauna"));
const SaunaVendorPage = lazyWithRetry(() => import("@/modules/site/pages/SaunaVendorPage"));
const Bar = lazyWithRetry(() => import("@/modules/site/pages/Bar"));
const MayPhotos = lazyWithRetry(() => import("@/modules/site/pages/Photos"));
const FridayDinner = lazyWithRetry(() => import("@/modules/site/pages/FridayDinner"));
const PreviewAccess = lazyWithRetry(() => import("@/modules/site/pages/PreviewAccess"));
const LandingPage = lazyWithRetry(() => import("@/pages/LandingPage"));
const AccessPage = lazyWithRetry(() => import("@/pages/AccessPage"));
const AnalogPage = lazyWithRetry(() => import("@/pages/AnalogPage"));
const AnalogXH2Hotel = lazyWithRetry(() => import("@/pages/sessions/AnalogXH2Hotel"));

export const siteRoutes: RouteManifest = {
  area: "site",
  routes: [
    { path: "/", element: <LazyRoute><MayIndex /></LazyRoute> },
    { path: "/stay", element: <LazyRoute><MayStay /></LazyRoute> },
    { path: "/lineup", element: <LazyRoute><MayLineup /></LazyRoute> },
    { path: "/experience", element: <LazyRoute><MayExperience /></LazyRoute> },
    { path: "/story", element: <LazyRoute><MayStory /></LazyRoute> },
    { path: "/gather", element: <LazyRoute><MayGather /></LazyRoute> },
    { path: "/real", element: <LazyRoute><MayReal /></LazyRoute> },
    { path: "/escape", element: <LazyRoute><MayEscape /></LazyRoute> },
    { path: "/win", element: <LazyRoute><MayWin /></LazyRoute> },
    { path: "/giveaway-rules", element: <LazyRoute><MayGiveawayRules /></LazyRoute> },
    { path: "/faq", element: <LazyRoute><MayFAQ /></LazyRoute> },
    { path: "/mixtape", element: <LazyRoute><MayMixtape /></LazyRoute> },
    { path: "/terms", element: <LazyRoute><MayTerms /></LazyRoute> },
    { path: "/privacy", element: <LazyRoute><MayPrivacy /></LazyRoute> },
    { path: "/contact", element: <LazyRoute><MayContact /></LazyRoute> },
    { path: "/get-involved", element: <LazyRoute><MayGetInvolved /></LazyRoute> },
    { path: "/crew", element: <LazyRoute><MayCrew /></LazyRoute> },
    { path: "/reserve", element: <LazyRoute><MayReserve /></LazyRoute> },
    { path: "/almost-here", element: <LazyRoute><MayAlmostHere /></LazyRoute> },
    { path: "/getting-here", element: <LazyRoute><MayGettingHere /></LazyRoute> },
    { path: "/schedule", element: <LazyRoute><MaySchedule /></LazyRoute> },
    { path: "/winecamp", element: <LazyRoute><WineCampLineup /></LazyRoute> },
    { path: "/winecamp/:slug", element: <LazyRoute><WineCampWinery /></LazyRoute> },
    { path: "/eat", element: <LazyRoute><MayEat /></LazyRoute> },
    { path: "/eat/:slug", element: <LazyRoute><FoodVendorPage /></LazyRoute> },
    { path: "/sauna", element: <LazyRoute><Sauna /></LazyRoute> },
    { path: "/sauna/:slug", element: <LazyRoute><SaunaVendorPage /></LazyRoute> },
    { path: "/bar", element: <LazyRoute><Bar /></LazyRoute> },
    { path: "/fielddayca", element: <LazyRoute><FridayDinner /></LazyRoute> },
    { path: "/photos", element: <LazyRoute><MayPhotos /></LazyRoute> },
    { path: "/go", element: <LazyRoute><LandingPage /></LazyRoute> },
    { path: "/access", element: <LazyRoute><AccessPage /></LazyRoute> },
    { path: "/analog", element: <LazyRoute><AnalogPage /></LazyRoute> },

    // Sessions (free event RSVPs)
    { path: "/sessions/analogxh2hotel", element: <LazyRoute><AnalogXH2Hotel /></LazyRoute> },

    // Legacy /may routes - redirect to root for backwards compatibility
    { path: "/may/access", element: <LazyRoute><PreviewAccess /></LazyRoute> },
    { path: "/may", element: <Navigate to="/" replace /> },
    { path: "/may/stay", element: <Navigate to="/stay" replace /> },
    { path: "/may/lineup", element: <Navigate to="/lineup" replace /> },
    { path: "/may/experience", element: <Navigate to="/experience" replace /> },
    { path: "/may/story", element: <Navigate to="/story" replace /> },
    { path: "/may/faq", element: <Navigate to="/faq" replace /> },
    { path: "/may/terms", element: <Navigate to="/terms" replace /> },
    { path: "/may/privacy", element: <Navigate to="/privacy" replace /> },
    { path: "/may/contact", element: <Navigate to="/contact" replace /> },
    { path: "/may/get-involved", element: <Navigate to="/get-involved" replace /> },
  ],
};
