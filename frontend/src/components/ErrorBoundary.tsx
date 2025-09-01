/**
 * Comprehensive Error Boundary - Phase 5 Optimization
 * Enhanced error handling with reporting and recovery options
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { trackPerformanceEvent } from '@/utils/monitoring';

interface Props {
  children: ReactNode;
  fallbackComponent?: React.ComponentType<ErrorBoundaryState>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'section' | 'component';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

/**
 * Generate unique error ID for tracking
 */
function generateErrorId(): string {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log error details for debugging and analytics
 */
function logError(error: Error, errorInfo: ErrorInfo, errorId: string, level: string) {
  const errorDetails = {
    errorId,
    level,
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.group(`🚨 Error Boundary (${level}): ${errorId}`);
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error Details:', errorDetails);
    console.groupEnd();
  }

  // Track error metric (enhanced monitoring)
  trackPerformanceEvent('error_boundary_triggered', 1, 'count');

  // In production, send to error reporting service
  // errorReporting.captureException(error, errorDetails);
}

/**
 * Default error fallback component
 */
const DefaultErrorFallback: React.FC<ErrorBoundaryState & { level?: string; onRetry?: () => void }> = ({ 
  error, 
  errorId, 
  level = 'component',
  onRetry 
}) => {
  const getErrorTitle = () => {
    switch (level) {
      case 'page': return 'Page Error';
      case 'section': return 'Section Error';
      default: return 'Component Error';
    }
  };

  const getErrorDescription = () => {
    switch (level) {
      case 'page': return 'The page failed to load properly';
      case 'section': return 'This section encountered an error';
      default: return 'A component failed to render';
    }
  };

  return (
    <div className={`
      flex items-center justify-center p-6 rounded-lg border-2 border-dashed border-red-500/30 bg-red-500/10
      ${level === 'page' ? 'min-h-screen bg-[#1e1e1e]' : 'min-h-[200px]'}
    `}>
      <div className="text-center max-w-md">
        <div className="text-red-400 text-lg font-semibold mb-2">
          {getErrorTitle()}
        </div>
        
        <div className="text-[#969696] text-sm mb-4">
          {getErrorDescription()}
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="text-left mb-4 p-3 bg-[#2d2d30] rounded text-xs">
            <summary className="cursor-pointer text-[#cccccc] mb-2">Error Details</summary>
            <div className="text-red-300 mb-2 font-mono">{error.message}</div>
            <div className="text-[#969696] font-mono text-xs overflow-auto max-h-32">
              {error.stack}
            </div>
          </details>
        )}

        <div className="flex gap-2 justify-center">
          <button 
            onClick={onRetry}
            className="bg-[#007acc] hover:bg-[#005a99] text-white px-4 py-2 rounded text-sm transition-colors"
          >
            Try Again
          </button>
          
          {level === 'page' && (
            <button 
              onClick={() => window.location.href = '/dashboard'}
              className="bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc] px-4 py-2 rounded text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          )}
        </div>

        {errorId && (
          <div className="text-[#969696] text-xs mt-4">
            Error ID: {errorId}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Enhanced Error Boundary with comprehensive error handling
 */
class ErrorBoundary extends Component<Props, ErrorBoundaryState> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { level = 'component', onError } = this.props;
    const errorId = this.state.errorId || generateErrorId();

    // Log error details
    logError(error, errorInfo, errorId, level);

    // Call custom error handler if provided
    onError?.(error, errorInfo);

    // Update state with error info
    this.setState({
      errorInfo,
      errorId,
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: undefined,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallbackComponent: FallbackComponent, level } = this.props;
      
      if (FallbackComponent) {
        return <FallbackComponent {...this.state} />;
      }

      return (
        <DefaultErrorFallback 
          {...this.state} 
          level={level}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easy error boundary wrapping
export function withErrorBoundary<P extends {}>(
  Component: React.ComponentType<P>,
  options: Omit<Props, 'children'> = {}
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary {...options}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook for manual error reporting
export function useErrorHandler() {
  return React.useCallback((error: Error, context?: string) => {
    const errorId = generateErrorId();
    
    logError(error, { componentStack: context || 'Manual error report' } as ErrorInfo, errorId, 'manual');
    
    // In production, send to error service
    // errorReporting.captureException(error, { errorId, context });
  }, []);
}

export default ErrorBoundary;
