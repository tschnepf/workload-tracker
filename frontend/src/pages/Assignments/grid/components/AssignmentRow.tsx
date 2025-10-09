import React from 'react';
import type { Assignment, Deliverable, Project } from '@/types/models';
import ProjectCell from '@/pages/Assignments/grid/components/ProjectCell';
import RemoveAssignmentButton from '@/pages/Assignments/grid/components/RemoveAssignmentButton';
import WeekCell from '@/pages/Assignments/grid/components/WeekCell';
import type { useDropdownManager } from '@/components/projects/useDropdownManager';
import type { useProjectStatus } from '@/components/projects/useProjectStatus';

export interface AssignmentRowProps {
  assignment: Assignment;
  projectsById: Map<number, Project> | Map<number, any>;
  getProjectStatus: (projectId: number) => string | null;
  mondays: { date: string; display: string; fullDisplay: string }[];
  onStatusChange: (projectId: number, newStatus: Project['status']) => void;
  onRemoveAssignment: (assignmentId: number) => void;
  onCellEdit: (assignmentId: number, week: string, hours: number) => void;
  statusDropdown: ReturnType<typeof useDropdownManager<string>>;
  projectStatus: ReturnType<typeof useProjectStatus>;
  editingCell: { personId: number; assignmentId: number; week: string } | null;
  onEditStart: (personId: number, assignmentId: number, week: string, currentValue: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  editingValue: string;
  onEditValueChange: (value: string) => void;
  selectedCells: { personId: number; assignmentId: number; week: string }[];
  selectedCell: { personId: number; assignmentId: number; week: string } | null;
  onCellSelect: (personId: number, assignmentId: number, week: string, isShiftClick?: boolean) => void;
  onCellMouseDown: (personId: number, assignmentId: number, week: string) => void;
  onCellMouseEnter: (personId: number, assignmentId: number, week: string) => void;
  getDeliverablesForProjectWeek: (projectId: number, weekStart: string) => Deliverable[];
  personId: number;
  gridTemplate: string;
  onAssignmentRoleChange?: (personId: number, assignmentId: number, roleId: number | null, roleName: string | null) => void;
  personDepartmentId?: number | null;
}

const AssignmentRow: React.FC<AssignmentRowProps> = React.memo(({
  assignment,
  projectsById,
  getProjectStatus,
  mondays,
  onStatusChange,
  onRemoveAssignment,
  statusDropdown,
  projectStatus,
  editingCell,
  onEditStart,
  onEditSave,
  onEditCancel,
  editingValue,
  onEditValueChange,
  selectedCells,
  selectedCell,
  onCellSelect,
  onCellMouseDown,
  onCellMouseEnter,
  getDeliverablesForProjectWeek,
  personId,
  gridTemplate,
  onAssignmentRoleChange,
  personDepartmentId,
}) => {
  const isSelected = (week: string) => {
    const inMulti = selectedCells.some(cell =>
      cell.personId === personId &&
      cell.assignmentId === assignment.id &&
      cell.week === week
    );
    const inSingle = selectedCell != null &&
      selectedCell.personId === personId &&
      selectedCell.assignmentId === assignment.id &&
      selectedCell.week === week;
    return inMulti || inSingle;
  };

  const isEditing = (week: string) =>
    editingCell?.personId === personId &&
    editingCell?.assignmentId === assignment.id &&
    editingCell?.week === week;

  const project = (projectsById as Map<number, any>).get(assignment.project);
  const clientName = project?.client || '';
  const projectName = assignment.projectDisplayName || project?.name || '';

  return (
    <div className="grid gap-px p-1 bg-[var(--surface)] hover:bg-[var(--surfaceHover)] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="flex items-start pt-1 pb-0 pl-[60px] pr-2">
        <div className="min-w-0 flex-1">
          <div className="text-[var(--muted)] text-xs truncate" title={clientName}>
            {clientName || ''}
          </div>
        </div>
      </div>

      <ProjectCell
        assignmentId={assignment.id!}
        projectId={assignment.project}
        projectName={projectName}
        roleOnProjectId={assignment.roleOnProjectId as any}
        roleName={assignment.roleName as any}
        personDepartmentId={personDepartmentId ?? null}
        onRoleChange={(roleId, roleName) => onAssignmentRoleChange?.(personId, assignment.id!, roleId, roleName)}
        getProjectStatus={getProjectStatus}
        statusDropdown={statusDropdown}
        projectStatus={projectStatus}
        onStatusChange={onStatusChange}
      />

      <div className="flex items-center justify-center">
        <RemoveAssignmentButton onClick={() => onRemoveAssignment(assignment.id!)} />
      </div>

      {mondays.map((monday) => (
        <WeekCell
          key={monday.date}
          weekKey={monday.date}
          isSelected={isSelected(monday.date)}
          isEditing={isEditing(monday.date)}
          currentHours={assignment.weeklyHours?.[monday.date] || 0}
          onSelect={(isShift) => onCellSelect(personId, assignment.id, monday.date, isShift)}
          onMouseDown={() => onCellMouseDown(personId, assignment.id, monday.date)}
          onMouseEnter={() => onCellMouseEnter(personId, assignment.id, monday.date)}
          onEditStart={() => onEditStart(personId, assignment.id, monday.date, String(assignment.weeklyHours?.[monday.date] || 0))}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
          editingValue={editingValue}
          onEditValueChange={onEditValueChange}
          deliverablesForWeek={assignment.project ? getDeliverablesForProjectWeek(assignment.project, monday.date) : []}
        />
      ))}
    </div>
  );
});

export default AssignmentRow;
