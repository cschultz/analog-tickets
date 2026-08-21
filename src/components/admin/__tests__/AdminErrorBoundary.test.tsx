import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AdminErrorBoundary, withAdminErrorBoundary } from '../AdminErrorBoundary';

function ThrowingComponent(): React.ReactElement {
  throw new Error('Test error');
}

const originalConsoleError = console.error;

describe('AdminErrorBoundary', () => {
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    const { getByText } = render(
      <AdminErrorBoundary>
        <div>Hello World</div>
      </AdminErrorBoundary>
    );
    expect(getByText('Hello World')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    const { getByText } = render(
      <AdminErrorBoundary>
        <ThrowingComponent />
      </AdminErrorBoundary>
    );
    expect(getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const { getByText } = render(
      <AdminErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowingComponent />
      </AdminErrorBoundary>
    );
    expect(getByText('Custom Error')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    const { getByRole } = render(
      <AdminErrorBoundary>
        <ThrowingComponent />
      </AdminErrorBoundary>
    );
    expect(getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Go to Dashboard/i })).toBeInTheDocument();
  });
});

describe('withAdminErrorBoundary HOC', () => {
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('wraps component with error boundary', () => {
    const WrappedComponent = withAdminErrorBoundary(ThrowingComponent);
    const { getByText } = render(<WrappedComponent />);
    expect(getByText('Something went wrong')).toBeInTheDocument();
  });
});
