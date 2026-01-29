import type React from 'react';
import type { Capabilities } from '@/hooks/useCapabilities';
import RoleManagementSection, { ROLE_MANAGEMENT_SECTION_ID } from './RoleManagementSection';
import UtilizationSection, { UTILIZATION_SECTION_ID } from './UtilizationSection';
import DepartmentRolesSection, { DEPARTMENT_ROLES_SECTION_ID } from './DepartmentRolesSection';
import PreDeliverablesSection, { PRE_DELIVERABLES_SECTION_ID } from './PreDeliverablesSection';
import AutoHoursSection, { AUTO_HOURS_SECTION_ID } from './AutoHoursSection';
import CalendarFeedsSection, { CALENDAR_FEEDS_SECTION_ID } from './CalendarFeedsSection';
import AdminUsersSection, { ADMIN_USERS_SECTION_ID } from './AdminUsersSection';
import BackupRestoreSection, { BACKUP_RESTORE_SECTION_ID } from './BackupRestoreSection';
import AuditLogSection, { AUDIT_LOG_SECTION_ID } from './AuditLogSection';
import ProjectAuditLogSection, { PROJECT_AUDIT_LOG_SECTION_ID } from './ProjectAuditLogSection';
import IntegrationsSection, { INTEGRATIONS_SECTION_ID } from './IntegrationsSection';
import DeliverablePhaseMappingSection, { DELIVERABLE_PHASE_MAPPING_SECTION_ID } from './DeliverablePhaseMappingSection';
import DeliverableTaskTemplatesSection, { DELIVERABLE_TASK_TEMPLATES_SECTION_ID } from './DeliverableTaskTemplatesSection';

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
    title: 'Pre-Deliverables',
    requiresAdmin: true,
    component: PreDeliverablesSection,
  },
  {
    id: AUTO_HOURS_SECTION_ID,
    title: 'Project Template',
    requiresAdmin: true,
    component: AutoHoursSection,
  },
  {
    id: DELIVERABLE_PHASE_MAPPING_SECTION_ID,
    title: 'Deliverable Phase Mapping',
    requiresAdmin: true,
    component: DeliverablePhaseMappingSection,
  },
  {
    id: DELIVERABLE_TASK_TEMPLATES_SECTION_ID,
    title: 'Deliverable Task Templates',
    requiresAdmin: true,
    component: DeliverableTaskTemplatesSection,
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
  {
    id: PROJECT_AUDIT_LOG_SECTION_ID,
    title: 'Project Audit Log',
    requiresAdmin: true,
    component: ProjectAuditLogSection,
  },
];
