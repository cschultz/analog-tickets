import { Navigate } from "react-router-dom";

import BookingRouteGuard from "@/components/BookingRouteGuard";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

import { LazyRoute } from "./RouteWrappers";
import type { RouteManifest } from "./types";

const MayTickets = lazyWithRetry(() => import("@/modules/ticketing/pages/Tickets"));
const MayTicketSuccess = lazyWithRetry(() => import("@/modules/ticketing/pages/TicketSuccess"));
const MayAccommodations = lazyWithRetry(() => import("@/modules/ticketing/pages/Accommodations"));
const MayLodgingSuccess = lazyWithRetry(() => import("@/modules/ticketing/pages/LodgingSuccess"));
const CheckoutAddons = lazyWithRetry(() => import("@/modules/ticketing/pages/CheckoutAddons"));
const CartReview = lazyWithRetry(() => import("@/modules/ticketing/pages/CartReview"));
const PaymentPlanReview = lazyWithRetry(() => import("@/modules/ticketing/pages/PaymentPlanReview"));
const PaymentPlanStatus = lazyWithRetry(() => import("@/modules/ticketing/pages/PaymentPlanStatus"));
const BringYourCrew = lazyWithRetry(() => import("@/modules/ticketing/pages/BringYourCrew"));
const CrewCheckout = lazyWithRetry(() => import("@/modules/ticketing/pages/CrewCheckout"));
const MyTickets = lazyWithRetry(() => import("@/pages/MyTickets"));
const ConfirmTransfer = lazyWithRetry(() => import("@/pages/ConfirmTransfer"));
const UndoTransfer = lazyWithRetry(() => import("@/pages/UndoTransfer"));
const ContractSigning = lazyWithRetry(() => import("@/pages/ContractSigning"));
const CustomOffer = lazyWithRetry(() => import("@/pages/CustomOffer"));
const CustomOfferSuccess = lazyWithRetry(() => import("@/pages/CustomOfferSuccess"));
const LodgingOffer = lazyWithRetry(() => import("@/pages/offers/LodgingOffer"));
const LodgingOfferSuccess = lazyWithRetry(() => import("@/pages/offers/LodgingOfferSuccess"));
const PackageOffer = lazyWithRetry(() => import("@/pages/offers/PackageOffer"));
const PackageOfferAccommodations = lazyWithRetry(() => import("@/pages/offers/PackageOfferAccommodations"));
const UpgradeSuccess = lazyWithRetry(() => import("@/pages/UpgradeSuccess"));
const CheckoutFunnelQA = lazyWithRetry(() => import("@/pages/CheckoutFunnelQA"));
const Survey = lazyWithRetry(() => import("@/pages/Survey"));

export const ticketingRoutes: RouteManifest = {
  area: "ticketing",
  routes: [
    { path: "/tickets", element: <LazyRoute><MayTickets /></LazyRoute> },
    { path: "/tickets/payment-plan", element: <LazyRoute><PaymentPlanReview /></LazyRoute> },
    { path: "/checkout/lodging", element: <LazyRoute><MayAccommodations /></LazyRoute> },
    { path: "/checkout/addons", element: <LazyRoute><CheckoutAddons /></LazyRoute> },
    { path: "/checkout/review", element: <LazyRoute><CartReview /></LazyRoute> },
    { path: "/accommodations", element: <BookingRouteGuard intent="lodging" /> },
    { path: "/ticket-success", element: <LazyRoute><MayTicketSuccess /></LazyRoute> },

    // Legacy lodging routes redirect into current booking flows
    { path: "/lodging", element: <BookingRouteGuard intent="lodging" /> },
    { path: "/lodging/success", element: <Navigate to="/accommodations/success" replace /> },
    {
      path: "/lodging/invite",
      element: (
        <Navigate
          to={`/accommodations/invite${typeof window !== "undefined" ? window.location.search : ""}`}
          replace
        />
      ),
    },
    { path: "/accommodations/invite", element: <LazyRoute><MayAccommodations /></LazyRoute> },
    { path: "/accommodations/success", element: <LazyRoute><MayLodgingSuccess /></LazyRoute> },

    { path: "/bringyourcrew", element: <LazyRoute><BringYourCrew /></LazyRoute> },
    { path: "/bringyourcrew/checkout", element: <LazyRoute><CrewCheckout /></LazyRoute> },
    { path: "/payment-plan-status", element: <LazyRoute><PaymentPlanStatus /></LazyRoute> },

    // Ticket holder account
    { path: "/my-tickets", element: <LazyRoute><MyTickets /></LazyRoute> },
    { path: "/confirm-transfer", element: <LazyRoute><ConfirmTransfer /></LazyRoute> },
    { path: "/undo-transfer", element: <LazyRoute><UndoTransfer /></LazyRoute> },
    { path: "/sign-contract", element: <LazyRoute><ContractSigning /></LazyRoute> },
    { path: "/offer/:token", element: <LazyRoute><CustomOffer /></LazyRoute> },
    { path: "/offer/:token/success", element: <LazyRoute><CustomOfferSuccess /></LazyRoute> },
    { path: "/offer/lodging", element: <LazyRoute><LodgingOffer /></LazyRoute> },
    { path: "/offer/lodging/success", element: <LazyRoute><LodgingOfferSuccess /></LazyRoute> },
    { path: "/offer/package", element: <LazyRoute><PackageOffer /></LazyRoute> },
    { path: "/offer/package/accommodations", element: <LazyRoute><PackageOfferAccommodations /></LazyRoute> },
    { path: "/offer/package/success", element: <LazyRoute><LodgingOfferSuccess /></LazyRoute> },

    // Utility commerce pages
    { path: "/upgrade-success", element: <LazyRoute><UpgradeSuccess /></LazyRoute> },
    { path: "/qa/checkout-funnel", element: <LazyRoute><CheckoutFunnelQA /></LazyRoute> },
    { path: "/survey", element: <LazyRoute><Survey /></LazyRoute> },

    // Legacy /may commerce URLs
    { path: "/may/tickets", element: <Navigate to="/tickets" replace /> },
    { path: "/may/accommodations", element: <BookingRouteGuard intent="lodging" /> },
    { path: "/may/ticket-success", element: <Navigate to="/ticket-success" replace /> },
  ],
};
