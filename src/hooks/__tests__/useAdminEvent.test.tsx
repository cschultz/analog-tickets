import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({
          data: [{ id: 'event-1', title: 'Event 1', event_date: '2024-06-01', status: 'published', is_active: true }],
          error: null,
        }),
      }),
    }),
  },
}));

import { AdminEventProvider, useAdminEvent } from '../useAdminEvent';

describe('useAdminEvent', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminEventProvider>{children}</AdminEventProvider>
    </QueryClientProvider>
  );

  it('throws error when used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAdminEvent())).toThrow('useAdminEvent must be used within an AdminEventProvider');
    consoleSpy.mockRestore();
  });

  it('provides context values', async () => {
    const { result } = renderHook(() => useAdminEvent(), { wrapper });
    
    // Wait for the query to resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    expect(result.current.setSelectedEventId).toBeInstanceOf(Function);
  });
});
