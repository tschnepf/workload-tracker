import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ProjectRole } from '@/roles/api';
import type { Department, Person, Project } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import type { DeliverableMarker, ProjectWithAssignments } from '@/pages/Assignments/projectAssignments/types';
import ProjectSection from '@/pages/Assignments/projectAssignments/components/ProjectSection';

type RoleMatch = {
  role: ProjectRole;
  deptId: number;
  deptName: string;
};

export type ProjectsSectionProps = {
  projects: ProjectWithAssignments[];
  weeks: WeekHeader[];
  gridTemplate: string;
  minWidth: number;
  clientColumnWidth: number;
  projectColumnWidth: number;
  loadingAssignments: Set<number>;
  hoursByProject: Record<number, Record<string, number>>;
  deliverableTypesByProjectWeek: Record<number, Record<string, DeliverableMarker[]>>;
  deliverableTooltipsByProjectWeek: Record<number, Record<string, string>>;
  typeColors: Record<string, string>;
  statusDropdownOpenId: number | null;
  onToggleStatusDropdown: (projectId: number) => void;
  onCloseStatusDropdown: () => void;
  onStatusSelect: (projectId: number, status: Project['status']) => void;
  isProjectUpdating: (projectId: number) => boolean;
  onToggleExpanded: (project: ProjectWithAssignments) => void;
  onAddPersonClick: (projectId: number) => void;
  isAddingForProject: number | null;
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
  activeSelectionProjectId: number | null;
  editingProjectId: number | null;
  openRoleProjectId: number | null;
  savingCellsByProject: Map<number, Set<string>>;
  editingValue: string;
  onEditValueChange: (value: string) => void;
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

const EMPTY_WEEK_HOURS: Record<string, number> = {};
const EMPTY_WEEK_DELIVERABLES: Record<string, DeliverableMarker[]> = {};
const EMPTY_WEEK_TOOLTIPS: Record<string, string> = {};
const EMPTY_PERSON_RESULTS: Person[] = [];
const EMPTY_ROLE_RESULTS: ProjectRole[] = [];
const EMPTY_ROLE_MATCHES: RoleMatch[] = [];
const EMPTY_ROW_INDEX = new Map<string, number>();
const EMPTY_SAVING_SET = new Set<string>();
const EMPTY_ROLES_BY_DEPT: Record<number, ProjectRole[]> = {};
const noop = (_value: string) => {};

const ProjectsSection: React.FC<ProjectsSectionProps> = (props) => {
  const {
    projects,
    weeks,
    gridTemplate,
    minWidth,
    clientColumnWidth,
    projectColumnWidth,
    loadingAssignments,
    hoursByProject,
    deliverableTypesByProjectWeek,
    deliverableTooltipsByProjectWeek,
    typeColors,
    statusDropdownOpenId,
    onToggleStatusDropdown,
    onCloseStatusDropdown,
    onStatusSelect,
    isProjectUpdating,
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
    activeSelectionProjectId,
    editingProjectId,
    openRoleProjectId,
    savingCellsByProject,
    editingValue,
    onEditValueChange,
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
  } = props;

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);

  React.useLayoutEffect(() => {
    if (scrollElement || !listRef.current) return;
    const main = listRef.current.closest('main') as HTMLElement | null;
    setScrollElement(main);
  }, [scrollElement]);

  React.useLayoutEffect(() => {
    if (!scrollElement || !listRef.current) return;
    const updateMargin = () => {
      const parentRect = scrollElement.getBoundingClientRect();
      const listRect = listRef.current!.getBoundingClientRect();
      const nextMargin = listRect.top - parentRect.top + scrollElement.scrollTop;
      setScrollMargin(nextMargin);
    };
    updateMargin();
    const onResize = () => updateMargin();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scrollElement, projects.length, weeks.length, minWidth]);

  const rowVirtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 72,
    overscan: 6,
    scrollMargin,
    gap: 4,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div ref={listRef} style={{ minWidth, position: 'relative', height: rowVirtualizer.getTotalSize() }}>
      {virtualItems.map((virtualRow) => {
        const project = projects[virtualRow.index];
        const isAdding = isAddingForProject === project.id;
        const isSelectionProject = activeSelectionProjectId != null && project.id === activeSelectionProjectId;
        const hoursByWeek = project.id ? (hoursByProject[project.id] || EMPTY_WEEK_HOURS) : EMPTY_WEEK_HOURS;
        const deliverablesByWeek = project.id ? (deliverableTypesByProjectWeek[project.id] || EMPTY_WEEK_DELIVERABLES) : EMPTY_WEEK_DELIVERABLES;
        const savingCells = project.id ? (savingCellsByProject.get(project.id) || EMPTY_SAVING_SET) : EMPTY_SAVING_SET;
        const rowIndex = isSelectionProject ? rowIndexByKey : EMPTY_ROW_INDEX;
        const selectionBoundsForProject = isSelectionProject ? selectionBounds : null;
        const editingCellForProject = editingProjectId === project.id ? editingCell : null;
        const editingValueForProject = editingProjectId === project.id ? editingValue : '';
        const onEditValueChangeForProject = editingProjectId === project.id ? onEditValueChange : noop;
        const openRoleForProject = openRoleProjectId === project.id ? openRoleFor : null;
        const rolesByDeptForProject = openRoleProjectId === project.id ? rolesByDept : EMPTY_ROLES_BY_DEPT;
        const personQueryValue = isAdding ? personQuery : '';
        const personResultsValue = isAdding ? personResults : EMPTY_PERSON_RESULTS;
        const roleMatchesValue = isAdding ? roleMatches : EMPTY_ROLE_MATCHES;
        const selectedIndexValue = isAdding ? selectedPersonIndex : -1;
        const roleQueryValue = isAdding ? roleQuery : '';
        const roleResultsValue = isAdding ? roleResults : EMPTY_ROLE_RESULTS;
        const selectedRoleIndexValue = isAdding ? selectedRoleIndex : -1;
        const isStatusDropdownOpen = statusDropdownOpenId === project.id;
        const isUpdating = project.id ? isProjectUpdating(project.id) : false;
        const deliverableTooltipsByWeek = project.id ? (deliverableTooltipsByProjectWeek[project.id] || EMPTY_WEEK_TOOLTIPS) : EMPTY_WEEK_TOOLTIPS;

        return (
          <div
            key={project.id || project.name}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            <ProjectSection
              project={project}
              weeks={weeks}
              gridTemplate={gridTemplate}
              clientColumnWidth={clientColumnWidth}
              projectColumnWidth={projectColumnWidth}
              loadingAssignments={project.id ? loadingAssignments.has(project.id) : false}
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
              isAddingForProject={isAdding}
              addMode={addMode}
              personQuery={personQueryValue}
              personResults={personResultsValue}
              roleMatches={roleMatchesValue}
              selectedPersonIndex={selectedIndexValue}
              onPersonQueryChange={onPersonQueryChange}
              onPersonKeyDown={onPersonKeyDown}
              onPersonSelect={onPersonSelect}
              roleDeptId={roleDeptId}
              roleQuery={roleQueryValue}
              roleResults={roleResultsValue}
              selectedRoleIndex={selectedRoleIndexValue}
              departments={departments}
              onAddModeChange={onAddModeChange}
              onRoleDeptChange={onRoleDeptChange}
              onRoleQueryChange={onRoleQueryChange}
              onRoleKeyDown={onRoleKeyDown}
              onRoleSelect={onRoleSelect}
              rowIndexByKey={rowIndex}
              selectionBounds={selectionBoundsForProject}
              editingCell={editingCellForProject}
              editingValue={editingValueForProject}
              onEditValueChange={onEditValueChangeForProject}
              savingCells={savingCells}
              onBeginEditing={onBeginEditing}
              onCommitEditing={onCommitEditing}
              onCancelEditing={onCancelEditing}
              onCellMouseDown={onCellMouseDown}
              onCellMouseEnter={onCellMouseEnter}
              onCellSelect={onCellSelect}
              onRemoveAssignment={onRemoveAssignment}
              openRoleFor={openRoleForProject}
              roleAnchorRef={roleAnchorRef}
              rolesByDept={rolesByDeptForProject}
              onToggleRole={onToggleRole}
              onSelectRole={onSelectRole}
              onCloseRole={onCloseRole}
            />
          </div>
        );
      })}
    </div>
  );
};

export default ProjectsSection;
