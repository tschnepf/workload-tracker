import type { ProjectRole } from '../api';

export function resolveRoleDisplay(roleName?: string | null): string {
  return roleName?.trim() || '';
}

