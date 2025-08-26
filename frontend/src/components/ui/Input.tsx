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
  // Dark mode input styling - consistent across all forms
  const baseStyles = `
    w-full px-3 py-2 rounded-md border text-sm transition-colors
    bg-slate-700 border-slate-600 text-slate-50 
    placeholder-slate-400 focus:border-blue-500 
    focus:ring-1 focus:ring-blue-500 focus:outline-none
  `;

  const errorStyles = error 
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
    : '';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-slate-200">
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