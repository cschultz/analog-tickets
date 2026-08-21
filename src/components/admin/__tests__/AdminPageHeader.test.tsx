import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DollarSign } from 'lucide-react';

describe('AdminPageHeader', () => {
  it('renders title correctly', () => {
    const { getByText } = render(
      <AdminPageHeader title="Test Title" subtitle="Test subtitle" />
    );
    expect(getByText('Test Title')).toBeTruthy();
    expect(getByText('Test subtitle')).toBeTruthy();
  });

  it('renders without subtitle', () => {
    const { getByText } = render(<AdminPageHeader title="Title Only" />);
    expect(getByText('Title Only')).toBeTruthy();
  });
});
