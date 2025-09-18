// Global feature flags (single source of truth)
// Keep flags explicit and typed; do not read from process.env directly here.

export const FEATURE_USE_NEW_SELECTION_HOOK_PROJECT = true;  // enable for project-centric grid only
export const FEATURE_USE_NEW_SELECTION_HOOK_PEOPLE = false;  // migrate after parity is verified

// In future, consider persisting flags for QA via localStorage or URL param if needed.

