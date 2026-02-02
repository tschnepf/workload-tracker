import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import {
  ensureInitialized,
  subscribe,
  getState,
  setDepartment,
  clearDepartment,
  setIncludeChildren,
  addDepartmentFilter,
  removeDepartmentFilter,
  setDepartmentFilters,
  buildDeptUiParams,
  buildDeptBackendParams,
  type DepartmentFilterState,
  type DepartmentFilterClause,
  type DepartmentFilterOp,
} from '../store/departmentFilter';

export function useDepartmentFilter() {
  // Initialize once per load when first hook consumer mounts
  ensureInitialized();
  const state = useSyncExternalStore(subscribe, getState, getState);

  const actions = useMemo(
    () => ({
      setDepartment,
      clearDepartment,
      setIncludeChildren,
      addDepartmentFilter,
      removeDepartmentFilter,
      setDepartmentFilters,
    }),
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

export type { DepartmentFilterState, DepartmentFilterClause, DepartmentFilterOp } from '../store/departmentFilter';
