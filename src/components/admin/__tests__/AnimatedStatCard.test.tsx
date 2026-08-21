import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnimatedStatCard } from '@/components/admin/AnimatedStatCard';
import { DollarSign } from 'lucide-react';

describe('AnimatedStatCard', () => {
  it('renders with basic props', () => {
    const { getByText } = render(
      <AnimatedStatCard label="Revenue" value={5000} icon={DollarSign} />
    );
    expect(getByText('Revenue')).toBeTruthy();
  });

  it('shows positive trend', () => {
    const { getByText } = render(
      <AnimatedStatCard label="Growth" value={25} trend={{ value: 10 }} icon={DollarSign} />
    );
    expect(getByText('Growth')).toBeTruthy();
    expect(getByText('+10.0%')).toBeTruthy();
  });

  it('shows negative trend', () => {
    const { getByText } = render(
      <AnimatedStatCard label="Decline" value={25} trend={{ value: -5 }} icon={DollarSign} />
    );
    expect(getByText('-5.0%')).toBeTruthy();
  });
});
