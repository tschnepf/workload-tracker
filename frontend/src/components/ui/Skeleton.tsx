import React from 'react';

type SkeletonProps = {
  rows?: number;
  className?: string;
};

/**
 * Lightweight skeleton loader for list/table rows
 */
const Skeleton: React.FC<SkeletonProps> = ({ rows = 6, className = 'h-4 mb-2' }) => {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`w-full rounded-[var(--radius-sm)] bg-[var(--color-border)]/55 animate-pulse motion-reduce:animate-none ${className}`}
        />)
      )}
    </div>
  );
};

export default Skeleton;
