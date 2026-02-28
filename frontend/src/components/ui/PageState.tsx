import React from 'react';

export interface PageStateProps {
  isLoading?: boolean;
  error?: string | Error | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  skeleton?: React.ReactNode;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  errorState?: React.ReactNode;
  children?: React.ReactNode;
}

const PageState: React.FC<PageStateProps> = ({
  isLoading = false,
  error = null,
  isEmpty = false,
  onRetry,
  skeleton,
  emptyState,
  loadingState,
  errorState,
  children,
}) => {
  if (isLoading) {
    if (loadingState) return <>{loadingState}</>;
    if (skeleton) return <>{skeleton}</>;
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--muted)]">Loading...</div>
      </div>
    );
  }

  if (error) {
    if (errorState) return <>{errorState}</>;
    const message = typeof error === 'string' ? error : (error.message || 'Something went wrong');
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-red-400 text-sm">{message}</div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-md border border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--text)] hover:bg-[var(--surfaceHover)]"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--muted)]">No data available.</div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PageState;

