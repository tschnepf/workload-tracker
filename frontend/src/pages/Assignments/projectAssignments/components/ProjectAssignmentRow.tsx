import React from 'react';
import type { Assignment } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import RoleDropdown from '@/roles/components/RoleDropdown';
import type { ProjectRole } from '@/roles/api';
import { WeekCell } from '@/pages/Assignments/grid/WeekCell';
import type { DeliverableMarker } from '@/pages/Assignments/projectAssignments/types';
import PlaceholderPersonSwap from '@/components/assignments/PlaceholderPersonSwap';
import type { Person } from '@/types/models';

const EMPTY_MARKERS: DeliverableMarker[] = [];

export type ProjectAssignmentRowProps = {
  assignment: Assignment;
  projectId: number;
  weeks: WeekHeader[];
  gridTemplate: string;
  clientColumnWidth: number;
  projectColumnWidth: number;
  selectionRange: { weekStart: number; weekEnd: number } | null;
  editingCell: { rowKey: string; weekKey: string } | null;
  editingValue: string;
  onEditValueChange: (value: string) => void;
  savingCells: Set<string>;
  deliverablesByWeek: Record<string, DeliverableMarker[]>;
  deliverableTooltipsByWeek: Record<string, string>;
  typeColors: Record<string, string>;
  onBeginEditing: (assignmentId: number, weekKey: string, seed?: string) => void;
  onCommitEditing: (assignmentId: number, weekKey: string, value: number) => void;
  onCancelEditing: () => void;
  onMouseDown: (assignmentId: number, weekKey: string, e?: MouseEvent | React.MouseEvent) => void;
  onMouseEnter: (assignmentId: number, weekKey: string) => void;
  onSelect: (assignmentId: number, weekKey: string, isShiftClick?: boolean) => void;
  onRemoveAssignment: (projectId: number, assignmentId: number, personId: number | null) => void;
  openRoleFor: number | null;
  roleAnchorRef: React.MutableRefObject<HTMLElement | null>;
  rolesByDept: Record<number, ProjectRole[]>;
  onToggleRole: (assignmentId: number, deptId: number | null, anchor: HTMLElement) => void;
  onSelectRole: (
    projectId: number,
    assignmentId: number,
    deptId: number | null,
    roleId: number | null,
    roleName: string | null,
    previousId: number | null,
    previousName: string | null
  ) => void;
  onCloseRole: () => void;
  onSwapPlaceholder: (projectId: number, assignmentId: number, person: Pick<Person, 'id' | 'name' | 'department'>) => Promise<void> | void;
};

const ProjectAssignmentRow: React.FC<ProjectAssignmentRowProps> = React.memo(({
  assignment,
  projectId,
  weeks,
  gridTemplate,
  clientColumnWidth,
  projectColumnWidth,
  selectionRange,
  editingCell,
  editingValue,
  onEditValueChange,
  savingCells,
  deliverablesByWeek,
  deliverableTooltipsByWeek,
  typeColors,
  onBeginEditing,
  onCommitEditing,
  onCancelEditing,
  onMouseDown,
  onMouseEnter,
  onSelect,
  onRemoveAssignment,
  openRoleFor,
  roleAnchorRef,
  rolesByDept,
  onToggleRole,
  onSelectRole,
  onCloseRole,
  onSwapPlaceholder,
}) => {
  const rowKey = String(assignment.id);
  const deptId = (assignment as any).personDepartmentId as number | null | undefined;
  const label = (assignment as any).roleName as string | null | undefined;
  const personLabel = assignment.personName
    || (assignment.person != null ? `Person #${assignment.person}` : (label ? `<${label}>` : 'Unassigned'));
  const canSwapPlaceholder = assignment.person == null && !!label;
  const currentId = (assignment as any).roleOnProjectId as number | null | undefined;
  const roleIsOpen = openRoleFor === assignment.id;
  const WEEK_WIDTH = 70;
  const COLUMN_GAP = 1;
  const WEEK_OFFSET_LEFT = clientColumnWidth + projectColumnWidth + 40 + COLUMN_GAP * 3;
  const selectionStyle = selectionRange
    ? {
        left: WEEK_OFFSET_LEFT + selectionRange.weekStart * (WEEK_WIDTH + COLUMN_GAP),
        width: (selectionRange.weekEnd - selectionRange.weekStart + 1) * WEEK_WIDTH
          + (selectionRange.weekEnd - selectionRange.weekStart) * COLUMN_GAP,
      }
    : null;

  return (
    <div className="relative grid gap-px py-1 bg-[var(--surface)] hover:bg-[var(--cardHover)] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="pl-8 pr-2 py-2 text-[var(--text)] text-xs truncate" title={personLabel}>
        {canSwapPlaceholder ? (
          <PlaceholderPersonSwap
            label={personLabel}
            deptId={deptId ?? null}
            className="text-[var(--text)] text-xs truncate"
            onSelect={(person) => onSwapPlaceholder(projectId, assignment.id!, person)}
          />
        ) : (
          personLabel
        )}
      </div>
      <div className="pl-8 pr-2 py-2 text-[var(--muted)] text-xs truncate relative">
        <button
          type="button"
          disabled={!deptId}
          className={`underline decoration-dotted underline-offset-2 ${deptId ? '' : 'text-[var(--muted)] cursor-not-allowed'}`}
          onClick={(e) => {
            if (!deptId) return;
            onToggleRole(assignment.id!, deptId, e.currentTarget as HTMLElement);
          }}
        >
          {label || 'Set role'}
        </button>
        {roleIsOpen && deptId && (
          <div className="absolute mt-1">
            <RoleDropdown
              roles={rolesByDept[deptId] || []}
              currentId={currentId ?? null}
              onSelect={(roleId, roleName) => {
                onSelectRole(projectId, assignment.id!, deptId, roleId, roleName, currentId ?? null, label ?? null);
              }}
              onClose={onCloseRole}
              anchorRef={roleAnchorRef as any}
            />
          </div>
        )}
      </div>
      <div className="py-2 flex items-center justify-center">
        <button
          className="w-5 h-5 flex items-center justify-center text-[var(--muted)] hover:text-red-400 hover:bg-red-500/20 rounded"
          title="Remove assignment"
          onClick={() => onRemoveAssignment(projectId, assignment.id!, (assignment as any).person ?? null)}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {selectionStyle && (
        <div
          className="absolute top-1 bottom-1 pointer-events-none bg-[var(--surfaceOverlay)] border border-[var(--primary)] rounded-sm"
          style={selectionStyle}
        />
      )}
      {weeks.map((w) => {
        const hours = Number((assignment.weeklyHours || {})[w.date] || 0) || 0;
        const key = `${assignment.id}-${w.date}`;
        const isEditing = !!editingCell && editingCell.rowKey === rowKey && editingCell.weekKey === w.date;
        const isSaving = savingCells.has(key);
        const markers = deliverablesByWeek[w.date] || EMPTY_MARKERS;
        const tooltip = deliverableTooltipsByWeek[w.date];
        return (
          <WeekCell
            key={key}
            assignmentId={assignment.id!}
            weekKey={w.date}
            hours={hours}
            isSaving={isSaving}
            deliverableMarkers={markers}
            tooltip={tooltip}
            typeColors={typeColors}
            isEditing={isEditing}
            editingValue={isEditing ? editingValue : ''}
            onEditValueChange={onEditValueChange}
            onBeginEditing={onBeginEditing}
            onCommitEditing={onCommitEditing}
            onCancelEditing={onCancelEditing}
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
});

ProjectAssignmentRow.displayName = 'ProjectAssignmentRow';

export default ProjectAssignmentRow;
