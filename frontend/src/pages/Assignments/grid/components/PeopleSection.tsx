import React from 'react';
import type { Assignment, Deliverable, Project } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import PersonSection from '@/pages/Assignments/grid/components/PersonSection';

export interface PersonWithAssignmentsMinimal {
  id?: number | null;
  name?: string;
  weeklyCapacity?: number | null;
  assignments: Assignment[];
  isExpanded: boolean;
  matchReason?: 'person_name' | 'assignment' | 'both';
}

export interface PeopleSectionProps {
  people: PersonWithAssignmentsMinimal[];
  weeks: WeekHeader[];
  gridTemplate: string;
  loadingAssignments: Set<number>;
  projectsById: Map<number, any>;
  togglePersonExpanded: (personId: number) => void;
  addAssignment: (personId: number, project: Project) => void;
  removeAssignment: (assignmentId: number, personId: number) => void;
  onCellSelect: (personId: number, assignmentId: number, week: string, isShiftClick?: boolean) => void;
  onCellMouseDown: (personId: number, assignmentId: number, week: string) => void;
  onCellMouseEnter: (personId: number, assignmentId: number, week: string) => void;
  editingCell: { personId: number; assignmentId: number; week: string } | null;
  onEditStart: (personId: number, assignmentId: number, week: string, currentValue: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  editingValue: string;
  onEditValueChange: (v: string) => void;
  selectedCell: { personId: number; assignmentId: number; week: string } | null;
  selectedCells: { personId: number; assignmentId: number; week: string }[];
  getDeliverablesForProjectWeek: (projectId: number, weekStart: string) => Deliverable[];
  getProjectStatus: (projectId: number) => string | null;
  statusDropdown: any;
  projectStatus: any;
  onStatusChange: (projectId: number, s: Project['status']) => void;
  onAssignmentRoleChange?: (personId: number, assignmentId: number, roleId: number | null, roleName: string | null) => void;
  onAutoHoursReplaceAssignment?: (assignment: Assignment, personId: number) => void;
  onAutoHoursSupplementAssignment?: (assignment: Assignment, personId: number) => void;
  renderAddAction: (person: PersonWithAssignmentsMinimal) => React.ReactNode;
  renderAutoHoursAction: (person: PersonWithAssignmentsMinimal) => React.ReactNode;
  renderAddRow: (person: PersonWithAssignmentsMinimal) => React.ReactNode;
  showAddRow: (person: PersonWithAssignmentsMinimal) => boolean;
  renderWeekTotals: (person: PersonWithAssignmentsMinimal, week: WeekHeader) => React.ReactNode;
  virtualPaddingLeft?: number;
  virtualPaddingRight?: number;
}

const PeopleSection: React.FC<PeopleSectionProps> = (props) => {
  const {
    people,
    weeks,
    gridTemplate,
    loadingAssignments,
    projectsById,
    renderAddAction,
    renderAutoHoursAction,
    renderAddRow,
    showAddRow,
    renderWeekTotals,
    virtualPaddingLeft = 0,
    virtualPaddingRight = 0,
    ...rest
  } = props;
  return (
    <div style={{ paddingLeft: virtualPaddingLeft, paddingRight: virtualPaddingRight }}>
      {people.map((person) => {
        const visibleAssignments = person.assignments || [];
        const isLoading = loadingAssignments.has(person.id!);
        return (
          <PersonSection
            key={person.id!}
            person={person as any}
            weeks={weeks}
            gridTemplate={gridTemplate}
            loadingAssignments={isLoading}
            projectsById={projectsById as any}
            assignments={visibleAssignments}
            renderAddAction={renderAddAction(person)}
            renderAutoHoursAction={renderAutoHoursAction(person)}
            renderAddRow={renderAddRow(person)}
            showAddRow={showAddRow(person)}
            renderWeekTotals={renderWeekTotals as any}
            {...rest as any}
          />
        );
      })}
    </div>
  );
};

export default PeopleSection;
