import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { setRouteSnapshot } from "@/lib/route-context";

/**
 * Mount once inside <BrowserRouter>. Updates the global route snapshot
 * on every navigation so crash reports can include precise route context.
 */
export function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    setRouteSnapshot({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      params: {},
      pattern: null,
    });
  }, [location.pathname, location.search, location.hash]);

  return null;
}
