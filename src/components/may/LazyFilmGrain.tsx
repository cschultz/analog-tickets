import { useState, useEffect } from 'react';
import { filmGrain } from '@/styles/may-theme';

interface LazyFilmGrainProps {
  opacity?: number;
}

/**
 * Performance-optimized film grain overlay
 * Defers grain rendering until after initial paint to improve LCP
 */
const LazyFilmGrain = ({ opacity = 0.5 }: LazyFilmGrainProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Defer grain rendering to allow main content to paint first
    const timeoutId = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timeoutId);
  }, []);

  if (!isVisible) return null;

  return (
    <>
      {/* Vertical gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.08) 100%)',
          mixBlendMode: 'overlay',
        }}
      />
      {/* Dense film grain */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          ...filmGrain,
          opacity: opacity,
          mixBlendMode: 'overlay',
        }}
      />
    </>
  );
};

export default LazyFilmGrain;
