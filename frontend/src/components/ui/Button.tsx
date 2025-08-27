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
    primary: 'bg-[#007acc] hover:bg-[#1e90ff] text-white shadow-sm',
    secondary: 'bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc] shadow-sm',
    danger: 'bg-red-500 hover:bg-red-400 text-white shadow-sm',
    ghost: 'bg-transparent hover:bg-[#3e3e42] text-[#969696] border border-[#3e3e42]'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:ring-offset-2 focus:ring-offset-[#1e1e1e] disabled:opacity-50 disabled:pointer-events-none';

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