/**
 * Card component with VSCode-style dark theme styling
 * CRITICAL: Use consistent card styling everywhere
 */

import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
  variant?: 'default' | 'surface' | 'outline';
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  padding?: 'sm' | 'md' | 'lg';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  className = '',
  title,
  onClick,
  variant = 'default',
  elevation = 'sm',
  padding = 'lg',
  ...rest
}, ref) => {
  const variantMap = {
    default: 'bg-[var(--color-surface-elevated)] border-[var(--color-border)]',
    surface: 'bg-[var(--color-surface)] border-[var(--color-border)]',
    outline: 'bg-transparent border-[var(--color-border)]',
  } as const;

  const elevationMap = {
    none: 'shadow-none',
    sm: 'shadow-[var(--elevation-1)]',
    md: 'shadow-[var(--elevation-2)]',
    lg: 'shadow-[var(--elevation-3)]',
  } as const;

  const paddingMap = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  } as const;

  return (
    <div
      ref={ref}
      className={`rounded-[var(--radius-lg)] border ${variantMap[variant]} ${elevationMap[elevation]} ${paddingMap[padding]} ${className}`}
      onClick={onClick}
      {...rest}
    >
      {title && (
        <h3 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export default Card;
