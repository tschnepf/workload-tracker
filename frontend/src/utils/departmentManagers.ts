import type { Department } from '@/types/models';

function cleanName(value?: string | null): string {
  return (value || '').trim();
}

export function getPrimaryManagerName(
  department?: Pick<Department, 'managerName'> | null,
): string | null {
  const name = cleanName(department?.managerName);
  return name || null;
}

export function getSecondaryManagerNames(
  department?: Pick<Department, 'secondaryManagerNames'> | null,
): string[] {
  const names = department?.secondaryManagerNames || [];
  return names.map((name) => cleanName(name)).filter(Boolean);
}

export function getDepartmentManagerSummary(
  department?: Pick<Department, 'managerName' | 'secondaryManagerNames'> | null,
): string {
  const primary = getPrimaryManagerName(department);
  const secondary = getSecondaryManagerNames(department);

  if (primary && secondary.length > 0) {
    return `${primary} (+${secondary.length} secondary)`;
  }
  if (primary) {
    return primary;
  }
  if (secondary.length > 0) {
    return secondary.join(', ');
  }
  return 'None';
}

export function getSecondaryManagersLabel(
  department?: Pick<Department, 'secondaryManagerNames'> | null,
): string {
  const secondary = getSecondaryManagerNames(department);
  return secondary.length > 0 ? secondary.join(', ') : 'None assigned';
}
