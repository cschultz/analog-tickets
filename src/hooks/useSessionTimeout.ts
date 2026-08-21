import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeInternalPath } from '@/lib/safeRedirect';

interface SessionTimeoutConfig {
  /** Warning time before session expires (ms) - default 5 minutes */
  warningBeforeMs?: number;
  /** Session timeout duration (ms) - default 60 minutes */
  timeoutMs?: number;
  /** Path to redirect on logout - default '/admin/login' */
  loginPath?: string;
  /** Enable activity-based extension */
  extendOnActivity?: boolean;
}

interface SessionTimeoutState {
  /** Whether session is about to expire */
  isWarning: boolean;
  /** Seconds remaining until expiry */
  secondsRemaining: number;
  /** Extend the session */
  extendSession: () => void;
  /** Sign out immediately */
  signOut: () => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const DEFAULT_WARNING_MS = 5 * 60 * 1000; // 5 minutes before
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

/**
 * useSessionTimeout - Graceful session timeout handling
 * 
 * Features:
 * - Warning dialog before automatic logout
 * - Optional activity-based session extension
 * - Countdown timer for UX
 * - Proper cleanup and redirect
 */
export function useSessionTimeout(config: SessionTimeoutConfig = {}): SessionTimeoutState {
  const {
    warningBeforeMs = DEFAULT_WARNING_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    loginPath = '/admin/login',
    extendOnActivity = true,
  } = config;

  const navigate = useNavigate();
  const [isWarning, setIsWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningRef = useRef<NodeJS.Timeout>();
  const countdownRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef(Date.now());

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const signOut = useCallback(async () => {
    clearTimers();
    setIsWarning(false);
    
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[SessionTimeout] Sign out error:', error);
    }
    
    navigate(loginPath, { 
      state: { 
        message: 'Your session has expired. Please sign in again.',
        returnTo: sanitizeInternalPath(window.location.pathname, "/") 
      } 
    });
  }, [clearTimers, navigate, loginPath]);

  const startCountdown = useCallback(() => {
    setIsWarning(true);
    setSecondsRemaining(Math.ceil(warningBeforeMs / 1000));

    countdownRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [warningBeforeMs]);

  const resetTimers = useCallback(() => {
    clearTimers();
    setIsWarning(false);
    lastActivityRef.current = Date.now();

    // Set warning timer
    warningRef.current = setTimeout(() => {
      startCountdown();
    }, timeoutMs - warningBeforeMs);

    // Set final timeout
    timeoutRef.current = setTimeout(() => {
      signOut();
    }, timeoutMs);
  }, [clearTimers, timeoutMs, warningBeforeMs, startCountdown, signOut]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  // Handle user activity
  useEffect(() => {
    if (!extendOnActivity) return;

    const handleActivity = () => {
      // Only reset if not in warning state and enough time has passed (debounce)
      if (!isWarning && Date.now() - lastActivityRef.current > 60000) {
        resetTimers();
      }
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [extendOnActivity, isWarning, resetTimers]);

  // Initialize timers on mount
  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        resetTimers();
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        resetTimers();
      } else if (event === 'SIGNED_OUT') {
        clearTimers();
      }
    });

    return () => {
      clearTimers();
      subscription.unsubscribe();
    };
  }, [resetTimers, clearTimers]);

  return {
    isWarning,
    secondsRemaining,
    extendSession,
    signOut,
  };
}

export default useSessionTimeout;
