import type React from 'react';
import type { Capabilities } from '@/hooks/useCapabilities';
import RoleManagementSection, { ROLE_MANAGEMENT_SECTION_ID } from './RoleManagementSection';
import VerticalsSection, { VERTICALS_SECTION_ID } from './VerticalsSection';
import UtilizationSection, { UTILIZATION_SECTION_ID } from './UtilizationSection';
import DepartmentRolesSection, { DEPARTMENT_ROLES_SECTION_ID } from './DepartmentRolesSection';
import ProjectStatusesSection, { PROJECT_STATUSES_SECTION_ID } from './ProjectStatusesSection';
import PreDeliverablesSection, { PRE_DELIVERABLES_SECTION_ID } from './PreDeliverablesSection';
import PushNotificationsSection, { PUSH_NOTIFICATIONS_SECTION_ID } from './PushNotificationsSection';
import AutoHoursSection, { AUTO_HOURS_SECTION_ID } from './AutoHoursSection';
import CalendarFeedsSection, { CALENDAR_FEEDS_SECTION_ID } from './CalendarFeedsSection';
import AdminUsersSection, { ADMIN_USERS_SECTION_ID } from './AdminUsersSection';
import BackupRestoreSection, { BACKUP_RESTORE_SECTION_ID } from './BackupRestoreSection';
import AuditLogSection, { AUDIT_LOG_SECTION_ID } from './AuditLogSection';
import ProjectAuditLogSection, { PROJECT_AUDIT_LOG_SECTION_ID } from './ProjectAuditLogSection';
import IntegrationsSection, { INTEGRATIONS_SECTION_ID } from './IntegrationsSection';
import DeliverablePhaseMappingSection, { DELIVERABLE_PHASE_MAPPING_SECTION_ID } from './DeliverablePhaseMappingSection';
import DeliverableTaskTemplatesSection, { DELIVERABLE_TASK_TEMPLATES_SECTION_ID } from './DeliverableTaskTemplatesSection';
import NetworkGraphSection, { NETWORK_GRAPH_SECTION_ID } from './NetworkGraphSection';

export type SettingsSectionDefinition = {
  id: string;
  title: string;
  requiresAdmin: boolean;
  allowManager?: boolean;
  separatorBefore?: boolean;
  featureFlag?: (caps?: Capabilities) => boolean;
  component: React.ComponentType;
};

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: ROLE_MANAGEMENT_SECTION_ID,
    title: 'Company Roles',
    requiresAdmin: true,
    component: RoleManagementSection,
  },
  {
    id: VERTICALS_SECTION_ID,
    title: 'Company Verticals',
    requiresAdmin: true,
    component: VerticalsSection,
  },
  {
    id: DEPARTMENT_ROLES_SECTION_ID,
    title: 'Department Project Roles',
    requiresAdmin: true,
    component: DepartmentRolesSection,
  },
  {
    id: PROJECT_STATUSES_SECTION_ID,
    title: 'Project Status and Colors',
    requiresAdmin: true,
    allowManager: true,
    separatorBefore: true,
    component: ProjectStatusesSection,
  },
  {
    id: AUTO_HOURS_SECTION_ID,
    title: 'Project Manloader Template',
    requiresAdmin: true,
    allowManager: true,
    component: AutoHoursSection,
  },
  {
    id: PRE_DELIVERABLES_SECTION_ID,
    title: 'Pre-Deliverables',
    requiresAdmin: true,
    allowManager: true,
    component: PreDeliverablesSection,
  },
  {
    id: PUSH_NOTIFICATIONS_SECTION_ID,
    title: 'Notifications',
    requiresAdmin: true,
    component: PushNotificationsSection,
  },
  {
    id: DELIVERABLE_TASK_TEMPLATES_SECTION_ID,
    title: 'Project Task Templates',
    requiresAdmin: true,
    allowManager: true,
    component: DeliverableTaskTemplatesSection,
  },
  {
    id: CALENDAR_FEEDS_SECTION_ID,
    title: 'Calendar Feeds',
    requiresAdmin: false,
    separatorBefore: true,
    component: CalendarFeedsSection,
  },
  {
    id: ADMIN_USERS_SECTION_ID,
    title: 'Create User & Admin Users',
    requiresAdmin: true,
    separatorBefore: true,
    component: AdminUsersSection,
  },
  {
    id: UTILIZATION_SECTION_ID,
    title: 'Utilization Hours and Color Scheme',
    requiresAdmin: true,
    component: UtilizationSection,
  },
  {
    id: NETWORK_GRAPH_SECTION_ID,
    title: 'Network Graph Analytics',
    requiresAdmin: true,
    allowManager: true,
    component: NetworkGraphSection,
  },
  {
    id: DELIVERABLE_PHASE_MAPPING_SECTION_ID,
    title: 'Deliverable Phase Mapping',
    requiresAdmin: true,
    component: DeliverablePhaseMappingSection,
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
    allowManager: true,
    component: ProjectAuditLogSection,
  },
];
