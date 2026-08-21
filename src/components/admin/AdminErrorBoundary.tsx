import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard, Bug } from 'lucide-react';
import { AdminButton } from '@/components/admin/AdminUI';

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

export class AdminErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AdminErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoToDashboard = () => {
    window.location.href = '/admin';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            {/* Error Icon */}
            <div className="mx-auto w-16 h-16 bg-[hsl(var(--admin-error))]/10 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-[hsl(var(--admin-error))]" />
            </div>
            
            {/* Error Message */}
            <h2 className="text-xl font-semibold text-[hsl(var(--admin-text))] mb-2">
              Something went wrong
            </h2>
            <p className="text-[hsl(var(--admin-text-muted))] mb-6">
              We encountered an unexpected error while loading this page. Please try again or return to the dashboard.
            </p>
            
            {/* Error Details (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-6 text-left bg-[hsl(var(--admin-hover))] p-4 rounded-lg text-sm border border-[hsl(var(--admin-border))]">
                <summary className="cursor-pointer font-medium mb-2 text-[hsl(var(--admin-text))] flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  Error details
                </summary>
                <pre className="whitespace-pre-wrap text-xs text-[hsl(var(--admin-error))] overflow-auto max-h-48 mt-2 p-2 bg-[hsl(var(--admin-surface))] rounded">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <AdminButton variant="adminOutline" onClick={this.handleRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </AdminButton>
              <AdminButton variant="admin" onClick={this.handleGoToDashboard}>
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Go to Dashboard
              </AdminButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping components with admin error boundary
export function withAdminErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithAdminErrorBoundary(props: P) {
    return (
      <AdminErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </AdminErrorBoundary>
    );
  };
}
