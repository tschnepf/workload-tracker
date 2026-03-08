/**
 * Input component with dark mode styling
 * CRITICAL: Use consistent styling across all forms
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  uiSize?: 'sm' | 'md' | 'lg';
}

const Input: React.FC<InputProps> = ({ 
  label, 
  error, 
  hint,
  uiSize = 'md',
  className = '',
  ...props 
}) => {
  const sizeStyles = {
    sm: 'min-h-[36px] px-2 py-1 text-xs',
    md: 'min-h-[40px] px-3 py-2 text-sm',
    lg: 'min-h-[44px] px-3 py-2 text-base',
  } as const;

  const baseStyles = `
    w-full rounded-[var(--radius-md)] border transition-colors
    bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-primary)]
    placeholder-[var(--color-text-secondary)] focus:border-[var(--color-border)]
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)] focus:ring-0 motion-reduce:transition-none
    focus-visible:border-[var(--color-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]
    ${sizeStyles[uiSize]}
  `;

  const errorStyles = error 
    ? 'border-[var(--color-state-danger)] focus-visible:border-[var(--color-state-danger)] focus-visible:ring-[var(--color-state-danger)]' 
    : '';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
          {label}
          {props.required && <span className="ml-1 text-[var(--color-state-danger)]">*</span>}
        </label>
      )}
      <input
        className={`${baseStyles} ${errorStyles} ${className}`}
        {...props}
      />
      {!error && hint ? (
        <p className="text-xs text-[var(--color-text-secondary)]">{hint}</p>
      ) : null}
      {error && (
        <p className="text-sm text-[var(--color-state-danger)]">{error}</p>
      )}
    </div>
  );
};

export default Input;
