import React from 'react';
import Button from '@/components/ui/Button';

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, message, actionLabel, onAction, className = '' }) => (
  <div className={`flex min-h-[180px] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center ${className}`}>
    <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
    {message ? <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{message}</div> : null}
    {actionLabel && onAction ? (
      <Button onClick={onAction} className="mt-4">
        {actionLabel}
      </Button>
    ) : null}
  </div>
);

export default EmptyState;
