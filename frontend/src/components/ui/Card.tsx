/**
 * Card component with dark mode styling
 * CRITICAL: Use consistent card styling everywhere
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title }) => {
  // Dark mode card styling - consistent across all cards
  const baseStyles = `
    bg-slate-800 border border-slate-700 
    rounded-lg shadow-lg shadow-black/5
    p-6
  `;

  return (
    <div className={`${baseStyles} ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-slate-50 mb-4">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default Card;