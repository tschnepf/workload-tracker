/**
 * Standardized ARIA patterns for dropdown components
 * Ensures consistent accessibility across all dropdowns
 */

import { useMemo } from 'react';

export interface UseDropdownAriaProps {
  isOpen: boolean;
  id: string;
  labelText?: string;
}

export function useDropdownAria({ isOpen, id, labelText }: UseDropdownAriaProps) {
  const buttonId = `dropdown-button-${id}`;
  const menuId = `dropdown-menu-${id}`;

  // Button ARIA attributes
  const buttonProps = useMemo(() => ({
    'aria-haspopup': 'listbox' as const,
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? menuId : undefined,
    'aria-label': labelText ? `${labelText} dropdown` : undefined,
    id: buttonId,
  }), [isOpen, menuId, labelText, buttonId]);

  // Menu ARIA attributes
  const menuProps = useMemo(() => ({
    role: 'listbox' as const,
    'aria-labelledby': buttonId,
    id: menuId,
    'data-dropdown': true, // For outside click detection
  }), [buttonId, menuId]);

  // Option ARIA attributes generator
  const getOptionProps = (value: string, isSelected?: boolean) => ({
    role: 'option' as const,
    'aria-selected': isSelected || false,
    tabIndex: 0,
    'data-value': value,
  });

  // Screen reader announcements
  const getScreenReaderText = (action: 'opened' | 'closed' | 'selected', value?: string) => {
    switch (action) {
      case 'opened':
        return `${labelText || 'Dropdown'} menu opened`;
      case 'closed':
        return `${labelText || 'Dropdown'} menu closed`;
      case 'selected':
        return `${value} selected`;
      default:
        return '';
    }
  };

  return {
    buttonProps,
    menuProps,
    getOptionProps,
    getScreenReaderText,
    buttonId,
    menuId,
  };
}