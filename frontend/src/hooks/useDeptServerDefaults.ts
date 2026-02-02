import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { applyServerDefaults } from '@/store/departmentFilter';
import { parseDeptFromSearch } from '@/utils/deptQuery';

/**
 * Applies server-provided department defaults once when:
 * - Auth is hydrated and user is authenticated
 * - The current URL does not specify department params
 * - The store has no selected department yet
 */
export function useDeptServerDefaultsOnce() {
  const auth = useAuth();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    if (auth.hydrating) return;
    if (!auth.accessToken) return;

    // Respect URL precedence
    const urlParams = typeof window !== 'undefined' ? parseDeptFromSearch(window.location.search) : null;
    if (urlParams && (urlParams.filters?.length || urlParams.selectedDepartmentId != null)) {
      appliedRef.current = true;
      return;
    }

    const defaults = {
      selectedDepartmentId: auth.settings?.defaultDepartmentId ?? null,
      includeChildren: auth.settings?.includeChildren ?? false,
    };
    if (defaults.selectedDepartmentId != null) {
      applyServerDefaults(defaults);
    }
    appliedRef.current = true;
  }, [auth.hydrating, auth.accessToken, auth.settings?.defaultDepartmentId, auth.settings?.includeChildren]);
}
