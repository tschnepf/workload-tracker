/**
 * Button component with dark mode variants
 * CRITICAL: Use these variants only, no custom styles
 */

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'subtle';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  iconOnly = false,
  children, 
  className = '',
  ...props 
}) => {
  const variants = {
    primary: 'bg-[var(--color-action-primary)] hover:bg-[var(--color-action-primary-hover)] border-[var(--color-action-primary)] text-white shadow-[var(--elevation-1)]',
    secondary: 'bg-[var(--color-surface-elevated)] hover:bg-[var(--surfaceHover)] border-[var(--color-border)] text-[var(--color-text-primary)]',
    danger: 'bg-[var(--color-state-danger)] hover:opacity-90 border-[var(--color-state-danger)] text-white shadow-[var(--elevation-1)]',
    ghost: 'bg-transparent hover:bg-[var(--surfaceHover)] border-[var(--color-border)] text-[var(--color-text-secondary)]',
    subtle: 'bg-[var(--color-surface)] hover:bg-[var(--surfaceHover)] border-transparent text-[var(--color-text-primary)]',
  } as const;

  const sizes = {
    xs: 'min-h-[32px] px-2 py-1 text-xs',
    sm: 'min-h-[36px] px-3 py-1.5 text-sm',
    md: 'min-h-[40px] px-4 py-2 text-sm',
    lg: 'min-h-[44px] px-5 py-2.5 text-base',
  };

  const baseStyles = [
    'inline-flex items-center justify-center gap-1 rounded-[var(--radius-md)] border font-medium',
    'transition-colors motion-reduce:transition-none',
    'focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
    'disabled:opacity-50 disabled:pointer-events-none touch-manipulation',
  ].join(' ');

  const iconOnlyClass = iconOnly
    ? {
      xs: 'w-8 px-0',
      sm: 'w-9 px-0',
      md: 'w-10 px-0',
      lg: 'w-11 px-0',
    }[size]
    : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${iconOnlyClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
