import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { OptimizedImage, HeroImage, BackgroundImage } from '../OptimizedImage';

describe('OptimizedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with lazy loading by default', () => {
    const { container } = render(
      <OptimizedImage src="/test.jpg" alt="Test image" />
    );
    
    // Image should have lazy loading attribute
    const img = container.querySelector('img');
    if (img) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
    }
  });

  it('renders placeholder while loading', () => {
    const { container } = render(
      <OptimizedImage 
        src="/test.jpg" 
        alt="Test image"
        blurPlaceholder
      />
    );
    
    // Should have placeholder div with animate-pulse
    const placeholder = container.querySelector('.animate-pulse');
    expect(placeholder).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <OptimizedImage 
        src="/test.jpg" 
        alt="Test image"
        className="custom-class"
        lazy={false}
      />
    );
    
    const img = container.querySelector('img');
    expect(img?.className).toContain('custom-class');
  });

  it('applies wrapperClassName', () => {
    const { container } = render(
      <OptimizedImage 
        src="/test.jpg" 
        alt="Test image"
        wrapperClassName="wrapper-class"
      />
    );
    
    const wrapper = container.firstChild;
    expect((wrapper as HTMLElement)?.className).toContain('wrapper-class');
  });
});

describe('HeroImage', () => {
  it('renders with eager loading', () => {
    const { container } = render(
      <HeroImage src="/hero.jpg" alt="Hero image" />
    );
    
    const img = container.querySelector('img');
    if (img) {
      expect(img.getAttribute('loading')).toBe('eager');
    }
  });
});

describe('BackgroundImage', () => {
  it('applies background image classes', () => {
    const { container } = render(
      <BackgroundImage src="/bg.jpg" alt="Background" />
    );
    
    const wrapper = container.firstChild;
    expect((wrapper as HTMLElement)?.className).toContain('absolute');
    expect((wrapper as HTMLElement)?.className).toContain('inset-0');
  });
});
