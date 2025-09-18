import React from 'react';
import { 
  getStatusColor, 
  getStatusBgColor, 
  getStatusBorderColor, 
  formatStatus,
  editableStatusOptions,
  type ProjectStatus 
} from './status.utils';

// Re-export utilities for backward compatibility
export { getStatusColor, formatStatus, editableStatusOptions };
export type { ProjectStatus };

export interface StatusBadgeProps {
  status?: ProjectStatus | null;
  variant?: 'display' | 'editable';
  className?: string;
  onClick?: () => void;
  isUpdating?: boolean;
  size?: 'xs' | 'sm' | 'md';
  weight?: 'medium' | 'bold';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  variant = 'display',
  className = '',
  onClick,
  isUpdating = false,
  size = 'xs',
  weight = 'medium'
}) => {
  const sizeClass = size === 'md' ? 'text-base' : size === 'sm' ? 'text-sm' : 'text-xs';
  const weightClass = weight === 'bold' ? 'font-bold' : 'font-medium';
  const baseClasses = `px-2 py-0.5 rounded ${sizeClass} ${weightClass} inline-flex items-center gap-1`;
  const colorClasses = getStatusColor(status);
  
  // Enhanced styling for different variants
  const variantClasses = variant === 'editable' 
    ? `${getStatusBgColor(status)} border ${getStatusBorderColor(status)} cursor-pointer hover:opacity-80 transition-opacity`
    : 'bg-transparent';
    
  const combinedClasses = `${baseClasses} ${colorClasses} ${variantClasses} ${className}`;
  
  if (variant === 'editable' && onClick) {
    return (
      <button
        type="button"
        className={`${combinedClasses} ${isUpdating ? 'opacity-60 cursor-wait' : ''}`}
        onClick={isUpdating ? undefined : (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }}
        aria-haspopup="listbox"
        aria-label={`Change status from ${formatStatus(status)}`}
        disabled={isUpdating}
      >
        {formatStatus(status)}
        {isUpdating ? (
          <svg className="w-3 h-3 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
    );
  }
  
  return (
    <span className={`${combinedClasses} ${isUpdating ? 'opacity-60' : ''}`}>
      {formatStatus(status)}
      {isUpdating && (
        <svg className="w-3 h-3 animate-spin motion-reduce:animate-none ml-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
    </span>
  );
};

export default StatusBadge;
