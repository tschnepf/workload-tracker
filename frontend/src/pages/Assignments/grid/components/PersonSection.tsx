import React from 'react';
import type { Assignment, Deliverable, Project } from '@/types/models';
import EmptyStateRow from '@/pages/Assignments/grid/components/EmptyStateRow';
import PersonGroupHeader from '@/pages/Assignments/grid/components/PersonGroupHeader';
import type { PersonWithAssignments as HeaderPersonWithAssignments } from '@/pages/Assignments/grid/components/PersonGroupHeader';
import AssignmentRow from '@/pages/Assignments/grid/components/AssignmentRow';
import type { useDropdownManager } from '@/components/projects/useDropdownManager';
import type { useProjectStatus } from '@/components/projects/useProjectStatus';

export interface WeekHeader { date: string; display: string; fullDisplay: string }

// Use the same person shape as PersonGroupHeader to avoid type drift
type PersonWithAssignments = HeaderPersonWithAssignments;

export interface PersonSectionProps {
  person: PersonWithAssignments;
  weeks: WeekHeader[];
  gridTemplate: string;
  loadingAssignments: boolean;
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
  projectsById: Map<number, any>;
  statusDropdown: ReturnType<typeof useDropdownManager<string>>;
  projectStatus: ReturnType<typeof useProjectStatus>;
  onStatusChange: (projectId: number, s: Project['status']) => void;
  onAssignmentRoleChange?: (personId: number, assignmentId: number, roleId: number | null, roleName: string | null) => void;
  assignments?: Assignment[]; // optional filtered assignments; falls back to person.assignments
  renderAddAction?: React.ReactNode;
  renderAutoHoursAction?: React.ReactNode;
  showAddRow?: boolean;
  renderAddRow?: React.ReactNode;
  renderWeekTotals?: (person: PersonWithAssignments, week: WeekHeader) => React.ReactNode;
  onAutoHoursReplaceAssignment?: (assignment: Assignment, personId: number) => void;
  onAutoHoursSupplementAssignment?: (assignment: Assignment, personId: number) => void;
}

const PersonSection: React.FC<PersonSectionProps> = ({
  person,
  weeks,
  gridTemplate,
  loadingAssignments,
  togglePersonExpanded,
  removeAssignment,
  onCellSelect,
  onCellMouseDown,
  onCellMouseEnter,
  editingCell,
  onEditStart,
  onEditSave,
  onEditCancel,
  editingValue,
  onEditValueChange,
  selectedCell,
  selectedCells,
  getDeliverablesForProjectWeek,
  getProjectStatus,
  projectsById,
  statusDropdown,
  projectStatus,
  onStatusChange,
  onAssignmentRoleChange,
  assignments,
  renderAddAction,
  renderAutoHoursAction,
  showAddRow,
  renderAddRow,
  renderWeekTotals,
  onAutoHoursReplaceAssignment,
  onAutoHoursSupplementAssignment,
}) => {
  const visible = assignments ?? person.assignments ?? [];
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      {/* Person Row */}
      <div className="grid gap-px p-2 hover:bg-[var(--surfaceHover)] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
        <PersonGroupHeader person={person} onToggle={() => togglePersonExpanded(person.id!)} />
        {/* Add Assignment Action (slot) */}
        <div className="flex items-center justify-center gap-1">{renderAddAction ?? null}</div>
        <div className="flex items-center justify-center">{renderAutoHoursAction ?? null}</div>
        {/* Weekly Totals */}
        {weeks.map((week) => (
          <div key={week.date} className="flex items-center justify-center px-1">
            {renderWeekTotals ? renderWeekTotals(person, week) : <div className="w-12 h-6" />}
          </div>
        ))}
      </div>

      {/* Loading placeholder */}
      {person.isExpanded && loadingAssignments && (
        <div className="grid gap-px p-2" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
            <div className="text-[var(--muted)] text-xs">Loading assignments...</div>
          </div>
          <div></div>
          <div></div>
          {weeks.map((week) => (
            <div key={week.date} className="flex items-center justify-center">
              <div className="w-12 h-6 flex items-center justify-center text-[var(--muted)] text-xs"></div>
            </div>
          ))}
        </div>
      )}

      {/* Assignment Rows */}
      {person.isExpanded && !loadingAssignments && visible.map((assignment) => (
        <AssignmentRow
          key={assignment.id}
          assignment={assignment}
          projectsById={projectsById as any}
          getProjectStatus={getProjectStatus}
          mondays={weeks}
          onStatusChange={onStatusChange}
          onRemoveAssignment={(assignmentId) => removeAssignment(assignmentId, person.id!)}
          onCellEdit={() => {}}
          statusDropdown={statusDropdown}
          projectStatus={projectStatus}
          editingCell={editingCell}
          onEditStart={onEditStart}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
          editingValue={editingValue}
          onEditValueChange={onEditValueChange}
          selectedCells={selectedCells}
          selectedCell={selectedCell}
          onCellSelect={onCellSelect}
          onCellMouseDown={onCellMouseDown}
          onCellMouseEnter={onCellMouseEnter}
          getDeliverablesForProjectWeek={getDeliverablesForProjectWeek}
          personId={person.id!}
          gridTemplate={gridTemplate}
          onAssignmentRoleChange={onAssignmentRoleChange}
          personDepartmentId={person.department as any}
          onAutoHoursReplace={onAutoHoursReplaceAssignment}
          onAutoHoursSupplement={onAutoHoursSupplementAssignment}
        />
      ))}

      {/* Add Assignment Row (slot) */}
      {person.isExpanded && showAddRow && renderAddRow}

      {/* Empty State */}
      {person.isExpanded && visible.length === 0 && (
        <EmptyStateRow weeks={weeks} gridTemplate={gridTemplate} />
      )}
    </div>
  );
};

export default PersonSection;
