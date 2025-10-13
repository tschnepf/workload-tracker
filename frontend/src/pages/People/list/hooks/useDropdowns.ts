import { useState, useEffect } from 'react';

export function useDropdowns() {
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showGearMenu && !target.closest('.gear-menu')) setShowGearMenu(false);
      if (showDepartmentDropdown && !target.closest('.department-filter')) setShowDepartmentDropdown(false);
      if (showLocationDropdown && !target.closest('.location-filter')) setShowLocationDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGearMenu, showDepartmentDropdown, showLocationDropdown]);

  return {
    showGearMenu,
    setShowGearMenu,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showDepartmentDropdown,
    setShowDepartmentDropdown,
    showLocationDropdown,
    setShowLocationDropdown,
  };
}

export type UseDropdownsReturn = ReturnType<typeof useDropdowns>;

