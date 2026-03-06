import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
  className?: string;
}

const toneMap: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'border-[var(--color-border)] text-[var(--color-text-primary)] bg-[var(--color-surface)]',
  info: 'border-[var(--color-state-info)] text-[var(--color-text-primary)] bg-[color:color-mix(in_srgb,var(--color-state-info)_18%,transparent)]',
  success: 'border-[var(--color-state-success)] text-[var(--color-text-primary)] bg-[color:color-mix(in_srgb,var(--color-state-success)_18%,transparent)]',
  warning: 'border-[var(--color-state-warning)] text-[var(--color-text-primary)] bg-[color:color-mix(in_srgb,var(--color-state-warning)_18%,transparent)]',
  danger: 'border-[var(--color-state-danger)] text-[var(--color-text-primary)] bg-[color:color-mix(in_srgb,var(--color-state-danger)_18%,transparent)]',
};

const Badge: React.FC<BadgeProps> = ({ children, tone = 'default', className = '' }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneMap[tone]} ${className}`}>
    {children}
  </span>
);

export default Badge;
