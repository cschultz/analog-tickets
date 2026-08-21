import { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Responsive image size configuration
 */
interface ResponsiveSize {
  /** Viewport width breakpoint */
  readonly breakpoint: number;
  /** Image width at this breakpoint */
  readonly width: number;
}

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> {
  /** The image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Enable lazy loading (default: true) */
  lazy?: boolean;
  /** Show blur placeholder while loading (default: true) */
  blurPlaceholder?: boolean;
  /** Placeholder color while loading */
  placeholderColor?: string;
  /** Custom fallback image on error */
  fallbackSrc?: string;
  /** Additional class names for the wrapper */
  wrapperClassName?: string;
  /** Responsive sizes for srcSet generation */
  responsiveSizes?: readonly ResponsiveSize[];
  /** Sizes attribute for responsive images */
  sizes?: string;
  /** Callback when image loads successfully */
  onLoadSuccess?: () => void;
  /** Callback when image fails to load */
  onLoadError?: (error: Error) => void;
}

/**
 * Common responsive size presets
 */
export const RESPONSIVE_PRESETS = {
  /** Full-width hero images */
  hero: [
    { breakpoint: 640, width: 640 },
    { breakpoint: 768, width: 768 },
    { breakpoint: 1024, width: 1024 },
    { breakpoint: 1280, width: 1280 },
    { breakpoint: 1536, width: 1536 },
  ],
  /** Card/thumbnail images */
  card: [
    { breakpoint: 320, width: 320 },
    { breakpoint: 480, width: 480 },
    { breakpoint: 640, width: 640 },
  ],
  /** Avatar/profile images */
  avatar: [
    { breakpoint: 48, width: 48 },
    { breakpoint: 96, width: 96 },
    { breakpoint: 192, width: 192 },
  ],
} as const;

/**
 * Generate srcSet string from responsive sizes
 * For bundled assets (imported images), returns undefined since they're already optimized
 */
function generateSrcSet(src: string, sizes: readonly ResponsiveSize[]): string | undefined {
  // Skip srcSet for data URLs or bundled assets (those typically have hashes)
  if (src.startsWith('data:') || src.includes('/assets/')) {
    return undefined;
  }
  
  // For external URLs or storage URLs, we can generate srcSet
  // This assumes the image service supports width parameters
  if (src.includes('supabase.co/storage')) {
    return sizes
      .map(({ width }) => {
        const url = new URL(src);
        url.searchParams.set('width', width.toString());
        return `${url.toString()} ${width}w`;
      })
      .join(', ');
  }
  
  return undefined;
}

/**
 * Generate sizes attribute from responsive sizes
 */
function generateSizesAttr(sizes: readonly ResponsiveSize[]): string {
  const sortedSizes = [...sizes].sort((a, b) => b.breakpoint - a.breakpoint);
  
  return sortedSizes
    .map(({ breakpoint, width }, index) => {
      if (index === sortedSizes.length - 1) {
        return `${width}px`;
      }
      return `(min-width: ${breakpoint}px) ${width}px`;
    })
    .join(', ');
}

/**
 * OptimizedImage - Performance-optimized image component
 * 
 * Features:
 * - Native lazy loading with Intersection Observer fallback
 * - Blur-up placeholder effect during load
 * - Responsive srcSet generation for supported image sources
 * - Error handling with optional fallback
 * - Fade-in animation on load
 * - Proper loading states for CLS prevention
 */
export function OptimizedImage({
  src,
  alt,
  lazy = true,
  blurPlaceholder = true,
  placeholderColor = 'rgba(200, 200, 200, 0.3)',
  fallbackSrc,
  className,
  wrapperClassName,
  responsiveSizes,
  sizes,
  onLoadSuccess,
  onLoadError,
  style,
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0,
      }
    );

    if (wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, isInView]);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    onLoadSuccess?.();
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
    onLoadError?.(new Error(`Failed to load image: ${src}`));
  };

  const effectiveSrc = hasError && fallbackSrc ? fallbackSrc : src;
  
  // Generate srcSet if responsive sizes provided
  const srcSet = responsiveSizes ? generateSrcSet(effectiveSrc, responsiveSizes) : undefined;
  const sizesAttr = sizes || (responsiveSizes ? generateSizesAttr(responsiveSizes) : undefined);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative overflow-hidden',
        wrapperClassName
      )}
      style={{
        backgroundColor: !isLoaded ? placeholderColor : undefined,
      }}
    >
      {/* Blur placeholder overlay */}
      {blurPlaceholder && !isLoaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            backgroundColor: placeholderColor,
            backdropFilter: 'blur(10px)',
          }}
        />
      )}

      {/* Only render img when in view (for lazy loading) */}
      {isInView && (
        <img
          src={effectiveSrc}
          srcSet={srcSet}
          sizes={sizesAttr}
          alt={alt}
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            className
          )}
          style={style}
          {...props}
        />
      )}

      {/* Error state indicator */}
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <span className="text-xs text-muted-foreground">Image unavailable</span>
        </div>
      )}
    </div>
  );
}

/**
 * Hero-optimized image - eager loading for LCP optimization
 */
export function HeroImage(props: Omit<OptimizedImageProps, 'lazy' | 'blurPlaceholder'>) {
  return (
    <OptimizedImage
      {...props}
      lazy={false}
      blurPlaceholder={false}
      responsiveSizes={props.responsiveSizes || RESPONSIVE_PRESETS.hero}
    />
  );
}

/**
 * Background image component with object-cover and full dimensions
 */
export function BackgroundImage({
  className,
  wrapperClassName,
  ...props
}: OptimizedImageProps) {
  return (
    <OptimizedImage
      {...props}
      wrapperClassName={cn('absolute inset-0', wrapperClassName)}
      className={cn('w-full h-full object-cover', className)}
      responsiveSizes={props.responsiveSizes || RESPONSIVE_PRESETS.hero}
    />
  );
}

/**
 * Card image with optimized responsive sizes
 */
export function CardImage(props: Omit<OptimizedImageProps, 'responsiveSizes'>) {
  return (
    <OptimizedImage
      {...props}
      responsiveSizes={RESPONSIVE_PRESETS.card}
    />
  );
}

export default OptimizedImage;
