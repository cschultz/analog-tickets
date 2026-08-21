import { Navigate, useLocation } from "react-router-dom";

import { type BookingRouteIntent, resolveBookingRouteFromSessionStorage } from "@/lib/bookingRouteGuard";

interface BookingRouteGuardProps {
  intent: BookingRouteIntent;
}

export default function BookingRouteGuard({ intent }: BookingRouteGuardProps) {
  const location = useLocation();
  const destination = resolveBookingRouteFromSessionStorage(intent);

  return <Navigate to={{ pathname: destination, search: location.search }} replace />;
}