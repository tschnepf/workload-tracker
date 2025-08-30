/**
 * Performance Monitoring - Phase 5 Optimization
 * Tracks Web Vitals and custom performance metrics
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';

// Performance thresholds based on Web Vitals recommendations
const PERFORMANCE_THRESHOLDS = {
  // Core Web Vitals
  CLS: { good: 0.1, needsImprovement: 0.25 },      // Cumulative Layout Shift
  FID: { good: 100, needsImprovement: 300 },       // First Input Delay (ms)
  LCP: { good: 2500, needsImprovement: 4000 },     // Largest Contentful Paint (ms)
  
  // Additional metrics
  FCP: { good: 1800, needsImprovement: 3000 },     // First Contentful Paint (ms)
  TTFB: { good: 800, needsImprovement: 1800 },     // Time to First Byte (ms)
} as const;

type MetricName = keyof typeof PERFORMANCE_THRESHOLDS;
type PerformanceScore = 'good' | 'needsImprovement' | 'poor';

interface PerformanceData {
  metric: MetricName;
  value: number;
  score: PerformanceScore;
  timestamp: number;
  url: string;
}

// In-memory storage for metrics (in production, you'd send to analytics service)
const performanceMetrics: PerformanceData[] = [];

/**
 * Determine performance score based on thresholds
 */
function getPerformanceScore(metric: MetricName, value: number): PerformanceScore {
  const thresholds = PERFORMANCE_THRESHOLDS[metric];
  
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needsImprovement';
  return 'poor';
}

/**
 * Handle Web Vitals metric collection
 */
function handleMetric(metric: Metric) {
  const performanceData: PerformanceData = {
    metric: metric.name as MetricName,
    value: metric.value,
    score: getPerformanceScore(metric.name as MetricName, metric.value),
    timestamp: Date.now(),
    url: window.location.pathname,
  };
  
  // Store metric
  performanceMetrics.push(performanceData);
  
  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 [Performance] ${metric.name}: ${metric.value} (${performanceData.score})`, {
      value: metric.value,
      score: performanceData.score,
      threshold: PERFORMANCE_THRESHOLDS[metric.name as MetricName],
    });
  }
  
  // In production, you would send to analytics service:
  // analytics.track('performance_metric', performanceData);
}

/**
 * Initialize Web Vitals monitoring (Legacy - use monitoring.ts for production)
 */
export function initializePerformanceMonitoring() {
  try {
    // Core Web Vitals
    getCLS(handleMetric);
    getFID(handleMetric);
    getLCP(handleMetric);
    
    // Additional metrics
    getFCP(handleMetric);
    getTTFB(handleMetric);
    
    console.log('📊 Performance monitoring initialized (legacy)');
  } catch (error) {
    console.warn('Failed to initialize performance monitoring:', error);
  }
}

/**
 * Get current performance metrics summary
 */
export function getPerformanceMetrics(): PerformanceData[] {
  return [...performanceMetrics];
}

/**
 * Get performance summary for current session
 */
export function getPerformanceSummary() {
  const metrics = getPerformanceMetrics();
  const summary = {
    totalMetrics: metrics.length,
    byScore: {
      good: metrics.filter(m => m.score === 'good').length,
      needsImprovement: metrics.filter(m => m.score === 'needsImprovement').length,
      poor: metrics.filter(m => m.score === 'poor').length,
    },
    byMetric: {} as Record<MetricName, PerformanceData | null>,
  };
  
  // Get latest value for each metric
  for (const metricName of Object.keys(PERFORMANCE_THRESHOLDS) as MetricName[]) {
    const latestMetric = metrics
      .filter(m => m.metric === metricName)
      .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
    summary.byMetric[metricName] = latestMetric;
  }
  
  return summary;
}

/**
 * Custom performance timing for specific operations
 */
export class PerformanceTimer {
  private startTime: number;
  
  constructor(private label: string) {
    this.startTime = performance.now();
  }
  
  end(): number {
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️ [Performance Timer] ${this.label}: ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }
}

/**
 * Track custom performance metrics
 */
export function trackCustomMetric(name: string, value: number, unit = 'ms') {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📈 [Custom Metric] ${name}: ${value}${unit}`);
  }
  
  // In production, send to analytics
  // analytics.track('custom_performance_metric', { name, value, unit });
}

/**
 * Monitor React component render times
 */
export function withPerformanceMonitoring<T extends {}>(
  WrappedComponent: React.ComponentType<T>,
  componentName: string
) {
  return function PerformanceMonitoredComponent(props: T) {
    const timer = new PerformanceTimer(`${componentName} render`);
    
    React.useEffect(() => {
      timer.end();
    });
    
    return React.createElement(WrappedComponent, props);
  };
}