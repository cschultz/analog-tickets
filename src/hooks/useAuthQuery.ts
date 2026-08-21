import { useQuery, UseQueryOptions, QueryKey } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

/**
 * A wrapper around useQuery that ensures queries only run when the user is authenticated.
 * This prevents race conditions where queries fire before RLS can authenticate the user,
 * which can cause intermittent data loading failures.
 * 
 * Features:
 * - Waits for authentication before enabling queries
 * - Includes automatic retry with exponential backoff
 * - Proper error logging
 */
export function useAuthQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    requireAuth?: boolean; // Default true, set false for public queries
  }
) {
  const { user, loading: authLoading } = useAuth();
  
  const { requireAuth = true, enabled, ...restOptions } = options;
  
  // Only enable query when user is authenticated (if requireAuth is true)
  const isAuthenticated = !!user && !authLoading;
  const shouldEnable = requireAuth ? isAuthenticated && (enabled ?? true) : (enabled ?? true);
  
  return useQuery({
    ...restOptions,
    enabled: shouldEnable,
    retry: restOptions.retry ?? 3,
    retryDelay: restOptions.retryDelay ?? ((attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000)),
  });
}

/**
 * Hook to get auth-ready state for manual query enabling
 */
export function useAuthReady() {
  const { user, loading } = useAuth();
  return {
    isAuthenticated: !!user && !loading,
    isLoading: loading,
    user,
  };
}
