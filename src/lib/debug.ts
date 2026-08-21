// Debug logging utility
// Set DEBUG=true in localStorage to enable debug logs: localStorage.setItem('DEBUG', 'true')

const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('DEBUG') === 'true';
};

/**
 * Debug logger that only outputs when DEBUG is enabled in localStorage
 * Usage: debug.log('message', data) instead of console.log('message', data)
 */
export const debug = {
  log: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.log('[DEBUG]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.warn('[DEBUG]', ...args);
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors
    console.error(...args);
  },
  info: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.info('[DEBUG]', ...args);
    }
  },
  table: (data: unknown) => {
    if (isDebugEnabled()) {
      console.table(data);
    }
  },
  group: (label: string) => {
    if (isDebugEnabled()) {
      console.group(`[DEBUG] ${label}`);
    }
  },
  groupEnd: () => {
    if (isDebugEnabled()) {
      console.groupEnd();
    }
  },
};

// Helper to check if debug is enabled
export const isDebug = isDebugEnabled;
