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
import IntegrationsSection, { INTEGRATIONS_SECTION_ID } from './IntegrationsSection';
import DeliverablePhaseMappingSection, { DELIVERABLE_PHASE_MAPPING_SECTION_ID } from './DeliverablePhaseMappingSection';
import DeliverableTaskTemplatesSection, { DELIVERABLE_TASK_TEMPLATES_SECTION_ID } from './DeliverableTaskTemplatesSection';
import NetworkGraphSection, { NETWORK_GRAPH_SECTION_ID } from './NetworkGraphSection';
import GeneralSettingsSection, { GENERAL_SETTINGS_SECTION_ID } from './GeneralSettingsSection';
import LogsSection, { LOGS_SECTION_ID } from './LogsSection';
import FeaturesSection, { FEATURES_SECTION_ID } from './FeaturesSection';

export type SettingsSectionDefinition = {
  id: string;
  title: string;
  requiresAdmin: boolean;
  allowManager?: boolean;
  group: 'company' | 'projects' | 'admin';
  featureFlag?: (caps?: Capabilities) => boolean;
  component: React.ComponentType;
};

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: ROLE_MANAGEMENT_SECTION_ID,
    title: 'Roles',
    requiresAdmin: true,
    group: 'company',
    component: RoleManagementSection,
  },
  {
    id: VERTICALS_SECTION_ID,
    title: 'Verticals',
    requiresAdmin: true,
    group: 'company',
    component: VerticalsSection,
  },
  {
    id: DEPARTMENT_ROLES_SECTION_ID,
    title: 'Project Roles',
    requiresAdmin: true,
    group: 'company',
    component: DepartmentRolesSection,
  },
  {
    id: PROJECT_STATUSES_SECTION_ID,
    title: 'Status and Colors',
    requiresAdmin: true,
    allowManager: true,
    group: 'projects',
    component: ProjectStatusesSection,
  },
  {
    id: AUTO_HOURS_SECTION_ID,
    title: 'Manloader Template',
    requiresAdmin: true,
    allowManager: true,
    group: 'projects',
    component: AutoHoursSection,
  },
  {
    id: PRE_DELIVERABLES_SECTION_ID,
    title: 'Pre-Deliverables',
    requiresAdmin: true,
    allowManager: true,
    group: 'projects',
    component: PreDeliverablesSection,
  },
  {
    id: DELIVERABLE_TASK_TEMPLATES_SECTION_ID,
    title: 'Task Templates',
    requiresAdmin: true,
    allowManager: true,
    group: 'projects',
    component: DeliverableTaskTemplatesSection,
  },
  {
    id: DELIVERABLE_PHASE_MAPPING_SECTION_ID,
    title: 'Deliverable Phase Mapping',
    requiresAdmin: true,
    group: 'projects',
    component: DeliverablePhaseMappingSection,
  },
  {
    id: ADMIN_USERS_SECTION_ID,
    title: 'User Accounts',
    requiresAdmin: true,
    group: 'admin',
    component: AdminUsersSection,
  },
  {
    id: PUSH_NOTIFICATIONS_SECTION_ID,
    title: 'Notifications',
    requiresAdmin: true,
    group: 'admin',
    component: PushNotificationsSection,
  },
  {
    id: CALENDAR_FEEDS_SECTION_ID,
    title: 'Calendar Feeds',
    requiresAdmin: false,
    group: 'admin',
    component: CalendarFeedsSection,
  },
  {
    id: INTEGRATIONS_SECTION_ID,
    title: 'Integrations Hub',
    requiresAdmin: true,
    group: 'admin',
    featureFlag: (caps) => !!caps?.integrations?.enabled,
    component: IntegrationsSection,
  },
  {
    id: GENERAL_SETTINGS_SECTION_ID,
    title: 'General',
    requiresAdmin: true,
    group: 'admin',
    component: GeneralSettingsSection,
  },
  {
    id: FEATURES_SECTION_ID,
    title: 'Features',
    requiresAdmin: true,
    group: 'admin',
    component: FeaturesSection,
  },
  {
    id: BACKUP_RESTORE_SECTION_ID,
    title: 'Backup & Restore',
    requiresAdmin: true,
    group: 'admin',
    component: BackupRestoreSection,
  },
  {
    id: LOGS_SECTION_ID,
    title: 'Logs',
    requiresAdmin: true,
    allowManager: true,
    group: 'admin',
    component: LogsSection,
  },
  {
    id: UTILIZATION_SECTION_ID,
    title: 'Utilization Hours and Color Scheme',
    requiresAdmin: true,
    group: 'admin',
    component: UtilizationSection,
  },
  {
    id: NETWORK_GRAPH_SECTION_ID,
    title: 'Network Graph Analytics',
    requiresAdmin: true,
    allowManager: true,
    group: 'admin',
    component: NetworkGraphSection,
  },
];
