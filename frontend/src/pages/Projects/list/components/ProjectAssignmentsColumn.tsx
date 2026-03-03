import React from 'react';
import AssignmentRow from './AssignmentRow';
import AddAssignmentCard from './AddAssignmentCard';
import type { ProjectAssignmentsColumnProps } from '@/pages/Projects/list/components/projectDetailsPanel.types';

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
}) => {
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
            className={`bg-[var(--card)] border border-[var(--border)] rounded shadow-sm overflow-hidden min-w-0 ${isNarrowLayout ? 'order-3' : ''}`}
            data-testid="assignment-department-card"
          >
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <div className="text-base font-semibold text-[var(--text)]">{deptName}</div>
            </div>
            <div className="p-2 space-y-2">
              {items.map((assignment) => (
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
                    personDepartmentId={
                      (assignment as any).personDepartmentId
                      ?? (getPersonDepartmentId && assignment.person != null ? getPersonDepartmentId(assignment.person) : undefined)
                    }
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
                  />
                </div>
              ))}
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
