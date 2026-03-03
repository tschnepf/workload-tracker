import React from 'react';
import type { Project } from '@/types/models';
import ProjectPreDeliverableSettings from '@/components/projects/ProjectPreDeliverableSettings';
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor';
import { useAuth } from '@/hooks/useAuth';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useVerticals } from '@/hooks/useVerticals';
import { useNarrowLayoutObserver } from '@/hooks/useNarrowLayoutObserver';
import { isAdminOrManager } from '@/utils/roleAccess';
import type { ProjectDetailsPanelProps } from '@/pages/Projects/list/components/projectDetailsPanel.types';
import { groupAssignmentsByDepartment } from '@/pages/Projects/list/components/projectDetailsPanel.utils';
import { useProjectDetailsEditingState } from '@/pages/Projects/list/hooks/useProjectDetailsEditingState';
import { useAddAssignmentRoleSearch } from '@/pages/Projects/list/hooks/useAddAssignmentRoleSearch';
import { useAssignmentWeekGridEditing } from '@/pages/Projects/list/hooks/useAssignmentWeekGridEditing';
import ProjectDetailsHeaderCard from './ProjectDetailsHeaderCard';
import ProjectMetadataFields from './ProjectMetadataFields';
import ProjectAssignmentsColumn from './ProjectAssignmentsColumn';

const ProjectDetailsPanel: React.FC<ProjectDetailsPanelProps> = ({
  project,
  statusDropdownOpen,
  setStatusDropdownOpen,
  onStatusChange,
  onProjectRefetch,
  onDeleteProject,
  assignments,
  editingAssignmentId,
  editData,
  warnings,
  onEditAssignment,
  onDeleteAssignment,
  onSaveEdit,
  onCancelEdit,
  onHoursChange,
  getCurrentWeekHours,
  onChangeAssignmentRole,
  getPersonDepartmentId,
  getPersonDepartmentName,
  currentWeekKey,
  onUpdateWeekHours,
  reloadAssignments,
  invalidateFilterMeta,
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
  departments,
  onSwapPlaceholder,
  candidatesOnly,
  setCandidatesOnly,
  availabilityMap,
  deliverablesSlot,
}) => {
  void warnings;
  void candidatesOnly;
  void setCandidatesOnly;
  void availabilityMap;

  const auth = useAuth();
  const { state: verticalState } = useVerticalFilter();
  const { verticals, isLoading: verticalsLoading } = useVerticals({ includeInactive: true });
  const canEdit = !!auth?.accessToken;
  const canEditAutoHoursTemplate = canEdit && isAdminOrManager(auth?.user);

  const {
    fieldErrors,
    setFieldErrors,
    clearFieldError,
    localPatch,
    currentVerticalId,
    isVerticalMissing,
    commitField,
    autoHoursTemplates,
    autoHoursTemplatesLoading,
    autoHoursTemplatesError,
    selectedAutoHoursTemplateId,
    selectedAutoHoursTemplateName,
    isAutoHoursTemplateMissing,
    promptAndUpdateHours,
  } = useProjectDetailsEditingState({
    project,
    verticals,
    onProjectRefetch,
    reloadAssignments,
    invalidateFilterMeta,
  });

  const {
    addRoles,
    roleMatches,
    isPersonSearchOpen,
    personSearchInputRef,
    personSearchDropdownAbove,
  } = useAddAssignmentRoleSearch({
    addAssignmentState,
    showAddAssignment,
    departments,
    personSearchResultsLength: personSearchResults.length,
    getPersonDepartmentId,
  });

  const {
    weekKeys,
    editingValue,
    optimisticHours,
    isCellSelected,
    isEditingCell,
    onCellSelect,
    onCellMouseDown,
    onCellMouseEnter,
    onEditStartCell,
    onEditSaveCell,
    onEditCancelCell,
    onEditValueChangeCell,
  } = useAssignmentWeekGridEditing({
    assignments,
    currentWeekKey,
    projectId: project.id,
    reloadAssignments,
    invalidateFilterMeta,
  });

  const departmentEntries = React.useMemo(
    () => groupAssignmentsByDepartment(assignments, departments, getPersonDepartmentName),
    [assignments, departments, getPersonDepartmentName]
  );

  const { layoutRef, isNarrowLayout } = useNarrowLayoutObserver(640);

  return (
    <>
      <div className="px-2 py-4 border-b border-[var(--border)]">
        <ProjectDetailsHeaderCard
          project={project}
          localPatch={localPatch}
          canEdit={canEdit}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          clearFieldError={clearFieldError}
          commitField={commitField}
          statusDropdownOpen={statusDropdownOpen}
          setStatusDropdownOpen={setStatusDropdownOpen}
          onStatusChange={onStatusChange}
          onDeleteProject={onDeleteProject}
        />

        <ProjectMetadataFields
          project={project}
          localPatch={localPatch}
          canEdit={canEdit}
          canEditAutoHoursTemplate={canEditAutoHoursTemplate}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          clearFieldError={clearFieldError}
          commitField={commitField}
          currentVerticalId={currentVerticalId}
          isVerticalMissing={isVerticalMissing}
          verticals={verticals as any}
          verticalsLoading={verticalsLoading}
          selectedVerticalId={verticalState.selectedVerticalId ?? null}
          selectedAutoHoursTemplateId={selectedAutoHoursTemplateId}
          selectedAutoHoursTemplateName={selectedAutoHoursTemplateName}
          isAutoHoursTemplateMissing={isAutoHoursTemplateMissing}
          autoHoursTemplates={autoHoursTemplates}
          autoHoursTemplatesLoading={autoHoursTemplatesLoading}
          autoHoursTemplatesError={autoHoursTemplatesError}
          promptAndUpdateHours={promptAndUpdateHours}
        />
      </div>

      <div className="p-4">
        <div
          ref={layoutRef}
          className="grid gap-4 items-start"
          style={{
            gridTemplateColumns: isNarrowLayout ? '1fr' : '2fr 1fr',
            gridTemplateAreas: isNarrowLayout
              ? '"deliverables" "assignments" "notes" "predeliverables"'
              : '"deliverables assignments" "notes assignments" "predeliverables assignments"',
          }}
        >
          <div className="min-w-0" style={{ gridArea: 'deliverables' }}>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-2 overflow-hidden">
              {deliverablesSlot}
            </div>
          </div>

          <ProjectAssignmentsColumn
            isNarrowLayout={isNarrowLayout}
            showAddAssignment={showAddAssignment}
            onAddAssignment={onAddAssignment}
            onSaveAssignment={onSaveAssignment}
            onCancelAddAssignment={onCancelAddAssignment}
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
            addRoles={addRoles as any}
            roleMatches={roleMatches}
            isPersonSearchOpen={isPersonSearchOpen}
            personSearchDropdownAbove={personSearchDropdownAbove}
            personSearchInputRef={personSearchInputRef}
            departmentEntries={departmentEntries}
            editingAssignmentId={editingAssignmentId}
            editData={editData}
            onEditAssignment={onEditAssignment}
            onDeleteAssignment={onDeleteAssignment}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onHoursChange={onHoursChange}
            getCurrentWeekHours={getCurrentWeekHours}
            onChangeAssignmentRole={onChangeAssignmentRole}
            getPersonDepartmentId={getPersonDepartmentId}
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

          <div className="min-w-0" style={{ gridArea: 'notes' }}>
            <ProjectNotesEditor
              projectId={project.id!}
              initialJson={(project as any).notesJson as any}
              initialHtml={(localPatch as any).notes ?? (project as any).notes}
              canEdit={canEdit}
            />
          </div>

          <div className="min-w-0" style={{ gridArea: 'predeliverables' }}>
            <ProjectPreDeliverableSettings projectId={project.id || null} />
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectDetailsPanel;
