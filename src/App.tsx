import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventConfigProvider } from "@/platform/config/EventConfigProvider";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TestingProvider } from "@/contexts/TestingContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Eagerly loaded pages (critical path)
import NotFound from "./pages/NotFound";
import { SupportChat } from "./components/SupportChat";

import { AnalyticsTracking } from "./components/AnalyticsTracking";
import { RouteTracker } from "./components/RouteTracker";
import { FunnelEventDebugger } from "./components/FunnelEventDebugger";
import { InternalUTMInterceptor } from "./components/InternalUTMInterceptor";
import { useUTMCapture } from "@/hooks/useUTMTracking";

import { routesForMode } from "@/routes";

/** Runs useUTMCapture on every route change globally */
const GlobalUTMCapture = () => { useUTMCapture(); return null; };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10, // 10 minutes - data stays fresh longer since event switching is rare
      gcTime: 1000 * 60 * 30, // 30 minutes - keep unused data in cache longer
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch when component remounts if data is fresh
      refetchOnReconnect: false, // Don't auto-refetch on reconnect
    },
  },
});

// Routes are assembled from per-area manifests and filtered by VITE_PLATFORM_MODE.
// Paths are unchanged from the previous inline route table.
const activeRoutes = routesForMode();

const App = () => (
  <EventConfigProvider>
  <QueryClientProvider client={queryClient}>
    <TestingProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <AnalyticsTracking />
          <GlobalUTMCapture />
          <RouteTracker />
          <InternalUTMInterceptor />
          <SupportChat />

          <FunnelEventDebugger />
          <ErrorBoundary>
            <Routes>
              {activeRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </TestingProvider>
  </QueryClientProvider>
  </EventConfigProvider>
);

export default App;
