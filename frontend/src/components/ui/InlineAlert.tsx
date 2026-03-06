import React from 'react';

interface InlineAlertProps {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const toneStyles: Record<NonNullable<InlineAlertProps['tone']>, string> = {
  info: 'border-[var(--color-state-info)] bg-[color:color-mix(in_srgb,var(--color-state-info)_14%,transparent)]',
  success: 'border-[var(--color-state-success)] bg-[color:color-mix(in_srgb,var(--color-state-success)_14%,transparent)]',
  warning: 'border-[var(--color-state-warning)] bg-[color:color-mix(in_srgb,var(--color-state-warning)_14%,transparent)]',
  error: 'border-[var(--color-state-danger)] bg-[color:color-mix(in_srgb,var(--color-state-danger)_14%,transparent)]',
};

const InlineAlert: React.FC<InlineAlertProps> = ({ tone = 'info', title, children, className = '' }) => (
  <div className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm text-[var(--color-text-primary)] ${toneStyles[tone]} ${className}`}>
    {title ? <div className="mb-1 font-semibold">{title}</div> : null}
    <div>{children}</div>
  </div>
);

export default InlineAlert;
