/**
 * Page-level Error Boundary - Phase 5 Optimization
 * Specialized error boundary for entire page failures
 */

import React from 'react';
import ErrorBoundary from './ErrorBoundary';

interface PageErrorBoundaryProps {
  children: React.ReactNode;
  pageName?: string;
}

/**
 * Custom error fallback for page-level errors
 */
const PageErrorFallback: React.FC<{ error?: Error; errorId?: string; pageName?: string }> = ({ 
  error, 
  errorId, 
  pageName 
}) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#1e1e1e]">
      <div className="text-center max-w-lg px-6">
        <div className="mb-6">
          <div className="text-6xl mb-4">🚨</div>
          <h1 className="text-2xl font-bold text-red-400 mb-2">
            Page Error
          </h1>
          <p className="text-[#969696]">
            {pageName ? `The ${pageName} page` : 'This page'} encountered an error and couldn't load properly.
          </p>
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="text-left mb-6 p-4 bg-[#2d2d30] rounded">
            <summary className="cursor-pointer text-[#cccccc] mb-3 font-semibold">
              Technical Details
            </summary>
            <div className="space-y-2">
              <div>
                <div className="text-red-300 font-semibold mb-1">Error Message:</div>
                <div className="text-[#cccccc] font-mono text-sm bg-[#1e1e1e] p-2 rounded">
                  {error.message}
                </div>
              </div>
              <div>
                <div className="text-red-300 font-semibold mb-1">Stack Trace:</div>
                <div className="text-[#969696] font-mono text-xs bg-[#1e1e1e] p-2 rounded overflow-auto max-h-40">
                  {error.stack}
                </div>
              </div>
            </div>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="bg-[#007acc] hover:bg-[#005a99] text-white px-6 py-3 rounded font-medium transition-colors"
          >
            Reload Page
          </button>
          
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc] px-6 py-3 rounded font-medium transition-colors"
          >
            Go to Dashboard
          </button>
        </div>

        {errorId && (
          <div className="mt-6 p-3 bg-[#2d2d30] rounded">
            <div className="text-[#969696] text-sm">
              If this error persists, please report it with this ID:
            </div>
            <div className="text-[#cccccc] font-mono text-sm mt-1 select-all">
              {errorId}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Page Error Boundary component
 */
const PageErrorBoundary: React.FC<PageErrorBoundaryProps> = ({ children, pageName }) => {
  return (
    <ErrorBoundary
      level="page"
      fallbackComponent={(state) => (
        <PageErrorFallback {...state} pageName={pageName} />
      )}
      onError={(error, errorInfo) => {
        console.error(`Page Error in ${pageName || 'unknown page'}:`, error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

export default PageErrorBoundary;