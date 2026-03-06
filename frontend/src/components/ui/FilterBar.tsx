import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({ children, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 ${className}`}>
    {children}
  </div>
);

export default FilterBar;
