import React from 'react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import InlineAlert from '@/components/ui/InlineAlert';
import Skeleton from '@/components/ui/Skeleton';

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
        <div className="w-full max-w-xl px-6">
          <Skeleton rows={5} className="h-4 mb-3" />
        </div>
      </div>
    );
  }

  if (error) {
    if (errorState) return <>{errorState}</>;
    const message = typeof error === 'string' ? error : (error.message || 'Something went wrong');
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-4">
        <InlineAlert tone="error" className="max-w-xl">
          {message}
        </InlineAlert>
        {onRetry ? (
          <Button type="button" variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <EmptyState title="No data available." />
    );
  }

  return <>{children}</>;
};

export default PageState;
