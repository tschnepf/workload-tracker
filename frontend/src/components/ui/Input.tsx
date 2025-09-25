/**
 * Input component with dark mode styling
 * CRITICAL: Use consistent styling across all forms
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input: React.FC<InputProps> = ({ 
  label, 
  error, 
  className = '',
  ...props 
}) => {
  // VSCode-style dark theme input styling - consistent across all forms
  const baseStyles = `
    w-full px-3 py-2 rounded-md border text-sm transition-colors
    bg-[var(--surface)] border-[var(--border)] text-[var(--text)]
    placeholder-[var(--muted)] focus:border-[var(--focus)]
    focus:ring-1 focus:ring-[var(--focus)] focus:outline-none motion-reduce:transition-none
    min-h-[44px]
  `;

  const errorStyles = error 
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
    : '';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-[var(--text)]">
          {label}
          {props.required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <input
        className={`${baseStyles} ${errorStyles} ${className}`}
        {...props}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
};

export default Input;
