/**
 * Card component with VSCode-style dark theme styling
 * CRITICAL: Use consistent card styling everywhere
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, onClick }) => {
  // VSCode-style dark theme card styling - consistent across all cards
  const baseStyles = `
    bg-[var(--card)] border border-[var(--border)]
    rounded-lg shadow-lg shadow-black/5
    p-6
  `;

  return (
    <div className={`${baseStyles} ${className}`} onClick={onClick}>
      {title && (
        <h3 className="text-lg font-semibold text-[var(--text)] mb-4">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default Card;
