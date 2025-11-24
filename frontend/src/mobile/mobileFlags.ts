import { getFlag, type FlagName } from '@/lib/flags';
import { useEffect } from 'react';
import { trackPerformanceEvent } from '@/utils/monitoring';

export const MOBILE_UI_FLAGS = {
  dashboard: 'MOBILE_UI_DASHBOARD',
  personal: 'MOBILE_UI_PERSONAL',
  assignmentsGrid: 'MOBILE_UI_ASSIGNMENTS_GRID',
  projectAssignmentsGrid: 'MOBILE_UI_PROJECT_ASSIGNMENTS_GRID',
  assignmentList: 'MOBILE_UI_ASSIGNMENT_LIST',
  assignmentForm: 'MOBILE_UI_ASSIGNMENT_FORM',
  projects: 'MOBILE_UI_PROJECTS',
  projectForm: 'MOBILE_UI_PROJECT_FORM',
  people: 'MOBILE_UI_PEOPLE',
  personForm: 'MOBILE_UI_PERSON_FORM',
  departments: 'MOBILE_UI_DEPARTMENTS',
  managerDashboard: 'MOBILE_UI_MANAGER_DASHBOARD',
  departmentHierarchy: 'MOBILE_UI_DEPARTMENT_HIERARCHY',
  departmentReports: 'MOBILE_UI_DEPARTMENT_REPORTS',
  deliverablesCalendar: 'MOBILE_UI_DELIVERABLES_CALENDAR',
  teamForecast: 'MOBILE_UI_TEAM_FORECAST',
  personExperience: 'MOBILE_UI_PERSON_EXPERIENCE',
  roleCapacity: 'MOBILE_UI_ROLE_CAPACITY',
  skills: 'MOBILE_UI_SKILLS',
  performance: 'MOBILE_UI_PERFORMANCE',
  settings: 'MOBILE_UI_SETTINGS',
  profile: 'MOBILE_UI_PROFILE',
  authLogin: 'MOBILE_UI_AUTH_LOGIN',
  authResetPassword: 'MOBILE_UI_AUTH_RESET_PASSWORD',
  authSetPassword: 'MOBILE_UI_AUTH_SET_PASSWORD',
  help: 'MOBILE_UI_HELP',
} as const satisfies Record<string, FlagName>;

export type MobileUiScreen = keyof typeof MOBILE_UI_FLAGS;
export type MobileUiFlagName = typeof MOBILE_UI_FLAGS[MobileUiScreen];

export function getMobileUiFlagName(screen: MobileUiScreen): MobileUiFlagName {
  return MOBILE_UI_FLAGS[screen];
}

export function isMobileUiEnabled(screen: MobileUiScreen, fallback = false): boolean {
  return getFlag(getMobileUiFlagName(screen), fallback);
}

export function useMobileUiFlag(screen: MobileUiScreen, fallback = false): boolean {
  const enabled = isMobileUiEnabled(screen, fallback);

  useEffect(() => {
    trackPerformanceEvent('mobile_ui.flag_state', enabled ? 1 : 0, 'bool', {
      screen,
      flag: getMobileUiFlagName(screen),
      enabled,
    });
  }, [enabled, screen]);

  return enabled;
}

