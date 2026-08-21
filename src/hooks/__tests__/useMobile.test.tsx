import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../use-mobile';

describe('useIsMobile', () => {
  const MOBILE_BREAKPOINT = 768;
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let listeners: Map<string, Set<(e: MediaQueryListEvent) => void>>;

  beforeEach(() => {
    listeners = new Map();
    
    matchMediaMock = vi.fn((query: string) => {
      const mediaQueryList = {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, callback: (e: MediaQueryListEvent) => void) => {
          if (!listeners.has(query)) {
            listeners.set(query, new Set());
          }
          listeners.get(query)!.add(callback);
        }),
        removeEventListener: vi.fn((event: string, callback: (e: MediaQueryListEvent) => void) => {
          listeners.get(query)?.delete(callback);
        }),
        dispatchEvent: vi.fn(),
      };
      
      // Check if window width is below breakpoint
      if (query.includes(`${MOBILE_BREAKPOINT - 1}px`)) {
        mediaQueryList.matches = window.innerWidth < MOBILE_BREAKPOINT;
      }
      
      return mediaQueryList;
    });
    
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false for desktop viewport', () => {
    // Simulate desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    
    const { result } = renderHook(() => useIsMobile());
    
    expect(result.current).toBe(false);
  });

  it('returns true for mobile viewport', () => {
    // Simulate mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    
    // Update matchMedia to return true for mobile query
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    
    const { result } = renderHook(() => useIsMobile());
    
    expect(result.current).toBe(true);
  });

  it('updates on viewport change', () => {
    let currentMatches = false;
    const changeListeners: ((e: MediaQueryListEvent) => void)[] = [];
    
    matchMediaMock.mockImplementation((query: string) => ({
      matches: currentMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, callback: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          changeListeners.push(callback);
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    
    const { result } = renderHook(() => useIsMobile());
    
    expect(result.current).toBe(false);
    
    // Simulate viewport change to mobile
    currentMatches = true;
    act(() => {
      changeListeners.forEach(listener => {
        listener({ matches: true } as MediaQueryListEvent);
      });
    });
    
    expect(result.current).toBe(true);
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerMock = vi.fn();
    
    matchMediaMock.mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerMock,
      dispatchEvent: vi.fn(),
    }));
    
    const { unmount } = renderHook(() => useIsMobile());
    
    unmount();
    
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
