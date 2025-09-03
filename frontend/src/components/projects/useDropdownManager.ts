/**
 * Reusable dropdown manager hook
 * Handles single dropdown state management, outside click detection, and cleanup
 */

import { useState, useEffect, useCallback } from 'react';

export interface UseDropdownManagerOptions {
  onOutsideClick?: () => void;
}

export function useDropdownManager<T extends string | number>() {
  const [openId, setOpenId] = useState<T | null>(null);

  // Toggle dropdown for specific item
  const toggle = useCallback((id: T) => {
    setOpenId(prevId => prevId === id ? null : id);
  }, []);

  // Close dropdown
  const close = useCallback(() => {
    setOpenId(null);
  }, []);

  // Check if specific dropdown is open
  const isOpen = useCallback((id: T) => {
    return openId === id;
  }, [openId]);

  // Document click handler for outside click detection
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      // Let components handle their own outside click logic
      // This is a fallback for when dropdowns don't have their own outside click detection
      const target = event.target as HTMLElement;
      
      // Only close if the click is not on a dropdown-related element
      if (!target.closest('[data-dropdown]') && !target.closest('button[aria-haspopup]')) {
        close();
      }
    };

    if (openId !== null) {
      // Small delay to prevent immediate closing when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleDocumentClick);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleDocumentClick);
      };
    }
  }, [openId, close]);

  // Keyboard handler for Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openId !== null) {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openId, close]);

  return {
    openId,
    toggle,
    close,
    isOpen,
  };
}