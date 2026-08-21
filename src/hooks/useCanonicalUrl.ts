import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { buildCanonicalUrl } from '@/platform/config/siteIdentity';

/**
 * Sets a canonical URL for the current page to prevent duplicate content issues.
 * If the current path starts with /may/, it will canonicalize to the root path.
 *
 * The origin comes from the event contract (`identity.canonicalUrl`) with the
 * browser's own origin taking precedence, so no hostname is hardcoded here.
 *
 * @param customPath - Optional custom path to use instead of detecting from location
 */
export const useCanonicalUrl = (customPath?: string) => {
  const location = useLocation();

  useEffect(() => {
    let canonicalPath = customPath || location.pathname;

    // Remove /may prefix for legacy URLs to point to the new canonical URLs
    if (canonicalPath.startsWith('/may/')) {
      canonicalPath = canonicalPath.replace('/may', '');
    } else if (canonicalPath === '/may') {
      canonicalPath = '/';
    }

    const canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    canonicalLink.href = buildCanonicalUrl(canonicalPath);
    document.head.appendChild(canonicalLink);

    return () => {
      document.head.removeChild(canonicalLink);
    };
  }, [location.pathname, customPath]);
};
