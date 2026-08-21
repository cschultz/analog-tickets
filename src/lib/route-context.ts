/**
 * Tracks the most recent route + params so error reports can include them.
 * Updated on every navigation by <RouteTracker /> mounted inside <Routes>.
 */

type RouteSnapshot = {
  pathname: string;
  search: string;
  hash: string;
  params: Record<string, string>;
  pattern: string | null;
  previousUrl: string | null;
  changedAt: number;
};

const state: RouteSnapshot = {
  pathname: typeof window !== "undefined" ? window.location.pathname : "/",
  search: typeof window !== "undefined" ? window.location.search : "",
  hash: typeof window !== "undefined" ? window.location.hash : "",
  params: {},
  pattern: null,
  previousUrl: null,
  changedAt: Date.now(),
};

export function setRouteSnapshot(next: Partial<RouteSnapshot>) {
  if (next.pathname && next.pathname !== state.pathname) {
    state.previousUrl =
      state.pathname + state.search + (state.hash || "");
  }
  Object.assign(state, next, { changedAt: Date.now() });
}

export function getRouteSnapshot(): RouteSnapshot {
  return { ...state };
}

export function getRouteContextForReport() {
  const s = getRouteSnapshot();
  // Merge query string params into the params map for richer signal
  const query: Record<string, string> = {};
  try {
    const sp = new URLSearchParams(s.search);
    sp.forEach((v, k) => {
      query[k] = v.length > 200 ? v.slice(0, 200) : v;
    });
  } catch {
    // ignore
  }
  return {
    route: s.pathname + s.search,
    routePattern: s.pattern,
    routeParams: {
      path: s.params,
      query,
      hash: s.hash || undefined,
    },
    previousUrl: s.previousUrl,
  };
}
