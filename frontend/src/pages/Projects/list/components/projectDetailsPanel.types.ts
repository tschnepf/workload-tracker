import type React from 'react';
import type { Assignment, Person, Project, AutoHoursTemplate, Department } from '@/types/models';
import type { OnRoleSelect } from '@/roles/types';
import type { ProjectRole } from '@/roles/api';

export type ProjectDetailsPersonSearchResult = {
  id: number;
  name: string;
  role?: string | null;
  availableHours?: number;
  utilizationPercent?: number;
  hasSkillMatch?: boolean;
};

export interface ProjectDetailsPanelProps {
  project: Project;
  statusDropdownOpen: boolean;
  setStatusDropdownOpen: (v: boolean) => void;
  onStatusChange: (status: string) => void;
  onProjectRefetch?: () => Promise<void> | void;
  onDeleteProject?: (id: number) => Promise<void> | void;

  assignments: Assignment[];
  editingAssignmentId: number | null;
  editData: { roleOnProject: string; currentWeekHours: number; roleSearch: string };
  warnings: string[];
  onEditAssignment: (a: Assignment) => void;
  onDeleteAssignment: (assignmentId: number) => void;
  onSaveEdit: (assignmentId: number) => void;
  onCancelEdit: () => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (a: Assignment) => number;
  onChangeAssignmentRole?: (assignmentId: number, roleId: number | null, roleName: string | null) => void;
  getPersonDepartmentId?: (personId: number) => number | null;
  getPersonDepartmentName?: (personId: number) => string | null;
  currentWeekKey?: string;
  onUpdateWeekHours?: (assignmentId: number, weekKey: string, hours: number) => Promise<void> | void;
  reloadAssignments: (projectId: number) => Promise<void>;
  invalidateFilterMeta: () => Promise<void>;

  showAddAssignment: boolean;
  onAddAssignment: () => void;
  onSaveAssignment: () => void;
  onCancelAddAssignment: () => void;
  addAssignmentState: {
    personSearch: string;
    selectedPerson: Person | null;
    roleOnProjectId?: number | null;
    roleOnProject: string;
    roleSearch: string;
    weeklyHours: { [key: string]: number };
  };
  onPersonSearch: (term: string) => void;
  onPersonSearchFocus: () => void;
  onPersonSearchKeyDown: (e: React.KeyboardEvent) => void;
  srAnnouncement: string;
  personSearchResults: ProjectDetailsPersonSearchResult[];
  selectedPersonIndex: number;
  onPersonSelect: (p: Person) => void;
  onRoleSelectNew: OnRoleSelect;
  onRolePlaceholderSelect: (role: ProjectRole) => void;
  departments: Department[];
  onSwapPlaceholder: (assignmentId: number, person: { id: number; name: string; department?: number | null }) => Promise<void> | void;

  candidatesOnly: boolean;
  setCandidatesOnly: (v: boolean) => void;
  availabilityMap: Record<number, { availableHours: number; utilizationPercent: number; totalHours: number; capacity: number }>;

  deliverablesSlot: React.ReactNode;
}

export interface ProjectDetailsHeaderCardProps {
  project: Project;
  localPatch: Partial<Project>;
  canEdit: boolean;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  clearFieldError: (field: string) => void;
  commitField: (field: keyof Project, value: any, opts?: { onError?: (err: unknown) => void }) => Promise<void>;
  statusDropdownOpen: boolean;
  setStatusDropdownOpen: (v: boolean) => void;
  onStatusChange: (status: string) => void;
  onDeleteProject?: (id: number) => Promise<void> | void;
}

export interface ProjectMetadataFieldsProps {
  project: Project;
  localPatch: Partial<Project>;
  canEdit: boolean;
  canEditAutoHoursTemplate: boolean;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  clearFieldError: (field: string) => void;
  commitField: (field: keyof Project, value: any, opts?: { onError?: (err: unknown) => void }) => Promise<void>;
  currentVerticalId: number | null;
  isVerticalMissing: boolean;
  verticals: Array<{ id?: number; name: string; shortName?: string }>;
  verticalsLoading: boolean;
  selectedVerticalId?: number | null;
  selectedAutoHoursTemplateId: number | null;
  selectedAutoHoursTemplateName: string;
  isAutoHoursTemplateMissing: boolean;
  autoHoursTemplates: AutoHoursTemplate[];
  autoHoursTemplatesLoading: boolean;
  autoHoursTemplatesError: string | null;
  promptAndUpdateHours: (
    reason: 'start_date_changed' | 'template_changed',
    nextStartDate: string | null,
    nextTemplateId: number | null
  ) => Promise<void>;
}

export interface AddAssignmentCardProps {
  addAssignmentState: ProjectDetailsPanelProps['addAssignmentState'];
  onPersonSearch: (term: string) => void;
  onPersonSearchFocus: () => void;
  onPersonSearchKeyDown: (e: React.KeyboardEvent) => void;
  srAnnouncement: string;
  personSearchResults: ProjectDetailsPersonSearchResult[];
  selectedPersonIndex: number;
  onPersonSelect: (p: any) => void;
  onRoleSelectNew: OnRoleSelect;
  onRolePlaceholderSelect: (role: ProjectRole) => void;
  onSaveAssignment: () => void;
  onCancelAddAssignment: () => void;
  addRoles: ProjectRole[];
  roleMatches: Array<{ role: ProjectRole; deptId: number; deptName: string }>;
  isPersonSearchOpen: boolean;
  personSearchDropdownAbove: boolean;
  personSearchInputRef: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

export interface ProjectAssignmentsColumnProps {
  isNarrowLayout: boolean;
  showAddAssignment: boolean;
  onAddAssignment: () => void;
  onSaveAssignment: () => void;
  onCancelAddAssignment: () => void;
  addAssignmentState: ProjectDetailsPanelProps['addAssignmentState'];
  onPersonSearch: (term: string) => void;
  onPersonSearchFocus: () => void;
  onPersonSearchKeyDown: (e: React.KeyboardEvent) => void;
  srAnnouncement: string;
  personSearchResults: ProjectDetailsPersonSearchResult[];
  selectedPersonIndex: number;
  onPersonSelect: (p: any) => void;
  onRoleSelectNew: OnRoleSelect;
  onRolePlaceholderSelect: (role: ProjectRole) => void;
  addRoles: ProjectRole[];
  roleMatches: Array<{ role: ProjectRole; deptId: number; deptName: string }>;
  isPersonSearchOpen: boolean;
  personSearchDropdownAbove: boolean;
  personSearchInputRef: React.RefObject<HTMLInputElement | null>;

  departmentEntries: Array<[string, Assignment[]]>;
  editingAssignmentId: number | null;
  editData: { roleOnProject: string; currentWeekHours: number; roleSearch: string };
  onEditAssignment: (a: Assignment) => void;
  onDeleteAssignment: (assignmentId: number) => void;
  onSaveEdit: (assignmentId: number) => void;
  onCancelEdit: () => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (a: Assignment) => number;
  onChangeAssignmentRole?: (assignmentId: number, roleId: number | null, roleName: string | null) => void;
  getPersonDepartmentId?: (personId: number) => number | null;
  currentWeekKey?: string;
  onUpdateWeekHours?: (assignmentId: number, weekKey: string, hours: number) => Promise<void> | void;
  weekKeys: string[];
  isCellSelected: (assignmentId: number, weekKey: string) => boolean;
  isEditingCell: (assignmentId: number, weekKey: string) => boolean;
  onCellSelect: (assignmentId: number, weekKey: string, isShift: boolean) => void;
  onCellMouseDown: (assignmentId: number, weekKey: string) => void;
  onCellMouseEnter: (assignmentId: number, weekKey: string) => void;
  onEditStartCell: (assignmentId: number, weekKey: string, currentValue: string) => void;
  onEditSaveCell: () => Promise<void>;
  onEditCancelCell: () => void;
  editingValue: string;
  onEditValueChangeCell: (v: string) => void;
  optimisticHours: Map<number, Record<string, number>>;
  onSwapPlaceholder: (assignmentId: number, person: { id: number; name: string; department?: number | null }) => Promise<void> | void;
}
