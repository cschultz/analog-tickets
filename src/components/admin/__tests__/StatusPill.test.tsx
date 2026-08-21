import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusPill, StatusDot, AdminStatusIndicator } from '../StatusPill';

describe('StatusPill', () => {
  it('renders with correct label for known status', () => {
    const { getByText } = render(<StatusPill status="confirmed" />);
    expect(getByText('Confirmed')).toBeInTheDocument();
  });

  it('shows dot by default', () => {
    const { container } = render(<StatusPill status="active" />);
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeInTheDocument();
  });

  it('hides dot when showDot is false', () => {
    const { container } = render(<StatusPill status="active" showDot={false} />);
    const dots = container.querySelectorAll('.h-1\\.5.w-1\\.5');
    expect(dots.length).toBe(0);
  });

  it('applies custom className', () => {
    const { container } = render(<StatusPill status="active" className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});

describe('StatusDot', () => {
  it('renders a dot element', () => {
    const { container } = render(<StatusDot status="confirmed" />);
    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
  });
});

describe('AdminStatusIndicator', () => {
  it('renders with correct label', () => {
    const { getByText } = render(<AdminStatusIndicator status="published" />);
    expect(getByText('Published')).toBeInTheDocument();
  });
});
