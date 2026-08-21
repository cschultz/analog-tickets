import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BulkActionBar, commonBulkActions } from '../BulkActionBar';

describe('BulkActionBar', () => {
  const defaultProps = {
    selectedCount: 3,
    actions: [{ label: 'Email', onClick: vi.fn() }],
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when items are selected', () => {
    const { getByText } = render(<BulkActionBar {...defaultProps} />);
    expect(getByText('selected')).toBeInTheDocument();
    expect(getByText('3')).toBeInTheDocument();
  });

  it('does not render when no items are selected', () => {
    const { queryByText } = render(<BulkActionBar {...defaultProps} selectedCount={0} />);
    expect(queryByText('selected')).not.toBeInTheDocument();
  });

  it('renders action buttons', () => {
    const { getByRole } = render(<BulkActionBar {...defaultProps} />);
    expect(getByRole('button', { name: /Email/i })).toBeInTheDocument();
  });
});

describe('commonBulkActions', () => {
  it('creates email action', () => {
    const onClick = vi.fn();
    const action = commonBulkActions.email(onClick);
    expect(action.label).toBe('Email');
  });

  it('creates delete action with destructive variant', () => {
    const onClick = vi.fn();
    const action = commonBulkActions.delete(onClick);
    expect(action.variant).toBe('destructive');
  });
});
