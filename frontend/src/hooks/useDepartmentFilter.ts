import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import {
  ensureInitialized,
  subscribe,
  getState,
  setDepartment,
  clearDepartment,
  setIncludeChildren,
  buildDeptUiParams,
  buildDeptBackendParams,
  type DepartmentFilterState,
} from '../store/departmentFilter';

export function useDepartmentFilter() {
  // Initialize once per load when first hook consumer mounts
  ensureInitialized();
  const state = useSyncExternalStore(subscribe, getState, getState);

  const actions = useMemo(
    () => ({ setDepartment, clearDepartment, setIncludeChildren }),
    []
  );

  const params = useMemo(() => buildDeptUiParams(state), [state]);
  const backendParams = useMemo(() => buildDeptBackendParams(state), [state]);

  return {
    state: state as DepartmentFilterState,
    ...actions,
    params, // { department?: number, includeChildren?: boolean }
    backendParams, // { department?: number, include_children?: 0|1 }
  };
}

export type { DepartmentFilterState } from '../store/departmentFilter';
