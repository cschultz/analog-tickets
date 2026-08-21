import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdminAvatar } from '@/components/admin/AdminPrimitives';

describe('AdminAvatar', () => {
  it('renders initials when no image provided', () => {
    const { getByText } = render(<AdminAvatar name="John Doe" />);
    expect(getByText('JD')).toBeTruthy();
  });

  it('handles single name', () => {
    const { getByText } = render(<AdminAvatar name="Alice" />);
    expect(getByText('A')).toBeTruthy();
  });
});
