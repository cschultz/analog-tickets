import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTesting, TestingProvider, useActiveTestFeatures } from '@/contexts/TestingContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TestingProvider>{children}</TestingProvider>
);

describe('TestingContext', () => {
  it('provides default testing state', () => {
    const { result } = renderHook(() => useTesting(), { wrapper });
    expect(result.current.stripeTestMode).toBe(false);
    expect(result.current.simulatedEventState).toBe('active');
  });

  it('allows updating stripe test mode', () => {
    const { result } = renderHook(() => useTesting(), { wrapper });
    act(() => { result.current.setStripeTestMode(true); });
    expect(result.current.stripeTestMode).toBe(true);
  });

  it('tracks active test features', () => {
    const { result } = renderHook(() => useTesting(), { wrapper });
    expect(result.current.getActiveTestFeatures()).toHaveLength(0);
    act(() => { result.current.setStripeTestMode(true); });
    expect(result.current.getActiveTestFeatures()).toContain('Stripe Test Mode');
  });
});
