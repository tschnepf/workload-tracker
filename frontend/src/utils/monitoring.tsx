/**
 * Production Monitoring - Phase 6 Optimization
 * Integrates Sentry with existing Web Vitals monitoring
 */

import React from 'react';
import * as Sentry from '@sentry/react';
import { onCLS, onINP, onFCP, onLCP, onTTFB, Metric } from 'web-vitals';

// Environment configuration (Vite-first with safe fallbacks)
const viteEnv: any = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const isDevelopment = Boolean(viteEnv.DEV ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'));
const isProduction = Boolean(viteEnv.PROD ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'));
const monitoringDebug = String(viteEnv.VITE_MONITORING_DEBUG ?? (typeof process !== 'undefined' ? process.env?.VITE_MONITORING_DEBUG : '')).toLowerCase() === 'true';

function getEnv(name: string, fallback: string | undefined = undefined): string | undefined {
  const viteVal = viteEnv?.[name];
  if (viteVal !== undefined) return String(viteVal);
  const procVal = (typeof process !== 'undefined' && process.env) ? process.env[name] : undefined;
  if (procVal !== undefined) return String(procVal);
  return fallback;
}

// Performance budgets and thresholds (2024/2025 Core Web Vitals)
export const PERFORMANCE_BUDGETS = {
  // Core Web Vitals budgets
  CLS: { budget: 0.1, warning: 0.05 },          // Cumulative Layout Shift
  INP: { budget: 200, warning: 100 },           // Interaction to Next Paint (ms) - replaces FID
  LCP: { budget: 2500, warning: 2000 },         // Largest Contentful Paint (ms)
  
  // Additional metrics budgets
  FCP: { budget: 1800, warning: 1200 },         // First Contentful Paint (ms)
  TTFB: { budget: 800, warning: 600 },          // Time to First Byte (ms)
  
  // Custom metrics budgets
  BUNDLE_SIZE: { budget: 1000000, warning: 800000 }, // 1MB bundle limit
  CHUNK_COUNT: { budget: 20, warning: 15 },          // Chunk count limit
} as const;

type MetricName = 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB';
type PerformanceScore = 'good' | 'warning' | 'poor';

interface EnhancedPerformanceData {
  metric: MetricName;
  value: number;
  score: PerformanceScore;
  exceedsBudget: boolean;
  timestamp: number;
  url: string;
  sessionId: string;
  userId?: string;
}

// Session tracking
let sessionId = generateSessionId();
let performanceMetrics: EnhancedPerformanceData[] = [];

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Initialize Sentry for production monitoring
 */
export function initializeSentry() {
  // DSN + environment gating (safe, avoids noisy errors without DSN)
  const dsn = getEnv('VITE_SENTRY_DSN');
  if (!isProduction || !dsn) {
    if (monitoringDebug) {
      console.log('Monitoring: Sentry disabled', { isProduction, hasDSN: Boolean(dsn) });
    }
    return;
  }
  if (!isProduction) {
    console.log('🔍 Sentry disabled in development mode');
    return;
  }

  Sentry.init({
    dsn,
    environment: getEnv('VITE_ENVIRONMENT', isProduction ? 'production' : 'development'),
    
    // Performance monitoring integrations (v10+ syntax)
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    
    // Performance monitoring configuration
    tracesSampleRate: getEnv('VITE_SENTRY_TRACES_SAMPLE_RATE') ? 
      parseFloat(getEnv('VITE_SENTRY_TRACES_SAMPLE_RATE')!) : 0.1,
    
    // Session replay configuration
    replaysSessionSampleRate: getEnv('VITE_SENTRY_REPLAYS_SESSION_RATE') ?
      parseFloat(getEnv('VITE_SENTRY_REPLAYS_SESSION_RATE')!) : 0.0,
    replaysOnErrorSampleRate: getEnv('VITE_SENTRY_REPLAYS_ERROR_RATE') ?
      parseFloat(getEnv('VITE_SENTRY_REPLAYS_ERROR_RATE')!) : 1.0,
    
    // Release tracking
    release: getEnv('VITE_APP_VERSION') || 'dev',
    
    // Error filtering
    beforeSend(event) {
      // Filter out known non-critical errors
      if (event.exception) {
        const error = event.exception.values?.[0];
        if (error?.value?.includes('ResizeObserver loop limit exceeded')) {
          return null; // Ignore ResizeObserver errors
        }
      }
      // Sanitize URL and redact common PII before sending in production
      try {
        if ((event as any).request?.url) {
          const url = new URL((event as any).request.url);
          url.search = '';
          (event as any).request.url = url.toString();
        }
        if (event.user) {
          // Keep only an anonymous id
          event.user = { id: (event.user as any).id } as any;
        }
        const redactKeys = ['email', 'phone', 'name'];
        const redact = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          for (const k of Object.keys(obj)) {
            if (redactKeys.includes(k)) obj[k] = '[REDACTED]';
            else if (typeof obj[k] === 'object') redact(obj[k]);
          }
        };
        redact((event as any).extra);
        redact((event as any).contexts);
      } catch { /* noop */ }
      return event;
    },
  });
  if (monitoringDebug) {
    console.log('Monitoring: Sentry initialized');
  }
}

/**
 * Determine performance score with budget awareness
 */
function getPerformanceScore(metric: MetricName, value: number): PerformanceScore {
  const budget = PERFORMANCE_BUDGETS[metric];
  
  if (value <= budget.warning) return 'good';
  if (value <= budget.budget) return 'warning';
  return 'poor';
}

/**
 * Enhanced metric handler with Sentry integration
 */
function handleEnhancedMetric(metric: Metric) {
  const performanceData: EnhancedPerformanceData = {
    metric: metric.name as MetricName,
    value: metric.value,
    score: getPerformanceScore(metric.name as MetricName, metric.value),
    exceedsBudget: metric.value > PERFORMANCE_BUDGETS[metric.name as MetricName].budget,
    timestamp: Date.now(),
    url: window.location.pathname,
    sessionId,
    userId: (Sentry.getIsolationScope().getUser()?.id as any)?.toString(),
  };

  // Store metric
  performanceMetrics.push(performanceData);

  // Development logging (opt-in)
  if (monitoringDebug) {
    const budgetStatus = performanceData.exceedsBudget ? '🚨 OVER BUDGET' : '✅ Within budget';
    console.log(
      `📊 [Performance] ${metric.name}: ${metric.value} (${performanceData.score}) ${budgetStatus}`,
      {
        value: metric.value,
        score: performanceData.score,
        budget: PERFORMANCE_BUDGETS[metric.name as MetricName],
        exceedsBudget: performanceData.exceedsBudget,
      }
    );
  }

  // Production monitoring with Sentry
  if (isProduction) {
    // Send performance metric to Sentry
    Sentry.addBreadcrumb({
      category: 'performance',
      message: `${metric.name}: ${metric.value}`,
      level: performanceData.score === 'poor' ? 'error' : 
             performanceData.score === 'warning' ? 'warning' : 'info',
      data: performanceData,
    });

    // Alert on budget violations
    if (performanceData.exceedsBudget) {
      Sentry.captureMessage(
        `Performance budget exceeded: ${metric.name} = ${metric.value}`,
        'warning'
      );
    }

    // Track as custom measurement
    Sentry.setMeasurement(metric.name, metric.value, 'millisecond');
  }
}

/**
 * Initialize comprehensive performance monitoring
 */
export function initializePerformanceMonitoring() {
  try {
    // Initialize Sentry first
    initializeSentry();

    // Web Vitals monitoring with enhanced handling (2024/2025 standards)
    onCLS(handleEnhancedMetric);
    onINP(handleEnhancedMetric);  // Replaces FID as of 2024
    onLCP(handleEnhancedMetric);
    onFCP(handleEnhancedMetric);
    onTTFB(handleEnhancedMetric);

    // Set session context for Sentry (v10+ syntax)
    Sentry.setContext('session', {
      sessionId,
      startTime: Date.now(),
    });

    console.log('📊 Enhanced performance monitoring initialized');
  } catch (error) {
    console.warn('Failed to initialize performance monitoring:', error);
    
    if (isProduction) {
      Sentry.captureException(error);
    }
  }
}

/**
 * Get performance metrics with budget analysis
 */
export function getEnhancedPerformanceMetrics() {
  return performanceMetrics.map(metric => ({
    ...metric,
    budgetStatus: metric.exceedsBudget ? 'exceeded' : 'within',
    budgetThreshold: PERFORMANCE_BUDGETS[metric.metric].budget,
  }));
}

/**
 * Get performance budget violations
 */
export function getBudgetViolations() {
  return performanceMetrics.filter(metric => metric.exceedsBudget);
}

/**
 * Enhanced performance summary with budget analysis
 */
export function getEnhancedPerformanceSummary() {
  const metrics = getEnhancedPerformanceMetrics();
  const violations = getBudgetViolations();
  
  return {
    sessionId,
    totalMetrics: metrics.length,
    budgetViolations: violations.length,
    budgetCompliance: metrics.length > 0 ? 
      ((metrics.length - violations.length) / metrics.length) * 100 : 100,
    
    byScore: {
      good: metrics.filter(m => m.score === 'good').length,
      warning: metrics.filter(m => m.score === 'warning').length,
      poor: metrics.filter(m => m.score === 'poor').length,
    },
    
    byMetric: Object.fromEntries(
      Object.keys(PERFORMANCE_BUDGETS).map(metricName => [
        metricName,
        metrics
          .filter(m => m.metric === metricName)
          .sort((a, b) => b.timestamp - a.timestamp)[0] || null
      ])
    ),
    
    violations: violations.map(v => ({
      metric: v.metric,
      value: v.value,
      budget: PERFORMANCE_BUDGETS[v.metric].budget,
      excess: v.value - PERFORMANCE_BUDGETS[v.metric].budget,
      timestamp: v.timestamp,
    })),
  };
}

/**
 * Track custom performance events with Sentry
 */
export function trackPerformanceEvent(
  name: string, 
  value: number, 
  unit: string = 'ms',
  context?: Record<string, any>
) {
  const eventData = {
    name,
    value,
    unit,
    timestamp: Date.now(),
    sessionId,
    url: window.location.pathname,
    ...context,
  };

  if (monitoringDebug) {
    console.log(`📈 [Performance Event] ${name}: ${value}${unit}`, eventData);
  }

  if (isProduction) {
    Sentry.addBreadcrumb({
      category: 'performance.custom',
      message: `${name}: ${value}${unit}`,
      level: 'info',
      data: eventData,
    });

    Sentry.setMeasurement(name, value, unit as any);
  }
}

/**
 * Enhanced Performance Timer with Sentry integration
 */
export class EnhancedPerformanceTimer {
  private startTime: number;
  private startMemory?: number;

  constructor(
    private label: string,
    private context?: Record<string, any>
  ) {
    this.startTime = performance.now();
    
    // Track memory usage if available
    if ('memory' in performance) {
      this.startMemory = (performance as any).memory?.usedJSHeapSize;
    }
  }

  end(): { duration: number; memoryDelta?: number } {
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    
    let memoryDelta: number | undefined;
    if (this.startMemory && 'memory' in performance) {
      const endMemory = (performance as any).memory?.usedJSHeapSize;
      memoryDelta = endMemory - this.startMemory;
    }

    const result = { duration, memoryDelta };

    if (monitoringDebug) {
      console.log(
        `⏱️ [Performance Timer] ${this.label}: ${duration.toFixed(2)}ms${
          memoryDelta ? ` (${(memoryDelta / 1024).toFixed(2)}KB)` : ''
        }`,
        result
      );
    }

    // Track with enhanced monitoring
    trackPerformanceEvent(this.label, duration, 'ms', {
      ...this.context,
      memoryDelta,
    });

    return result;
  }
}

/**
 * Monitor React component performance with error boundaries
 */
export function withPerformanceMonitoring<T extends {}>(
  WrappedComponent: React.ComponentType<T>,
  componentName: string
) {
  return Sentry.withErrorBoundary(
    function PerformanceMonitoredComponent(props: T) {
      const [timer] = React.useState(() => new EnhancedPerformanceTimer(
        `${componentName} render`,
        { componentName, props: Object.keys(props as object) }
      ));

      React.useEffect(() => {
        timer.end();
      });

      return React.createElement(WrappedComponent, props);
    },
    {
      fallback: ({ error }) => (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded text-red-400">
          Component Error: {componentName}
          {isDevelopment && <div className="text-xs mt-2">{(error as Error).message}</div>}
        </div>
      ),
      beforeCapture: (scope) => {
        scope.setTag('componentName', componentName);
      },
    }
  );
}

// Legacy monitoring removed; no re-exports to avoid confusion


