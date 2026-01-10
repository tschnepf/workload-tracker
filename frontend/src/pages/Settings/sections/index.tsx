import type React from 'react';
import type { Capabilities } from '@/hooks/useCapabilities';
import RoleManagementSection, { ROLE_MANAGEMENT_SECTION_ID } from './RoleManagementSection';
import UtilizationSection, { UTILIZATION_SECTION_ID } from './UtilizationSection';
import DepartmentRolesSection, { DEPARTMENT_ROLES_SECTION_ID } from './DepartmentRolesSection';
import PreDeliverablesSection, { PRE_DELIVERABLES_SECTION_ID } from './PreDeliverablesSection';
import CalendarFeedsSection, { CALENDAR_FEEDS_SECTION_ID } from './CalendarFeedsSection';
import AdminUsersSection, { ADMIN_USERS_SECTION_ID } from './AdminUsersSection';
import BackupRestoreSection, { BACKUP_RESTORE_SECTION_ID } from './BackupRestoreSection';
import AuditLogSection, { AUDIT_LOG_SECTION_ID } from './AuditLogSection';
import IntegrationsSection, { INTEGRATIONS_SECTION_ID } from './IntegrationsSection';

export type SettingsSectionDefinition = {
  id: string;
  title: string;
  requiresAdmin: boolean;
  allowManager?: boolean;
  featureFlag?: (caps?: Capabilities) => boolean;
  component: React.ComponentType;
};

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: ROLE_MANAGEMENT_SECTION_ID,
    title: 'Role Management',
    requiresAdmin: false,
    component: RoleManagementSection,
  },
  {
    id: DEPARTMENT_ROLES_SECTION_ID,
    title: 'Department Project Roles',
    requiresAdmin: true,
    allowManager: true,
    component: DepartmentRolesSection,
  },
  {
    id: UTILIZATION_SECTION_ID,
    title: 'Utilization Scheme',
    requiresAdmin: false,
    component: UtilizationSection,
  },
  {
    id: PRE_DELIVERABLES_SECTION_ID,
    title: 'Pre-Deliverables Backfill',
    requiresAdmin: true,
    component: PreDeliverablesSection,
  },
  {
    id: CALENDAR_FEEDS_SECTION_ID,
    title: 'Calendar Feeds',
    requiresAdmin: true,
    component: CalendarFeedsSection,
  },
  {
    id: ADMIN_USERS_SECTION_ID,
    title: 'Create User & Admin Users',
    requiresAdmin: true,
    allowManager: true,
    component: AdminUsersSection,
  },
  {
    id: BACKUP_RESTORE_SECTION_ID,
    title: 'Backup & Restore',
    requiresAdmin: true,
    component: BackupRestoreSection,
  },
  {
    id: INTEGRATIONS_SECTION_ID,
    title: 'Integrations Hub',
    requiresAdmin: true,
    featureFlag: (caps) => !!caps?.integrations?.enabled,
    component: IntegrationsSection,
  },
  {
    id: AUDIT_LOG_SECTION_ID,
    title: 'Admin Audit Log',
    requiresAdmin: true,
    component: AuditLogSection,
  },
];
