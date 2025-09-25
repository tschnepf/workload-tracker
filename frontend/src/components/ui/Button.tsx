/**
 * Button component with dark mode variants
 * CRITICAL: Use these variants only, no custom styles
 */

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  className = '',
  ...props 
}) => {
  // VSCode-style dark theme button variants - NEVER hardcode colors
  const variants = {
    primary: 'bg-[var(--primary)] hover:bg-[var(--primaryHover)] text-white shadow-sm',
    secondary: 'bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] shadow-sm',
    danger: 'bg-red-500 hover:bg-red-400 text-white shadow-sm',
    ghost: 'bg-transparent hover:bg-[var(--surfaceHover)] text-[var(--muted)] border border-[var(--border)]'
  } as const;

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-[var(--focus)] focus:ring-offset-2 focus:ring-offset-[var(--bg)] disabled:opacity-50 disabled:pointer-events-none min-h-[44px] touch-manipulation';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
