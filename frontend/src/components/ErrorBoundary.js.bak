import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Comprehensive Error Boundary - Phase 5 Optimization
 * Enhanced error handling with reporting and recovery options
 */
import React, { Component } from 'react';
import { trackPerformanceEvent } from '@/utils/monitoring';
/**
 * Generate unique error ID for tracking
 */
function generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Log error details for debugging and analytics
 */
function logError(error, errorInfo, errorId, level) {
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
const DefaultErrorFallback = ({ error, errorId, level = 'component', onRetry }) => {
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
    return (_jsx("div", { className: `
      flex items-center justify-center p-6 rounded-lg border-2 border-dashed border-red-500/30 bg-red-500/10
      ${level === 'page' ? 'min-h-screen bg-[#1e1e1e]' : 'min-h-[200px]'}
    `, children: _jsxs("div", { className: "text-center max-w-md", children: [_jsx("div", { className: "text-red-400 text-lg font-semibold mb-2", children: getErrorTitle() }), _jsx("div", { className: "text-[#969696] text-sm mb-4", children: getErrorDescription() }), process.env.NODE_ENV === 'development' && error && (_jsxs("details", { className: "text-left mb-4 p-3 bg-[#2d2d30] rounded text-xs", children: [_jsx("summary", { className: "cursor-pointer text-[#cccccc] mb-2", children: "Error Details" }), _jsx("div", { className: "text-red-300 mb-2 font-mono", children: error.message }), _jsx("div", { className: "text-[#969696] font-mono text-xs overflow-auto max-h-32", children: error.stack })] })), _jsxs("div", { className: "flex gap-2 justify-center", children: [_jsx("button", { onClick: onRetry, className: "bg-[#007acc] hover:bg-[#005a99] text-white px-4 py-2 rounded text-sm transition-colors", children: "Try Again" }), level === 'page' && (_jsx("button", { onClick: () => window.location.href = '/dashboard', className: "bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc] px-4 py-2 rounded text-sm transition-colors", children: "Go to Dashboard" }))] }), errorId && (_jsxs("div", { className: "text-[#969696] text-xs mt-4", children: ["Error ID: ", errorId] }))] }) }));
};
/**
 * Enhanced Error Boundary with comprehensive error handling
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        Object.defineProperty(this, "handleRetry", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                this.setState({
                    hasError: false,
                    error: undefined,
                    errorInfo: undefined,
                    errorId: undefined,
                });
            }
        });
        this.state = {
            hasError: false,
        };
    }
    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            error,
            errorId: generateErrorId(),
        };
    }
    componentDidCatch(error, errorInfo) {
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
    render() {
        if (this.state.hasError) {
            const { fallbackComponent: FallbackComponent, level } = this.props;
            if (FallbackComponent) {
                return _jsx(FallbackComponent, { ...this.state });
            }
            return (_jsx(DefaultErrorFallback, { ...this.state, level: level, onRetry: this.handleRetry }));
        }
        return this.props.children;
    }
}
// Higher-order component for easy error boundary wrapping
export function withErrorBoundary(Component, options = {}) {
    return function WrappedComponent(props) {
        return (_jsx(ErrorBoundary, { ...options, children: _jsx(Component, { ...props }) }));
    };
}
// Hook for manual error reporting
export function useErrorHandler() {
    return React.useCallback((error, context) => {
        const errorId = generateErrorId();
        logError(error, { componentStack: context || 'Manual error report' }, errorId, 'manual');
        // In production, send to error service
        // errorReporting.captureException(error, { errorId, context });
    }, []);
}
export default ErrorBoundary;
