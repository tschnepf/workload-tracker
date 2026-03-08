export type UtilizationBand = 'low' | 'healthy' | 'warning' | 'over';

export const UTILIZATION_COLOR_TOKENS: Record<UtilizationBand, string> = {
  low: 'var(--chart-accent-a)',
  healthy: 'var(--color-state-success)',
  warning: 'var(--color-state-warning)',
  over: 'var(--color-state-danger)',
};

export type DeliverablePhaseToken =
  | 'bulletin'
  | 'cd'
  | 'dd'
  | 'ifc'
  | 'ifp'
  | 'masterplan'
  | 'sd'
  | 'milestone';

export const DELIVERABLE_PHASE_COLOR_TOKENS: Record<DeliverablePhaseToken, string> = {
  bulletin: 'var(--chart-phase-bulletin)',
  cd: 'var(--chart-phase-cd)',
  dd: 'var(--chart-phase-dd)',
  ifc: 'var(--chart-phase-ifc)',
  ifp: 'var(--chart-phase-ifp)',
  masterplan: 'var(--chart-phase-masterplan)',
  sd: 'var(--chart-phase-sd)',
  milestone: 'var(--chart-phase-milestone)',
};

export type ProjectStatusColorToken =
  | 'planning'
  | 'active'
  | 'activeCa'
  | 'onHold'
  | 'completed'
  | 'cancelled'
  | 'inactive';

export const PROJECT_STATUS_COLOR_TOKENS: Record<ProjectStatusColorToken, string> = {
  planning: 'var(--color-state-info)',
  active: 'var(--color-state-success)',
  activeCa: 'var(--color-state-info)',
  onHold: 'var(--color-state-warning)',
  completed: 'var(--chart-neutral)',
  cancelled: 'var(--color-state-danger)',
  inactive: 'var(--chart-neutral)',
};
