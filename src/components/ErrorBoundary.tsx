import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Auto-recover from stale-chunk / module load failures (common after a
    // deploy when a mobile browser has cached old HTML). Guarded by
    // sessionStorage so we never loop if the refresh itself fails.
    if (this.isRecoverableClientVersionError()) {
      try {
        const guardKey = '__cosmico_chunk_recovery__';
        if (!sessionStorage.getItem(guardKey)) {
          sessionStorage.setItem(guardKey, String(Date.now()));
          void this.hardRefreshCurrentPage();
          return;
        }
      } catch {
        // sessionStorage may be unavailable in private mode — fall through
      }
    }

    // Fire-and-forget remote logging so we can see real crashes from real users.
    try {
      const functionsBase = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
      if (!functionsBase) return;
      const url = `${functionsBase.replace(/\/+$/, '')}/functions/v1/log-client-error`;
      const payload = {
        url: window.location.href,
        route: window.location.pathname + window.location.search,
        message: error?.message || String(error),
        stack: error?.stack || null,
        componentStack: errorInfo?.componentStack || null,
        userAgent: navigator.userAgent,
        buildVersion: (window as any).__SITE_VERSION__ || null,
      };
      const body = JSON.stringify(payload);
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon?.(url, blob)) {
        // sent
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // never let logging crash the boundary
    }
  }

  private isRecoverableClientVersionError = () => {
    const message = this.state.error?.message ?? '';
    return /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Importing a module script failed|A component suspended while responding to synchronous input/i.test(message);
  };

  private hardRefreshCurrentPage = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } catch (error) {
      console.warn('Failed to clear app caches during recovery', error);
    }

    const url = new URL(window.location.href);
    url.searchParams.set('__refresh', Date.now().toString(36));
    window.location.replace(url.toString());
  };

  private handleRetry = () => {
    // Always do a full cache + service-worker flush + reload.
    // Soft state-reset rarely fixes the underlying issue (stale chunk, bad
    // cached HTML, ghost SW), so we treat every Try Again as a hard refresh.
    void this.hardRefreshCurrentPage();
  };

  private handleSoftRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-muted-foreground mb-6">
              We encountered an unexpected error. Please try again or return to the home page.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-6 text-left bg-muted p-4 rounded-lg text-sm">
                <summary className="cursor-pointer font-medium mb-2">
                  Error details
                </summary>
                <pre className="whitespace-pre-wrap text-xs text-destructive overflow-auto max-h-48">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh & clear cache
              </Button>
              <Button onClick={this.handleGoHome}>
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Still stuck after a refresh? Email <a href="mailto:hello@example.org" className="underline">hello@example.org</a> and we'll sort it personally.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
