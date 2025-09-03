/**
 * StatusDropdown - Reusable dropdown component for editing project status
 * Implements single-instance dropdown with full accessibility support
 */

import React, { useRef, useEffect } from 'react';
import { editableStatusOptions, formatStatus, getStatusColor, getStatusBgColor, getStatusBorderColor, type ProjectStatus } from './status.utils';
import { useDropdownAria } from './useDropdownAria';

export interface StatusDropdownProps {
  currentStatus?: ProjectStatus | null;
  isOpen: boolean;
  onSelect: (status: ProjectStatus) => void;
  onClose: () => void;
  projectId: string | number;
  className?: string;
  disabled?: boolean;
  // When true, dropdown closes immediately on select; otherwise parent decides (e.g., via optimistic callback)
  closeOnSelect?: boolean;
}

export const StatusDropdown: React.FC<StatusDropdownProps> = ({
  currentStatus,
  isOpen,
  onSelect,
  onClose,
  projectId,
  className = '',
  disabled = false,
  closeOnSelect = true
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { menuProps, getOptionProps } = useDropdownAria({
    isOpen,
    id: `status-${projectId}`,
    labelText: 'Project status'
  });

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      // Small delay to prevent immediate closing when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          // Let individual option buttons handle their own Enter/Space
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Prevent scroll behavior during dropdown interactions
  useEffect(() => {
    if (isOpen) {
      // Store original scroll behavior
      const originalScrollBehavior = document.documentElement.style.scrollBehavior;
      const originalOverflow = document.documentElement.style.overflow;
      
      // Prevent smooth scrolling and lock scroll position
      document.documentElement.style.scrollBehavior = 'auto';
      
      return () => {
        // Restore original scroll behavior
        document.documentElement.style.scrollBehavior = originalScrollBehavior;
        document.documentElement.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Focus management - prevent scroll jumping
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      // Delay focus to prevent scroll jumping on initial dropdown open
      const focusTimeout = setTimeout(() => {
        if (dropdownRef.current) {
          const currentOption = dropdownRef.current.querySelector(`[data-value="${currentStatus}"]`) as HTMLElement;
          const firstOption = dropdownRef.current.querySelector('[role="option"]') as HTMLElement;
          
          const targetElement = currentOption || firstOption;
          if (targetElement) {
            // Use preventScroll to avoid jumping
            targetElement.focus({ preventScroll: true });
          }
        }
      }, 50); // Small delay to let DOM settle

      return () => clearTimeout(focusTimeout);
    }
  }, [isOpen, currentStatus]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className={`absolute top-full left-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded-lg shadow-lg z-50 min-w-[140px] py-1 ${className}`}
      style={{
        contain: 'layout style paint',
        transform: 'translateZ(0)', // Force hardware acceleration
        willChange: 'transform' // Optimize for animations
      }}
      data-dropdown
      {...menuProps}
    >
      {editableStatusOptions.map((status) => {
        const isSelected = status === currentStatus;
        
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            className={`
              w-full text-left px-3 py-2 text-xs transition-colors border-0 bg-transparent
              hover:bg-[#3e3e42] focus:bg-[#3e3e42] focus:outline-none
              ${isSelected ? 'bg-[#007acc]/20 border-l-2 border-l-[#007acc]' : ''}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) {
                onSelect(status as ProjectStatus);
                if (closeOnSelect) onClose();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!disabled) {
                  onSelect(status as ProjectStatus);
                  if (closeOnSelect) onClose();
                }
              }
            }}
            {...getOptionProps(status, isSelected)}
          >
            <div className="flex items-center gap-2">
              {/* Status indicator */}
              <div className={`
                w-2 h-2 rounded-full flex-shrink-0
                ${getStatusBgColor(status)} ${getStatusBorderColor(status)} border
              `} />
              
              {/* Status text with color */}
              <span className={`${getStatusColor(status)} font-medium`}>
                {formatStatus(status)}
              </span>
              
              {/* Selected indicator */}
              {isSelected && (
                <svg className="w-3 h-3 ml-auto text-[#007acc]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default StatusDropdown;
