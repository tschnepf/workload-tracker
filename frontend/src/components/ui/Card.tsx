/**
 * Card component with VSCode-style dark theme styling
 * CRITICAL: Use consistent card styling everywhere
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title }) => {
  // VSCode-style dark theme card styling - consistent across all cards
  const baseStyles = `
    bg-[#2d2d30] border border-[#3e3e42] 
    rounded-lg shadow-lg shadow-black/5
    p-6
  `;

  return (
    <div className={`${baseStyles} ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default Card;