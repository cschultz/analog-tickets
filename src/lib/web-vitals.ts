import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from 'web-vitals';

/**
 * Core Web Vitals thresholds (as per Google recommendations)
 */
const THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 }, // Largest Contentful Paint
  INP: { good: 200, needsImprovement: 500 },   // Interaction to Next Paint
  CLS: { good: 0.1, needsImprovement: 0.25 },  // Cumulative Layout Shift
  FCP: { good: 1800, needsImprovement: 3000 }, // First Contentful Paint
  TTFB: { good: 800, needsImprovement: 1800 }, // Time to First Byte
} as const;

type MetricName = keyof typeof THRESHOLDS;

/**
 * Determine metric rating based on thresholds
 */
function getRating(name: MetricName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Format metric for logging
 */
function formatMetric(metric: Metric): string {
  const rating = getRating(metric.name as MetricName, metric.value);
  const emoji = rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌';
  const unit = metric.name === 'CLS' ? '' : 'ms';
  const value = metric.name === 'CLS' ? metric.value.toFixed(3) : Math.round(metric.value);
  
  return `${emoji} ${metric.name}: ${value}${unit} (${rating})`;
}

interface VitalsConfig {
  /** Enable console logging (default: development only) */
  enableLogging?: boolean;
  /** Custom callback for sending metrics to analytics */
  onMetric?: (metric: Metric & { rating: string }) => void;
  /** Enable sending to analytics endpoint */
  sendToAnalytics?: boolean;
}

/**
 * Initialize Core Web Vitals monitoring
 * 
 * Tracks LCP, INP, CLS, FCP, and TTFB metrics.
 * In development, logs to console. Can optionally send to analytics.
 */
export function initWebVitals(config: VitalsConfig = {}) {
  const {
    enableLogging = import.meta.env.DEV,
    onMetric,
    sendToAnalytics = false,
  } = config;

  const handleMetric = (metric: Metric) => {
    const rating = getRating(metric.name as MetricName, metric.value);
    
    // Console logging in development
    if (enableLogging) {
      console.log(`[Web Vitals] ${formatMetric(metric)}`);
    }
    
    // Custom callback
    if (onMetric) {
      onMetric({ ...metric, rating });
    }
    
    // Send to analytics endpoint if enabled
    if (sendToAnalytics) {
      sendToAnalyticsEndpoint(metric, rating);
    }
  };

  // Register all metric observers
  onLCP(handleMetric);
  onINP(handleMetric);
  onCLS(handleMetric);
  onFCP(handleMetric);
  onTTFB(handleMetric);
}

/**
 * Send metric to analytics endpoint
 */
async function sendToAnalyticsEndpoint(metric: Metric, rating: string) {
  try {
    // Use navigator.sendBeacon for reliable delivery
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating,
      id: metric.id,
      navigationType: metric.navigationType,
      url: window.location.href,
      timestamp: Date.now(),
    });

    // sendBeacon is more reliable for unload events
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/vitals', body);
    } else {
      // Fallback to fetch for older browsers
      fetch('/api/analytics/vitals', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {
        // Silently fail - analytics shouldn't break the app
      });
    }
  } catch {
    // Silently fail
  }
}

/**
 * Get current performance metrics snapshot
 * Useful for manual performance audits
 */
export function getPerformanceSnapshot(): Record<string, number | null> {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paint = performance.getEntriesByType('paint');
  
  const fcp = paint.find(p => p.name === 'first-contentful-paint');
  
  return {
    // Navigation timing
    dns: navigation ? navigation.domainLookupEnd - navigation.domainLookupStart : null,
    tcp: navigation ? navigation.connectEnd - navigation.connectStart : null,
    ttfb: navigation ? navigation.responseStart - navigation.requestStart : null,
    domInteractive: navigation ? navigation.domInteractive - navigation.fetchStart : null,
    domComplete: navigation ? navigation.domComplete - navigation.fetchStart : null,
    loadComplete: navigation ? navigation.loadEventEnd - navigation.fetchStart : null,
    
    // Paint timing
    fcp: fcp?.startTime ?? null,
    
    // Memory (if available)
    jsHeapSize: (performance as any).memory?.usedJSHeapSize ?? null,
  };
}

/**
 * Log a performance summary to console
 */
export function logPerformanceSummary() {
  const snapshot = getPerformanceSnapshot();
  
  console.group('🚀 Performance Summary');
  console.log(`DNS Lookup: ${snapshot.dns?.toFixed(0)}ms`);
  console.log(`TCP Connect: ${snapshot.tcp?.toFixed(0)}ms`);
  console.log(`TTFB: ${snapshot.ttfb?.toFixed(0)}ms`);
  console.log(`DOM Interactive: ${snapshot.domInteractive?.toFixed(0)}ms`);
  console.log(`DOM Complete: ${snapshot.domComplete?.toFixed(0)}ms`);
  console.log(`Page Load: ${snapshot.loadComplete?.toFixed(0)}ms`);
  console.log(`FCP: ${snapshot.fcp?.toFixed(0)}ms`);
  if (snapshot.jsHeapSize) {
    console.log(`JS Heap: ${(snapshot.jsHeapSize / 1024 / 1024).toFixed(1)}MB`);
  }
  console.groupEnd();
}

export default initWebVitals;
