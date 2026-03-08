import React from 'react';
import { useQuery } from '@tanstack/react-query';
import AssignmentRow from './AssignmentRow';
import AddAssignmentCard from './AddAssignmentCard';
import type { ProjectAssignmentsColumnProps } from '@/pages/Projects/list/components/projectDetailsPanel.types';
import { taskProgressColorsApi } from '@/services/api';
import type { ProjectTask, TaskProgressColorRange } from '@/types/models';

const DEFAULT_TASK_PROGRESS_COLORS: TaskProgressColorRange[] = [
  { minPercent: 0, maxPercent: 25, colorHex: 'var(--color-state-warning)', label: '0-25%' },
  { minPercent: 26, maxPercent: 75, colorHex: 'var(--color-state-info)', label: '26-75%' },
  { minPercent: 76, maxPercent: 100, colorHex: 'var(--color-state-danger)', label: '76-100%' },
];

const ProjectAssignmentsColumn: React.FC<ProjectAssignmentsColumnProps> = ({
  isNarrowLayout,
  showAddAssignment,
  onAddAssignment,
  onSaveAssignment,
  onCancelAddAssignment,
  addAssignmentState,
  onPersonSearch,
  onPersonSearchFocus,
  onPersonSearchKeyDown,
  srAnnouncement,
  personSearchResults,
  selectedPersonIndex,
  onPersonSelect,
  onRoleSelectNew,
  onRolePlaceholderSelect,
  addRoles,
  roleMatches,
  isPersonSearchOpen,
  personSearchDropdownAbove,
  personSearchInputRef,
  departmentEntries,
  editingAssignmentId,
  editData,
  onEditAssignment,
  onDeleteAssignment,
  onSaveEdit,
  onCancelEdit,
  onHoursChange,
  getCurrentWeekHours,
  onChangeAssignmentRole,
  getPersonDepartmentId,
  currentWeekKey,
  onUpdateWeekHours,
  weekKeys,
  isCellSelected,
  isEditingCell,
  onCellSelect,
  onCellMouseDown,
  onCellMouseEnter,
  onEditStartCell,
  onEditSaveCell,
  onEditCancelCell,
  editingValue,
  onEditValueChangeCell,
  optimisticHours,
  onSwapPlaceholder,
  taskTracking,
  taskTrackingLoading,
  canManageTaskTracking,
  onTaskUpdate,
}) => {
  const taskProgressColorsQuery = useQuery({
    queryKey: ['task-progress-colors'],
    queryFn: () => taskProgressColorsApi.get(),
    staleTime: 5 * 60_000,
  });
  const taskProgressRanges = React.useMemo(() => {
    const raw = taskProgressColorsQuery.data?.ranges || DEFAULT_TASK_PROGRESS_COLORS;
    return [...raw]
      .map((range) => ({
        minPercent: Number(range.minPercent ?? 0),
        maxPercent: Number(range.maxPercent ?? 100),
        colorHex: String(range.colorHex || 'var(--color-state-info)'),
        label: range.label || '',
      }))
      .sort((a, b) => (a.minPercent - b.minPercent) || (a.maxPercent - b.maxPercent));
  }, [taskProgressColorsQuery.data?.ranges]);
  const getTaskProgressColor = React.useCallback((percent: number): string => {
    const value = Math.max(0, Math.min(100, Number(percent ?? 0)));
    const matched = taskProgressRanges.find((range) => value >= range.minPercent && value <= range.maxPercent);
    return matched?.colorHex || 'var(--primary)';
  }, [taskProgressRanges]);
  const allTasks = React.useMemo<ProjectTask[]>(() => {
    if (!taskTracking?.enabled) return [];
    const merged = [...(taskTracking.projectTasks || []), ...(taskTracking.deliverableTasks || [])];
    return merged
      .filter((task): task is ProjectTask & { id: number } => task.id != null)
      .sort((a, b) => {
        const deptCompare = (a.departmentName || '').localeCompare(b.departmentName || '');
        if (deptCompare !== 0) return deptCompare;
        const scopeCompare = (a.scope || '').localeCompare(b.scope || '');
        if (scopeCompare !== 0) return scopeCompare;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [taskTracking]);
  const tasksByDepartment = React.useMemo(() => {
    const map = new Map<number, ProjectTask[]>();
    allTasks.forEach((task) => {
      const departmentId = Number(task.departmentId);
      if (!Number.isFinite(departmentId) || departmentId <= 0) return;
      const list = map.get(departmentId) || [];
      list.push(task);
      map.set(departmentId, list);
    });
    return map;
  }, [allTasks]);

  const addAssignmentButton = (
    <button
      onClick={onAddAssignment}
      className="px-2 py-0.5 text-xs rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors"
    >
      + Add Assignment
    </button>
  );

  return (
    <div className="flex flex-col gap-4 min-w-0" style={{ gridArea: 'assignments' }}>
      <div
        className={`flex items-center justify-end ${isNarrowLayout ? 'order-1' : ''}`}
        data-testid={isNarrowLayout ? 'assignments-add-button-narrow' : 'assignments-add-button-wide'}
      >
        {addAssignmentButton}
      </div>

      {showAddAssignment && (
        <AddAssignmentCard
          addAssignmentState={addAssignmentState}
          onPersonSearch={onPersonSearch}
          onPersonSearchFocus={onPersonSearchFocus}
          onPersonSearchKeyDown={onPersonSearchKeyDown}
          srAnnouncement={srAnnouncement}
          personSearchResults={personSearchResults}
          selectedPersonIndex={selectedPersonIndex}
          onPersonSelect={onPersonSelect}
          onRoleSelectNew={onRoleSelectNew}
          onRolePlaceholderSelect={onRolePlaceholderSelect}
          onSaveAssignment={onSaveAssignment}
          onCancelAddAssignment={onCancelAddAssignment}
          addRoles={addRoles as any}
          roleMatches={roleMatches}
          isPersonSearchOpen={isPersonSearchOpen}
          personSearchDropdownAbove={personSearchDropdownAbove}
          personSearchInputRef={personSearchInputRef}
          className={isNarrowLayout ? 'order-2' : ''}
        />
      )}

      {departmentEntries.length > 0 ? (
        departmentEntries.map(([deptName, items]) => (
          <div
            key={deptName}
            className={`bg-[var(--card)] border border-[var(--border)] rounded shadow-sm overflow-visible min-w-0 ${isNarrowLayout ? 'order-3' : ''}`}
            data-testid="assignment-department-card"
          >
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <div className="text-base font-semibold text-[var(--text)]">{deptName}</div>
            </div>
            <div className="p-2 space-y-2">
              {items.map((assignment) => {
                const assignmentDepartmentId =
                  (assignment as any).personDepartmentId
                  ?? (getPersonDepartmentId && assignment.person != null ? getPersonDepartmentId(assignment.person) : undefined);
                const departmentScopedTasks = assignmentDepartmentId != null
                  ? (tasksByDepartment.get(Number(assignmentDepartmentId)) || [])
                  : [];
                return (
                  <div key={assignment.id}>
                    <AssignmentRow
                      assignment={assignment}
                      isEditing={editingAssignmentId === assignment.id}
                      editData={editData}
                      showHours={false}
                      onEdit={() => onEditAssignment(assignment)}
                      onDelete={() => assignment.id && onDeleteAssignment(assignment.id)}
                      onSave={() => assignment.id && onSaveEdit(assignment.id)}
                      onCancel={onCancelEdit}
                      onHoursChange={onHoursChange}
                      getCurrentWeekHours={getCurrentWeekHours}
                      onChangeAssignmentRole={onChangeAssignmentRole}
                      personDepartmentId={assignmentDepartmentId}
                      currentWeekKey={currentWeekKey}
                      onUpdateWeekHours={onUpdateWeekHours}
                      weekKeys={weekKeys}
                      isCellSelected={isCellSelected}
                      isEditingCell={isEditingCell}
                      onCellSelect={onCellSelect}
                      onCellMouseDown={onCellMouseDown}
                      onCellMouseEnter={onCellMouseEnter}
                      onEditStartCell={onEditStartCell}
                      onEditSaveCell={onEditSaveCell}
                      onEditCancelCell={onEditCancelCell}
                      editingValue={editingValue}
                      onEditValueChangeCell={onEditValueChangeCell}
                      optimisticHours={optimisticHours}
                      onSwapPlaceholder={onSwapPlaceholder}
                      taskTrackingEnabled={Boolean(taskTracking?.enabled)}
                      taskTrackingLoading={Boolean(taskTracking?.enabled && taskTrackingLoading)}
                      assignmentTasks={departmentScopedTasks}
                      canManageTaskTracking={Boolean(canManageTaskTracking)}
                      onTaskUpdate={onTaskUpdate}
                      getTaskProgressColor={getTaskProgressColor}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : !showAddAssignment ? (
        <div
          className={`bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-3 text-center ${isNarrowLayout ? 'order-3' : ''}`}
          data-testid="assignments-empty-state"
        >
          <div className="text-[var(--muted)] text-sm">No assignments yet</div>
          <div className="text-[var(--muted)] text-xs mt-1">Click "Add Assignment" to get started</div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectAssignmentsColumn;
