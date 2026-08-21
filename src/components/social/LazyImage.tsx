/**
 * LazyImage - High-performance image loading with native lazy loading
 * 
 * Uses intersection observer for visibility detection and native browser
 * lazy loading. Falls back to original URL if transform URL fails.
 */

import { memo, useState, useRef, useEffect } from "react";
import { ImageIcon } from "lucide-react";

interface LazyImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  fallbackSrc?: string | null; // Original URL to try if primary (transform) fails
}

export const LazyImage = memo(({ 
  src, 
  alt, 
  className = "",
  fallbackClassName = "",
  priority = false,
  fallbackSrc,
}: LazyImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [isVisible, setIsVisible] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  // Use intersection observer for lazy loading
  useEffect(() => {
    if (priority || !src) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src, priority]);

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-[hsl(var(--admin-surface))] ${fallbackClassName}`}>
        <ImageIcon className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className={`flex items-center justify-center bg-[hsl(var(--admin-surface))] ${fallbackClassName}`}>
        <ImageIcon className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />
      </div>
    );
  }

  const activeSrc = usingFallback && fallbackSrc ? fallbackSrc : src;

  return (
    <div ref={imgRef} className={`relative ${className}`}>
      {!isLoaded && (
        <div className={`absolute inset-0 bg-[hsl(var(--admin-surface))] animate-pulse`} />
      )}
      
      {isVisible && (
        <img
          src={activeSrc}
          alt={alt}
          className={`${className} ${isLoaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            // If the transform URL failed and we have a fallback, try that first
            if (!usingFallback && fallbackSrc && fallbackSrc !== src) {
              setUsingFallback(true);
            } else {
              setHasError(true);
            }
          }}
        />
      )}
    </div>
  );
});

LazyImage.displayName = "LazyImage";
