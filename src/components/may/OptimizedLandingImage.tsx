import { useState, useRef, useEffect, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedLandingImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** If true, loads immediately (for hero/LCP images) */
  eager?: boolean;
  /** Priority loading hint */
  priority?: boolean;
}

/**
 * Lightweight optimized image for landing page
 * Uses native lazy loading + intersection observer for maximum performance
 */
export const OptimizedLandingImage = ({
  src,
  alt,
  className,
  style,
  eager = false,
  priority = false,
}: OptimizedLandingImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(eager);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (eager || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before entering viewport
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [eager, isInView]);

  return (
    <img
      ref={imgRef}
      src={isInView ? src : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding={eager ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      onLoad={() => setIsLoaded(true)}
      className={cn(
        'transition-opacity duration-300',
        isLoaded ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={style}
    />
  );
};

export default OptimizedLandingImage;
