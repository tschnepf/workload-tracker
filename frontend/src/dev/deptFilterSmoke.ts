// Minimal smoke to exercise URL -> store init and state -> URL updates
// This is not wired to a runner; import in a dev sandbox if needed.
import {
  ensureInitialized,
  getState,
  subscribe,
  setDepartment,
  clearDepartment,
  setIncludeChildren,
} from '@/store/departmentFilter';

export function runDeptFilterSmoke() {
  const outputs: any[] = [];
  const unsub = subscribe(() => outputs.push({ event: 'changed', state: { ...getState() } }));
  try {
    // Simulate starting with URL params
    const url = new URL(window.location.href);
    url.searchParams.set('department', '3');
    url.searchParams.set('include_children', '1');
    window.history.replaceState(window.history.state, '', url.toString());

    ensureInitialized();
    outputs.push({ event: 'init', state: { ...getState() } });

    // Toggle includeChildren and ensure URL changes
    setIncludeChildren(false);
    outputs.push({ event: 'afterToggle', url: window.location.search });

    // Clear department and check URL cleared
    clearDepartment();
    outputs.push({ event: 'afterClear', url: window.location.search, state: { ...getState() } });

    // Set department again
    setDepartment(10);
    outputs.push({ event: 'afterSet', url: window.location.search, state: { ...getState() } });
  } finally {
    unsub();
  }
  return outputs;
}

// Example usage in a dev page:
// console.table(runDeptFilterSmoke());
