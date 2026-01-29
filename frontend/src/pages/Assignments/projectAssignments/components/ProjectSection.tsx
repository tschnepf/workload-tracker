import React from 'react';
import type { Assignment, Department, Person, Project } from '@/types/models';
import type { ProjectRole } from '@/roles/api';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import type { DeliverableMarker, ProjectWithAssignments } from '@/pages/Assignments/projectAssignments/types';
import ProjectSummaryRow from '@/pages/Assignments/projectAssignments/components/ProjectSummaryRow';
import ProjectAssignmentRow from '@/pages/Assignments/projectAssignments/components/ProjectAssignmentRow';

type RoleMatch = {
  role: ProjectRole;
  deptId: number;
  deptName: string;
};

export type ProjectSectionProps = {
  project: ProjectWithAssignments;
  weeks: WeekHeader[];
  gridTemplate: string;
  clientColumnWidth: number;
  projectColumnWidth: number;
  loadingAssignments: boolean;
  hoursByWeek: Record<string, number>;
  deliverablesByWeek: Record<string, DeliverableMarker[]>;
  deliverableTooltipsByWeek: Record<string, string>;
  typeColors: Record<string, string>;
  isStatusDropdownOpen: boolean;
  onToggleStatusDropdown: (projectId: number) => void;
  onCloseStatusDropdown: () => void;
  onStatusSelect: (projectId: number, status: Project['status']) => void;
  isUpdating: boolean;
  onToggleExpanded: (project: ProjectWithAssignments) => void;
  onAddPersonClick: (projectId: number) => void;
  isAddingForProject: boolean;
  addMode: 'person' | 'role';
  personQuery: string;
  personResults: Person[];
  roleMatches: RoleMatch[];
  selectedPersonIndex: number;
  onPersonQueryChange: (value: string) => void;
  onPersonKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, projectId: number) => void;
  onPersonSelect: (projectId: number, person: Person) => void;
  roleDeptId: number | null;
  roleQuery: string;
  roleResults: ProjectRole[];
  selectedRoleIndex: number;
  departments: Department[];
  onAddModeChange: (mode: 'person' | 'role') => void;
  onRoleDeptChange: (deptId: number | null) => void;
  onRoleQueryChange: (value: string) => void;
  onRoleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, projectId: number) => void;
  onRoleSelect: (projectId: number, role: ProjectRole) => void;
  rowIndexByKey: Map<string, number>;
  selectionBounds: { weekLo: number; weekHi: number; rowLo: number | null; rowHi: number | null } | null;
  editingCell: { rowKey: string; weekKey: string } | null;
  editingValue: string;
  onEditValueChange: (value: string) => void;
  savingCells: Set<string>;
  onBeginEditing: (assignmentId: number, weekKey: string, seed?: string) => void;
  onCommitEditing: (assignmentId: number, weekKey: string, value: number) => void;
  onCancelEditing: () => void;
  onCellMouseDown: (assignmentId: number, weekKey: string, e?: MouseEvent | React.MouseEvent) => void;
  onCellMouseEnter: (assignmentId: number, weekKey: string) => void;
  onCellSelect: (assignmentId: number, weekKey: string, isShiftClick?: boolean) => void;
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
};

const ProjectSection: React.FC<ProjectSectionProps> = React.memo(({
  project,
  weeks,
  gridTemplate,
  clientColumnWidth,
  projectColumnWidth,
  loadingAssignments,
  hoursByWeek,
  deliverablesByWeek,
  deliverableTooltipsByWeek,
  typeColors,
  isStatusDropdownOpen,
  onToggleStatusDropdown,
  onCloseStatusDropdown,
  onStatusSelect,
  isUpdating,
  onToggleExpanded,
  onAddPersonClick,
  isAddingForProject,
  addMode,
  personQuery,
  personResults,
  roleMatches,
  selectedPersonIndex,
  onPersonQueryChange,
  onPersonKeyDown,
  onPersonSelect,
  roleDeptId,
  roleQuery,
  roleResults,
  selectedRoleIndex,
  departments,
  onAddModeChange,
  onRoleDeptChange,
  onRoleQueryChange,
  onRoleKeyDown,
  onRoleSelect,
  rowIndexByKey,
  selectionBounds,
  editingCell,
  editingValue,
  onEditValueChange,
  savingCells,
  onBeginEditing,
  onCommitEditing,
  onCancelEditing,
  onCellMouseDown,
  onCellMouseEnter,
  onCellSelect,
  onRemoveAssignment,
  openRoleFor,
  roleAnchorRef,
  rolesByDept,
  onToggleRole,
  onSelectRole,
  onCloseRole,
}) => {
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <ProjectSummaryRow
        project={project}
        weeks={weeks}
        gridTemplate={gridTemplate}
        hoursByWeek={hoursByWeek}
        deliverablesByWeek={deliverablesByWeek}
        deliverableTooltipsByWeek={deliverableTooltipsByWeek}
        typeColors={typeColors}
        isStatusDropdownOpen={isStatusDropdownOpen}
        onToggleStatusDropdown={onToggleStatusDropdown}
        onCloseStatusDropdown={onCloseStatusDropdown}
        onStatusSelect={onStatusSelect}
        isUpdating={isUpdating}
        onToggleExpanded={onToggleExpanded}
        onAddPersonClick={onAddPersonClick}
      />

      {project.isExpanded && (
        <div className="p-2">
          {isAddingForProject && (
            <>
              <div className="pl-8 pr-2 py-1 space-y-2">
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => onAddModeChange('person')}
                    className={`px-2 py-0.5 rounded border border-[var(--border)] ${addMode === 'person' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                  >
                    Person
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddModeChange('role')}
                    className={`px-2 py-0.5 rounded border border-[var(--border)] ${addMode === 'role' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                  >
                    Role
                  </button>
                </div>

                {addMode === 'person' ? (
                  <div>
                    <input
                      type="text"
                      value={personQuery}
                      onChange={(e) => onPersonQueryChange(e.target.value)}
                      onKeyDown={(e) => onPersonKeyDown(e, project.id!)}
                      placeholder="Search people or roles..."
                      className="w-full h-7 bg-[var(--card)] border border-[var(--border)] rounded px-2 text-[var(--text)] text-xs"
                    />
                    {(personResults.length > 0 || roleMatches.length > 0) && (
                      <div className="mt-1 max-h-56 overflow-auto bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg">
                        {personResults.length > 0 && (
                          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            People
                          </div>
                        )}
                        {personResults.map((r, idx) => (
                          <div
                            key={r.id}
                            className={`px-2 py-1 text-xs cursor-pointer ${idx === selectedPersonIndex ? 'bg-[var(--surfaceOverlay)] text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--cardHover)]'}`}
                            onMouseDown={() => onPersonSelect(project.id!, r)}
                          >
                            {r.name}
                          </div>
                        ))}
                        {roleMatches.length > 0 && (
                          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            Roles
                          </div>
                        )}
                        {roleMatches.map((match) => (
                          <div
                            key={`${match.deptId}-${match.role.id}`}
                            className="px-2 py-1 text-xs cursor-pointer text-[var(--text)] hover:bg-[var(--cardHover)]"
                            onMouseDown={() => onRoleSelect(project.id!, match.role)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{`<${match.role.name}>`}</span>
                              <span className="text-[10px] text-[var(--muted)]">{match.deptName}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={roleDeptId ?? ''}
                      onChange={(e) => onRoleDeptChange(e.target.value ? Number(e.target.value) : null)}
                      className="w-full h-7 bg-[var(--card)] border border-[var(--border)] rounded px-2 text-[var(--text)] text-xs"
                    >
                      <option value="">Select department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id ?? ''}>{dept.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={roleQuery}
                      onChange={(e) => onRoleQueryChange(e.target.value)}
                      onKeyDown={(e) => onRoleKeyDown(e, project.id!)}
                      placeholder={roleDeptId ? 'Search roles...' : 'Select a department first'}
                      disabled={!roleDeptId}
                      className="w-full h-7 bg-[var(--card)] border border-[var(--border)] rounded px-2 text-[var(--text)] text-xs disabled:opacity-50"
                    />
                    {roleResults.length > 0 && roleQuery.trim().length > 0 && (
                      <div className="max-h-48 overflow-auto bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg">
                        {roleResults.map((r, idx) => (
                          <div
                            key={r.id}
                            className={`px-2 py-1 text-xs cursor-pointer ${idx === selectedRoleIndex ? 'bg-[var(--surfaceOverlay)] text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--cardHover)]'}`}
                            onMouseDown={() => onRoleSelect(project.id!, r)}
                          >
                            {r.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="py-1"></div>
              {weeks.map((w) => (<div key={w.date}></div>))}
            </>
          )}

          {loadingAssignments && (
            <>
              <div className="pl-8 pr-2 py-2 text-[var(--muted)] text-xs italic col-span-3">Loading assignments…</div>
              {weeks.map((w) => (
                <div key={w.date} className="py-2 border-l border-[var(--border)]">
                  <div className="mx-auto w-10 h-4 bg-[var(--card)] animate-pulse rounded" />
                </div>
              ))}
            </>
          )}

          {!loadingAssignments && (project.assignments || []).map((assignment: Assignment) => {
            const rowIdx = rowIndexByKey.get(String(assignment.id)) ?? null;
            const selectionRange = (() => {
              if (!selectionBounds) return null;
              const { rowLo, rowHi, weekLo, weekHi } = selectionBounds;
              if (rowIdx == null || rowLo == null || rowHi == null) return null;
              if (rowIdx < rowLo || rowIdx > rowHi) return null;
              return { weekStart: weekLo, weekEnd: weekHi };
            })();

            return (
              <ProjectAssignmentRow
                key={assignment.id}
                assignment={assignment}
                projectId={project.id!}
                weeks={weeks}
                gridTemplate={gridTemplate}
                clientColumnWidth={clientColumnWidth}
                projectColumnWidth={projectColumnWidth}
                selectionRange={selectionRange}
                editingCell={editingCell}
                editingValue={editingValue}
                onEditValueChange={onEditValueChange}
                savingCells={savingCells}
                deliverablesByWeek={deliverablesByWeek}
                deliverableTooltipsByWeek={deliverableTooltipsByWeek}
                typeColors={typeColors}
                onBeginEditing={onBeginEditing}
                onCommitEditing={onCommitEditing}
                onCancelEditing={onCancelEditing}
                onMouseDown={onCellMouseDown}
                onMouseEnter={onCellMouseEnter}
                onSelect={onCellSelect}
                onRemoveAssignment={onRemoveAssignment}
                openRoleFor={openRoleFor}
                roleAnchorRef={roleAnchorRef}
                rolesByDept={rolesByDept}
                onToggleRole={onToggleRole}
                onSelectRole={onSelectRole}
                onCloseRole={onCloseRole}
              />
            );
          })}

          {!loadingAssignments && (project.assignments || []).length === 0 && (
            <div className="grid gap-px py-1 bg-[var(--surface)]" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
                <div className="text-[var(--muted)] text-xs italic">No assignments</div>
              </div>
              <div></div>
              {weeks.map((week) => (
                <div key={week.date} className="flex items-center justify-center">
                  <div className="w-8 h-6"></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ProjectSection.displayName = 'ProjectSection';

export default ProjectSection;
