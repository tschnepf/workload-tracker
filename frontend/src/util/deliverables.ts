// Deliverables utilities extracted from AssignmentGrid
// Behavior must remain identical to inline implementation

export const deliverableTypeColors: Record<string, string> = {
  bulletin: '#3b82f6',
  cd: '#fb923c',
  dd: '#818cf8',
  ifc: '#06b6d4',
  ifp: '#f472b6',
  masterplan: '#a78bfa',
  sd: '#f59e0b',
  milestone: '#64748b',
};

export function classifyDeliverableType(input?: string | null): string {
  const t = (input || '').toLowerCase();
  if (/(\b)bulletin(\b)/.test(t)) return 'bulletin';
  if (/(\b)cd(\b)/.test(t)) return 'cd';
  if (/(\b)dd(\b)/.test(t)) return 'dd';
  if (/(\b)ifc(\b)/.test(t)) return 'ifc';
  if (/(\b)ifp(\b)/.test(t)) return 'ifp';
  if (/(master ?plan)/.test(t)) return 'masterplan';
  if (/(\b)sd(\b)/.test(t)) return 'sd';
  return 'milestone';
}

