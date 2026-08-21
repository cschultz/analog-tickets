import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionErrorBoundary, withSectionErrorBoundary } from '../SectionErrorBoundary';

function ThrowingComponent(): React.ReactElement {
  throw new Error('Test error');
}

const originalConsoleError = console.error;

describe('SectionErrorBoundary', () => {
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    const { getByText } = render(
      <SectionErrorBoundary>
        <div>Hello World</div>
      </SectionErrorBoundary>
    );
    expect(getByText('Hello World')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    const { getByText } = render(
      <SectionErrorBoundary sectionName="Test Section">
        <ThrowingComponent />
      </SectionErrorBoundary>
    );
    expect(getByText('Test Section failed to load')).toBeInTheDocument();
  });

  it('renders compact error UI', () => {
    const { getByText, getByRole } = render(
      <SectionErrorBoundary compact sectionName="Widget">
        <ThrowingComponent />
      </SectionErrorBoundary>
    );
    expect(getByText('Widget failed to load')).toBeInTheDocument();
    expect(getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const { getByText } = render(
      <SectionErrorBoundary fallback={<div>Custom Fallback</div>}>
        <ThrowingComponent />
      </SectionErrorBoundary>
    );
    expect(getByText('Custom Fallback')).toBeInTheDocument();
  });

  it('renders nothing in silent mode', () => {
    const { container } = render(
      <SectionErrorBoundary silent>
        <ThrowingComponent />
      </SectionErrorBoundary>
    );
    expect(container.innerHTML).toBe('');
  });

  it('calls onError callback', () => {
    const onError = vi.fn();
    render(
      <SectionErrorBoundary onError={onError}>
        <ThrowingComponent />
      </SectionErrorBoundary>
    );
    expect(onError).toHaveBeenCalled();
  });

  it('recovers on retry click', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    const DynamicComponent = () => {
      if (shouldThrow) throw new Error('Error');
      return <div>Recovered</div>;
    };

    const { getByRole, getByText } = render(
      <SectionErrorBoundary>
        <DynamicComponent />
      </SectionErrorBoundary>
    );

    expect(getByText('This section encountered an error')).toBeInTheDocument();
    
    shouldThrow = false;
    await user.click(getByRole('button', { name: /Try Again/i }));
    
    expect(getByText('Recovered')).toBeInTheDocument();
  });
});

describe('withSectionErrorBoundary HOC', () => {
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('wraps component with error boundary', () => {
    const WrappedComponent = withSectionErrorBoundary(ThrowingComponent, { sectionName: 'HOC Test' });
    const { getByText } = render(<WrappedComponent />);
    expect(getByText('HOC Test failed to load')).toBeInTheDocument();
  });
});
