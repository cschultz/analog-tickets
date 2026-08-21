import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminConfirmDialog } from '../AdminConfirmDialog';

describe('AdminConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Test Dialog',
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    const { getByText } = render(<AdminConfirmDialog {...defaultProps} />);
    expect(getByText('Test Dialog')).toBeInTheDocument();
  });

  it('does not render dialog when closed', () => {
    const { queryByText } = render(<AdminConfirmDialog {...defaultProps} open={false} />);
    expect(queryByText('Test Dialog')).not.toBeInTheDocument();
  });

  it('renders description when provided', () => {
    const { getByText } = render(<AdminConfirmDialog {...defaultProps} description="This is a description" />);
    expect(getByText('This is a description')).toBeInTheDocument();
  });

  it('renders consequences list when provided', () => {
    const { getByText } = render(
      <AdminConfirmDialog {...defaultProps} consequences={['Delete all data', 'Cannot be undone']} />
    );
    expect(getByText('Delete all data')).toBeInTheDocument();
  });

  it('renders custom action label', () => {
    const { getByRole } = render(<AdminConfirmDialog {...defaultProps} actionLabel="Delete Now" />);
    expect(getByRole('button', { name: 'Delete Now' })).toBeInTheDocument();
  });

  it('disables buttons when loading', () => {
    const { getByRole } = render(<AdminConfirmDialog {...defaultProps} isLoading />);
    expect(getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
