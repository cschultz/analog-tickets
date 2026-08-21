import { useEffect } from 'react';
import { getSupabaseOrigin } from "@/platform/config/env";


interface PreloadConfig {
  /** URL of the resource to preload */
  href: string;
  /** Resource type: 'image', 'font', 'style', 'script' */
  as: 'image' | 'font' | 'style' | 'script';
  /** MIME type (optional, for images: 'image/webp', 'image/jpeg', etc.) */
  type?: string;
  /** Crossorigin attribute for fonts */
  crossOrigin?: 'anonymous' | 'use-credentials';
  /** Media query for responsive preloading */
  media?: string;
  /** fetchpriority hint */
  fetchPriority?: 'high' | 'low' | 'auto';
}

/**
 * Programmatically add preload hints to the document head
 * 
 * Use this for critical above-the-fold resources like:
 * - Hero images (LCP optimization)
 * - Custom fonts
 * - Critical CSS
 */
export function addPreloadHint(config: PreloadConfig): () => void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = config.href;
  link.as = config.as;

  if (config.type) {
    link.type = config.type;
  }

  if (config.crossOrigin) {
    link.crossOrigin = config.crossOrigin;
  }

  if (config.media) {
    link.media = config.media;
  }

  if (config.fetchPriority) {
    link.setAttribute('fetchpriority', config.fetchPriority);
  }

  // Add a data attribute to identify our preload hints
  link.setAttribute('data-preload', 'dynamic');

  document.head.appendChild(link);

  // Return cleanup function
  return () => {
    document.head.removeChild(link);
  };
}

/**
 * Hook to preload images for the current page
 * 
 * @param imageSrcs - Array of image URLs to preload
 * @param enabled - Whether preloading is enabled (default: true)
 */
export function useImagePreload(imageSrcs: string[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || imageSrcs.length === 0) return;

    const cleanups: (() => void)[] = [];

    imageSrcs.forEach((src, index) => {
      const cleanup = addPreloadHint({
        href: src,
        as: 'image',
        // First image gets high priority (likely hero/LCP)
        fetchPriority: index === 0 ? 'high' : 'auto',
      });
      cleanups.push(cleanup);
    });

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [imageSrcs, enabled]);
}

/**
 * Preload critical hero images for the main landing pages
 * Call this from the Index page component
 */
export function preloadHeroImages(images: string[]) {
  images.forEach((src, index) => {
    addPreloadHint({
      href: src,
      as: 'image',
      fetchPriority: index === 0 ? 'high' : 'auto',
    });
  });
}

/**
 * DNS prefetch for external resources
 * Helps reduce latency for third-party domains
 */
export function addDnsPrefetch(domain: string): () => void {
  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = domain;
  link.setAttribute('data-prefetch', 'dynamic');
  
  document.head.appendChild(link);
  
  return () => {
    document.head.removeChild(link);
  };
}

/**
 * Preconnect to external origins
 * Establishes early connections for faster resource loading
 */
export function addPreconnect(origin: string): () => void {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.setAttribute('data-preconnect', 'dynamic');
  
  document.head.appendChild(link);
  
  return () => {
    document.head.removeChild(link);
  };
}

/**
 * Hook to add preconnects for common external services
 */
export function useExternalPreconnects() {
  useEffect(() => {
    const origin = getSupabaseOrigin();
    const cleanups = [
      // Backend / storage origin (from env; skipped when unset)
      ...(origin ? [addPreconnect(origin)] : []),
      // Analytics/tracking (if used)
      addDnsPrefetch('https://www.google-analytics.com'),
      // QR code generation API
      addDnsPrefetch('https://api.qrserver.com'),
    ];

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, []);
}

export default {
  addPreloadHint,
  useImagePreload,
  preloadHeroImages,
  addDnsPrefetch,
  addPreconnect,
  useExternalPreconnects,
};
