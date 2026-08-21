import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Name of the section for error reporting */
  sectionName?: string;
  /** Compact mode for smaller sections */
  compact?: boolean;
  /** Custom fallback content */
  fallback?: ReactNode;
  /** Hide error UI entirely (for non-critical sections) */
  silent?: boolean;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * SectionErrorBoundary - Granular error boundary for page sections
 * 
 * Use this to wrap individual sections of a page so that one failing
 * component doesn't take down the entire page.
 * 
 * Features:
 * - Compact error UI that fits within section layouts
 * - Silent mode for non-critical sections
 * - Retry functionality
 * - Error tracking callback
 */
export class SectionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { sectionName = 'Unknown section', onError } = this.props;
    console.error(`[SectionErrorBoundary] Error in ${sectionName}:`, error, errorInfo);
    onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    const { hasError } = this.state;
    const { children, sectionName, compact, fallback, silent } = this.props;

    if (!hasError) {
      return children;
    }

    // Silent mode: render nothing on error
    if (silent) {
      return null;
    }

    // Custom fallback
    if (fallback) {
      return fallback;
    }

    // Compact error UI
    if (compact) {
      return (
        <div className="flex items-center justify-center gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {sectionName ? `${sectionName} failed to load` : 'Section unavailable'}
          </span>
          <Button variant="ghost" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      );
    }

    // Standard error UI
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 bg-muted/20 rounded-lg border border-border/30 min-h-[200px]">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-muted-foreground" />
          <span className="text-muted-foreground">
            {sectionName ? `${sectionName} failed to load` : 'This section encountered an error'}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={this.handleRetry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }
}

/**
 * HOC for wrapping components with section error boundary
 */
export function withSectionErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<Props, 'children'>
) {
  return function WithSectionErrorBoundary(props: P) {
    return (
      <SectionErrorBoundary {...options}>
        <WrappedComponent {...props} />
      </SectionErrorBoundary>
    );
  };
}

export default SectionErrorBoundary;
