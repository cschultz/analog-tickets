import Auth from "@/pages/Auth";
import AdminNotFound from "@/modules/admin/pages/AdminNotFound";
import { PipelinePage } from "@/components/pipeline";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

import { AdminRoute, LazyRoute } from "./RouteWrappers";
import type { RouteManifest } from "./types";

const AdminDashboard = lazyWithRetry(() => import("@/modules/admin/pages/Dashboard"));
const AdminRegistrations = lazyWithRetry(() => import("@/modules/admin/pages/Registrations"));
const AdminEvents = lazyWithRetry(() => import("@/modules/admin/pages/Events"));
const AdminGuestLists = lazyWithRetry(() => import("@/modules/admin/pages/GuestLists"));
const AdminTickets = lazyWithRetry(() => import("@/modules/admin/pages/Tickets"));
const AdminSales = lazyWithRetry(() => import("@/modules/admin/pages/Sales"));
const AdminEmails = lazyWithRetry(() => import("@/modules/admin/pages/Emails"));
const AdminWebhooks = lazyWithRetry(() => import("@/modules/admin/pages/Webhooks"));
const AdminSurveys = lazyWithRetry(() => import("@/modules/admin/pages/Surveys"));
const AdminReminders = lazyWithRetry(() => import("@/modules/admin/pages/Reminders"));
const SystemHealthPage = lazyWithRetry(() => import("@/modules/admin/pages/SystemHealth"));
const AdminIncidents = lazyWithRetry(() => import("@/modules/admin/pages/Incidents"));
const AdminSettings = lazyWithRetry(() => import("@/modules/admin/pages/Settings"));
const AdminUsers = lazyWithRetry(() => import("@/modules/admin/pages/AdminUsers"));
const AdminWaitlist = lazyWithRetry(() => import("@/modules/admin/pages/Waitlist"));
const AdminAccommodationWaitlist = lazyWithRetry(() => import("@/modules/admin/pages/AccommodationWaitlist"));
const AdminAccommodationZones = lazyWithRetry(() => import("@/modules/admin/pages/AccommodationZones"));
const AdminFamilyStyleUnits = lazyWithRetry(() => import("@/modules/admin/pages/FamilyStyleUnits"));
const AdminLodgingOperations = lazyWithRetry(() => import("@/modules/admin/pages/LodgingOperations"));
const AdminUpgrades = lazyWithRetry(() => import("@/modules/admin/pages/Upgrades"));
const AdminAbandonedRecovery = lazyWithRetry(() => import("@/modules/admin/pages/AbandonedRecovery"));
const AdminPreviewSignups = lazyWithRetry(() => import("@/modules/admin/pages/PreviewSignups"));
const AdminInventory = lazyWithRetry(() => import("@/modules/admin/pages/Inventory"));
const AdminAddons = lazyWithRetry(() => import("@/modules/admin/pages/Addons"));
const AdminCustomOffers = lazyWithRetry(() => import("@/modules/admin/pages/CustomOffers"));
const AdminCustomers = lazyWithRetry(() => import("@/modules/admin/pages/Customers"));
const AdminCustomerDetail = lazyWithRetry(() => import("@/modules/admin/pages/CustomerDetail"));
const AdminStyleGuide = lazyWithRetry(() => import("@/modules/admin/pages/StyleGuide"));
const AdminVolunteerInterests = lazyWithRetry(() => import("@/modules/admin/pages/VolunteerInterests"));
const AdminPacing = lazyWithRetry(() => import("@/modules/admin/pages/Pacing"));
const AdminInbox = lazyWithRetry(() => import("@/modules/admin/pages/Inbox"));
const AdminSocialPublishing = lazyWithRetry(() => import("@/modules/admin/pages/SocialPublishing"));
const AdminDeadLetterQueue = lazyWithRetry(() => import("@/modules/admin/pages/DeadLetterQueue"));
const AdminScheduledJobs = lazyWithRetry(() => import("@/modules/admin/pages/ScheduledJobs"));
const AdminEmailDelivery = lazyWithRetry(() => import("@/modules/admin/pages/EmailDelivery"));
const AdminTeam = lazyWithRetry(() => import("@/modules/admin/pages/Team"));
const AdminCheckoutHealth = lazyWithRetry(() => import("@/modules/admin/pages/CheckoutHealth"));
const AdminCrewBids = lazyWithRetry(() => import("@/modules/admin/pages/CrewBids"));
const AdminMarketingAssets = lazyWithRetry(() => import("@/modules/admin/pages/MarketingAssets"));
const AdminLeads = lazyWithRetry(() => import("@/modules/admin/pages/Leads"));
const AdminPaymentPlans = lazyWithRetry(() => import("@/modules/admin/pages/PaymentPlans"));
const AdminPromoCodes = lazyWithRetry(() => import("@/modules/admin/pages/PromoCodes"));
const AdminPromoCodeStatus = lazyWithRetry(() => import("@/modules/admin/pages/PromoCodeStatus"));
const AdminPromoCodeInsights = lazyWithRetry(() => import("@/modules/admin/pages/PromoCodeInsights"));
const AdminFunnel = lazyWithRetry(() => import("@/modules/admin/pages/Funnel"));
const AdminEventPhotos = lazyWithRetry(() => import("@/modules/admin/pages/EventPhotos"));
const AdminBoxOffice = lazyWithRetry(() => import("@/modules/admin/pages/BoxOffice"));
const SimpleAdminSignup = lazyWithRetry(() => import("@/pages/SimpleAdminSignup"));
const AdminSetup = lazyWithRetry(() => import("@/pages/AdminSetup"));

export const adminRoutes: RouteManifest = {
  area: "admin",
  routes: [
    { path: "/auth", element: <Auth /> },
    { path: "/simple-admin-signup", element: <LazyRoute><SimpleAdminSignup /></LazyRoute> },
    { path: "/admin-setup", element: <LazyRoute><AdminSetup /></LazyRoute> },

    { path: "/admin", element: <AdminRoute><AdminDashboard /></AdminRoute> },
    { path: "/admin/registrations", element: <AdminRoute><AdminRegistrations /></AdminRoute> },
    { path: "/admin/customers", element: <AdminRoute><AdminCustomers /></AdminRoute> },
    { path: "/admin/customers/:email", element: <AdminRoute><AdminCustomerDetail /></AdminRoute> },
    { path: "/admin/events", element: <AdminRoute><AdminEvents /></AdminRoute> },
    { path: "/admin/guest-lists", element: <AdminRoute><AdminGuestLists /></AdminRoute> },
    { path: "/admin/tickets", element: <AdminRoute><AdminTickets /></AdminRoute> },
    { path: "/admin/sales", element: <AdminRoute><AdminSales /></AdminRoute> },
    { path: "/admin/emails", element: <AdminRoute><AdminEmails /></AdminRoute> },
    { path: "/admin/webhooks", element: <AdminRoute><AdminWebhooks /></AdminRoute> },
    { path: "/admin/surveys", element: <AdminRoute><AdminSurveys /></AdminRoute> },
    { path: "/admin/reminders", element: <AdminRoute><AdminReminders /></AdminRoute> },
    { path: "/admin/health", element: <AdminRoute><SystemHealthPage /></AdminRoute> },
    { path: "/admin/incidents", element: <AdminRoute><AdminIncidents /></AdminRoute> },
    { path: "/admin/settings", element: <AdminRoute><AdminSettings /></AdminRoute> },
    { path: "/admin/users", element: <AdminRoute><AdminUsers /></AdminRoute> },
    { path: "/admin/waitlist", element: <AdminRoute><AdminWaitlist /></AdminRoute> },
    { path: "/admin/accommodation-waitlist", element: <AdminRoute><AdminAccommodationWaitlist /></AdminRoute> },
    { path: "/admin/lodging", element: <AdminRoute><AdminLodgingOperations /></AdminRoute> },
    { path: "/admin/lodging/zones", element: <AdminRoute><AdminAccommodationZones /></AdminRoute> },
    { path: "/admin/lodging/units", element: <AdminRoute><AdminFamilyStyleUnits /></AdminRoute> },
    { path: "/admin/lodging/operations", element: <AdminRoute><AdminLodgingOperations /></AdminRoute> },
    { path: "/admin/lodging/family-style", element: <AdminRoute><AdminFamilyStyleUnits /></AdminRoute> },
    { path: "/admin/upgrades", element: <AdminRoute><AdminUpgrades /></AdminRoute> },
    { path: "/admin/abandoned-recovery", element: <AdminRoute><AdminAbandonedRecovery /></AdminRoute> },
    { path: "/admin/preview-signups", element: <AdminRoute><AdminPreviewSignups /></AdminRoute> },
    { path: "/admin/inventory", element: <AdminRoute><AdminInventory /></AdminRoute> },
    { path: "/admin/offers", element: <AdminRoute><AdminCustomOffers /></AdminRoute> },
    { path: "/admin/addons", element: <AdminRoute><AdminAddons /></AdminRoute> },
    { path: "/admin/style-guide", element: <AdminRoute><AdminStyleGuide /></AdminRoute> },
    { path: "/admin/volunteers", element: <AdminRoute><AdminVolunteerInterests /></AdminRoute> },
    { path: "/admin/volunteer-interests", element: <AdminRoute><AdminVolunteerInterests /></AdminRoute> },
    { path: "/admin/production-volunteers", element: <AdminRoute><PipelinePage slug="volunteer" /></AdminRoute> },
    { path: "/admin/artists", element: <AdminRoute><PipelinePage slug="artist" /></AdminRoute> },
    { path: "/admin/vendors", element: <AdminRoute><PipelinePage slug="vendor" /></AdminRoute> },
    { path: "/admin/artisans", element: <AdminRoute><PipelinePage slug="artisan" /></AdminRoute> },
    { path: "/admin/partners", element: <AdminRoute><PipelinePage slug="partner" /></AdminRoute> },
    { path: "/admin/street-team", element: <AdminRoute><PipelinePage slug="street_team" /></AdminRoute> },
    { path: "/admin/winecamp", element: <AdminRoute><PipelinePage slug="winecamp" /></AdminRoute> },
    { path: "/admin/pacing", element: <AdminRoute><AdminPacing /></AdminRoute> },
    { path: "/admin/inbox", element: <AdminRoute><AdminInbox /></AdminRoute> },
    { path: "/admin/crew-bids", element: <AdminRoute><AdminCrewBids /></AdminRoute> },
    { path: "/admin/social", element: <AdminRoute><AdminSocialPublishing /></AdminRoute> },
    { path: "/admin/team", element: <AdminRoute><AdminTeam /></AdminRoute> },
    { path: "/admin/dead-letter", element: <AdminRoute><AdminDeadLetterQueue /></AdminRoute> },
    { path: "/admin/jobs", element: <AdminRoute><AdminScheduledJobs /></AdminRoute> },
    { path: "/admin/email-delivery", element: <AdminRoute><AdminEmailDelivery /></AdminRoute> },
    { path: "/admin/checkout-health", element: <AdminRoute><AdminCheckoutHealth /></AdminRoute> },
    { path: "/admin/marketing-assets", element: <AdminRoute><AdminMarketingAssets /></AdminRoute> },
    { path: "/admin/leads", element: <AdminRoute><AdminLeads /></AdminRoute> },
    { path: "/admin/payment-plans", element: <AdminRoute><AdminPaymentPlans /></AdminRoute> },
    { path: "/admin/promo-codes", element: <AdminRoute><AdminPromoCodes /></AdminRoute> },
    { path: "/admin/promo-codes/status", element: <AdminRoute><AdminPromoCodeStatus /></AdminRoute> },
    { path: "/admin/promo-codes/insights", element: <AdminRoute><AdminPromoCodeInsights /></AdminRoute> },
    { path: "/admin/funnel", element: <AdminRoute><AdminFunnel /></AdminRoute> },
    { path: "/admin/event-photos", element: <AdminRoute><AdminEventPhotos /></AdminRoute> },
    { path: "/admin/box-office", element: <AdminRoute><AdminBoxOffice /></AdminRoute> },

    // Admin 404 catch-all
    { path: "/admin/*", element: <AdminRoute><AdminNotFound /></AdminRoute> },
  ],
};
