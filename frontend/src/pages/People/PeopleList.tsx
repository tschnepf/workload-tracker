/**
 * People List - Split-panel layout following ProjectsList.tsx pattern
 * Left panel: People list with filtering
 * Right panel: Person details with skills management
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Link } from 'react-router';
import { Person, Department, Role } from '@/types/models';
import { peopleApi, rolesApi } from '@/services/api';
import { useUpdatePerson } from '@/hooks/usePeople';
import { showToast } from '@/lib/toastBus';
import Layout from '@/components/layout/Layout';
// PeopleListTable is used via PeopleListPane
import PersonDetailsContainer from '@/pages/People/list/components/PersonDetailsContainer';
import FiltersPanel from '@/pages/People/list/components/FiltersPanel';
import BulkActionsBar from '@/pages/People/list/components/BulkActionsBar';
import PeopleListPane from '@/pages/People/list/components/PeopleListPane';
import { useBulkActions } from '@/pages/People/list/hooks/useBulkActions';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { usePeopleSearch } from '@/hooks/usePeopleSearch';
import { usePersonSelection } from '@/pages/People/list/hooks/usePersonSelection';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';

const PeopleList: React.FC = () => {
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  const { state: verticalState } = useVerticalFilter();
  const [showInactive, setShowInactive] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]); // Phase 2: Department filter
  const [locations, setLocations] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]); // Phase 1: Role management
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]); // Multi-select department filter
  const [locationFilter, setLocationFilter] = useState<string[]>([]); // Multi-select location filter
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'location' | 'department' | 'weeklyCapacity' | 'role'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [error, setError] = useState<string | null>(null);
  // Centralized toasts via toast bus
  const updatePersonMutation = useUpdatePerson();
  // Global department filter (top bar)
  const { state: deptState } = useDepartmentFilter();
  
  // Bulk actions state
  const { bulkMode, setBulkMode, selectedPeopleIds, setSelectedPeopleIds, bulkDepartment, setBulkDepartment } = useBulkActions();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  
  // Role autocomplete state (reserved for future enhancement)
  const [showRoleAutocomplete, setShowRoleAutocomplete] = useState(false);
  const [roleInputValue, setRoleInputValue] = useState('');
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(-1);

  // Roles are now loaded from API instead of hardcoded

  useAuthenticatedEffect(() => {
    loadRoles(); // Phase 1: Load roles for dropdowns
  }, []);

  // Phase 1: Load roles for dropdown
  const loadRoles = async () => {
    try {
      const page = await rolesApi.list();
      setRoles(page.results || []);
    } catch (err) {
      console.error('Error loading roles:', err);
    }
  };

  // Right-panel effects moved into PersonDetailsContainer

  const loadFiltersMetadata = async () => {
    try {
      const res = await peopleApi.filtersMetadata({
        vertical: verticalState.selectedVerticalId ?? undefined,
        include_inactive: showInactive ? 1 : undefined,
      });
      setDepartments(res.departments || []);
      setLocations(res.locations || []);
    } catch (err) {
      console.error('Error loading people filter metadata:', err);
    }
  };

  useAuthenticatedEffect(() => {
    loadFiltersMetadata();
  }, [showInactive, verticalState.selectedVerticalId]);

  useEffect(() => {
    if (deptState.filters.length > 0) {
      setDepartmentFilter([]);
    }
  }, [deptState.filters]);

  const orderingParam = useMemo(() => {
    const key = sortBy;
    const dir = sortDirection === 'desc' ? '-' : '';
    return `${dir}${key}`;
  }, [sortBy, sortDirection]);

  const globalDepartmentFilters = useMemo(() => (deptState.filters ?? [])
    .map((f) => ({ departmentId: Number(f.departmentId), op: f.op }))
    .filter((f) => Number.isFinite(f.departmentId) && f.departmentId > 0), [deptState.filters]);

  const localDepartmentFilters = useMemo(() => {
    return departmentFilter
      .map((id) => {
        if (id === 'unassigned') {
          return { departmentId: 0, op: 'or' as const };
        }
        return { departmentId: Number(id), op: 'or' as const };
      })
      .filter((f) => Number.isFinite(f.departmentId) && f.departmentId >= 0);
  }, [departmentFilter]);

  const useGlobalDepartment = deptState.filters.length > 0;
  const payloadDepartment =
    useGlobalDepartment && deptState.selectedDepartmentId != null
      ? Number(deptState.selectedDepartmentId)
      : undefined;
  const payloadIncludeChildren: 0 | 1 | undefined =
    useGlobalDepartment && deptState.selectedDepartmentId != null
      ? (deptState.includeChildren ? 1 : 0)
      : undefined;
  const payloadDepartmentFilters =
    useGlobalDepartment && deptState.selectedDepartmentId == null
      ? globalDepartmentFilters
      : (!useGlobalDepartment ? localDepartmentFilters : []);

  const peopleSearchOptions = useMemo(() => ({
    includeInactive: showInactive,
    searchTerm,
    department: payloadDepartment,
    includeChildren: payloadIncludeChildren,
    departmentFilters: payloadDepartmentFilters,
    location: locationFilter.length ? locationFilter : undefined,
    ordering: orderingParam,
    vertical: verticalState.selectedVerticalId ?? undefined,
  }), [
    showInactive,
    searchTerm,
    payloadDepartment,
    payloadIncludeChildren,
    payloadDepartmentFilters,
    locationFilter,
    orderingParam,
    verticalState.selectedVerticalId,
  ]);

  const {
    people,
    loading: listLoading,
    error: listError,
    fetchNextPage,
    hasNextPage,
  } = usePeopleSearch(peopleSearchOptions);

  const { selectedPerson, selectedIndex, onRowClick, setSelectedPerson, setSelectedIndex, selectByIndex } = usePersonSelection(people);

  const handleColumnSort = (column: 'name' | 'location' | 'department' | 'weeklyCapacity' | 'role') => {
    if (sortBy === column) {
      // Toggle direction if clicking the same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and reset to ascending
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  // Bulk assign department to selected people
  const handleBulkAssignment = async () => {
    if (!bulkDepartment || selectedPeopleIds.size === 0) return;

    try {
      setError(null);
      const departmentName =
        bulkDepartment === 'unassigned'
          ? ''
          : departments.find((d) => d.id?.toString() === bulkDepartment)?.name || '';

      const updatePromises = Array.from(selectedPeopleIds).map((personId) => {
        const updateData = {
          department: bulkDepartment === 'unassigned' ? null : parseInt(bulkDepartment),
          departmentName,
        } as Partial<Person>;
        return updatePersonMutation.mutateAsync({ id: personId, data: updateData });
      });

      await Promise.all(updatePromises);
      await loadFiltersMetadata();

      const count = selectedPeopleIds.size;
      setSelectedPeopleIds(new Set());
      setBulkDepartment('');

      const departmentLabel =
        bulkDepartment === 'unassigned'
          ? 'removed from departments'
          : departmentName || 'unknown department';

      showToast(`Updated ${count} people (${departmentLabel})`, 'success');
    } catch (err: any) {
      setError(`Failed to update department assignments: ${err.message}`);
      showToast('Failed to update assignments', 'error');
    }
  };

  // Sortable column header component
  const SortableHeader = ({ column, children, className = "" }: { 
    column: 'name' | 'location' | 'department' | 'weeklyCapacity' | 'role';
    children: React.ReactNode; 
    className?: string;
  }) => (
    <button
      onClick={() => handleColumnSort(column)}
      className={`flex items-center gap-1 text-left hover:text-[var(--text)] transition-colors ${className}`}
    >
      {children}
      {sortBy === column && (
        <svg 
          className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      )}
    </button>
  );

  // Server-side filtering + ordering
  const visiblePeople = people;

  // Auto-select first person from filtered list
  useEffect(() => {
    if (visiblePeople.length > 0 && !selectedPerson) {
      setSelectedPerson(visiblePeople[0]);
      setSelectedIndex(0);
    }
  }, [visiblePeople, selectedPerson]);

  const loadingContent = (
    <div className="h-full min-h-0 flex items-center justify-center">
      <div className="text-[var(--muted)]">Loading people...</div>
    </div>
  );

  const desktopView = (
      <div className="h-full min-h-0 flex bg-[var(--bg)]">
        
        {/* Left Panel - People List */}
        <div className="w-1/2 border-r border-[var(--border)] flex flex-col min-w-0 min-h-0 overflow-y-auto">
          
          {/* Header */}
          <div className="p-3 border-b border-[var(--border)]">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-lg font-semibold text-[var(--text)]">People</h1>
              <Link to="/people/new">
                <button className="px-2 py-0.5 text-xs rounded border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] hover:text-[var(--text)] transition-colors">
                  + New
                </button>
              </Link>
            </div>

            {/* Search and Filters */}
            <FiltersPanel
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              departments={departments}
              locations={locations}
              departmentFilter={departmentFilter}
              setDepartmentFilter={setDepartmentFilter}
              locationFilter={locationFilter}
              setLocationFilter={setLocationFilter}
              showDepartmentDropdown={showDepartmentDropdown}
              setShowDepartmentDropdown={setShowDepartmentDropdown}
              showLocationDropdown={showLocationDropdown}
              setShowLocationDropdown={setShowLocationDropdown}
              showInactive={showInactive}
              setShowInactive={setShowInactive}
            />
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={() => {
                  setBulkMode(!bulkMode);
                  setSelectedPeopleIds(new Set());
                }}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  bulkMode
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                }`}
              >
                {bulkMode ? 'Exit Bulk Mode' : 'Bulk Actions'}
              </button>
              {bulkMode && selectedPeopleIds.size > 0 && (
                <span className="text-xs text-[var(--muted)]">{selectedPeopleIds.size} selected</span>
              )}
            </div>
            </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border-b border-red-500/50">
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          )}

          {/* People List */}
          <PeopleListPane
            items={visiblePeople}
            bulkMode={bulkMode}
            selectedPersonId={selectedPerson?.id ?? null}
            selectedPeopleIds={selectedPeopleIds}
            onRowClick={onRowClick}
            onArrowKey={(dir) => {
              if (!visiblePeople.length) return;
              if (selectedIndex < 0) {
                onRowClick(visiblePeople[0], 0);
                return;
              }
              const delta = dir === 'down' ? 1 : -1;
              const nextIndex = Math.max(0, Math.min(
                visiblePeople.length - 1,
                selectedIndex + delta
              ));
              if (nextIndex !== selectedIndex) {
                const nextPerson = visiblePeople[nextIndex];
                onRowClick(nextPerson, nextIndex);
              }
            }}
            onToggleSelect={(id, checked) => {
              const next = new Set(selectedPeopleIds);
              if (checked) next.add(id); else next.delete(id);
              setSelectedPeopleIds(next);
            }}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onColumnSort={handleColumnSort}
            hasMore={!!hasNextPage}
            onLoadMore={() => fetchNextPage()}
          />
          
          <BulkActionsBar
            visible={bulkMode && selectedPeopleIds.size > 0}
            selectedCount={selectedPeopleIds.size}
            departments={departments}
            bulkDepartment={bulkDepartment}
            setBulkDepartment={setBulkDepartment}
            onApply={handleBulkAssignment}
            onClear={() => setSelectedPeopleIds(new Set())}
          />
        </div>

        {/* Right Panel - Person Details */}
        <div className="w-1/2 flex flex-col bg-[var(--card)] min-w-0 min-h-0 overflow-y-auto">
          {listLoading ? (
            <div className="p-4 space-y-3">
              <div className="w-full h-5 bg-[var(--surface)] animate-pulse rounded" />
              <div className="w-full h-5 bg-[var(--surface)] animate-pulse rounded" />
              <div className="w-full h-5 bg-[var(--surface)] animate-pulse rounded" />
              <div className="w-full h-5 bg-[var(--surface)] animate-pulse rounded" />
            </div>
          ) : selectedPerson ? (
            <>
            <PersonDetailsContainer person={selectedPerson} roles={roles} departments={departments} people={people} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-[var(--muted)]">
                <div className="text-lg mb-2">Select a person</div>
                <div className="text-sm">Choose a person from the list to view details</div>
              </div>
            </div>
          )}
        </div>
      </div>
  );

  const mobileView = (
      <div className="h-full min-h-0 flex flex-col bg-[var(--bg)]">
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {listLoading ? (
            loadingContent
          ) : (
            <>
              {/* Mobile header */}
              <div className="p-3 border-b border-[var(--border)] bg-[var(--bg)]">
                <div className="flex items-center justify-between mb-2">
                  <h1 className="text-lg font-semibold text-[var(--text)]">People</h1>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onClick={() => {
                        setBulkMode(!bulkMode);
                        if (!bulkMode) {
                          setSelectedPeopleIds(new Set());
                        }
                      }}
                    >
                      {bulkMode ? 'Done' : 'Bulk'}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onClick={() => setShowDepartmentDropdown(true)}
                    >
                      Filters
                    </button>
                    <Link to="/people/new">
                      <button className="px-2 py-1 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white">
                        + New
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Keep search + filter controls wired to same state; dropdowns already render as overlays */}
                <FiltersPanel
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  departments={departments}
                  locations={locations}
                  departmentFilter={departmentFilter}
                  setDepartmentFilter={setDepartmentFilter}
                  locationFilter={locationFilter}
                  setLocationFilter={setLocationFilter}
                  showDepartmentDropdown={showDepartmentDropdown}
                  setShowDepartmentDropdown={setShowDepartmentDropdown}
                  showLocationDropdown={showLocationDropdown}
                  setShowLocationDropdown={setShowLocationDropdown}
                  showInactive={showInactive}
                  setShowInactive={setShowInactive}
                />
              </div>

              {/* List as mobile-friendly cards */}
              <div className="divide-y divide-[var(--border)]">
                {visiblePeople.map((person, index) => {
                  const isSelected = selectedPerson?.id === person.id;
                  const isChecked = selectedPeopleIds.has(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className={`w-full text-left px-3 py-3 bg-[var(--card)] flex items-center justify-between gap-3 ${
                        isSelected ? 'ring-1 ring-[var(--primary)]' : ''
                      }`}
                      onClick={() => {
                        onRowClick(person, index);
                        setMobileDetailOpen(true);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text)] truncate">{person.name}</div>
                        <div className="text-xs text-[var(--muted)] truncate">
                          {person.roleName || 'No role'} · {person.departmentName || 'No department'}
                        </div>
                        {person.location && (
                          <div className="text-xs text-[var(--muted)] truncate">{person.location}</div>
                        )}
                      </div>
                      {bulkMode && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = new Set(selectedPeopleIds);
                            if (e.target.checked) {
                              next.add(person.id);
                            } else {
                              next.delete(person.id);
                            }
                            setSelectedPeopleIds(next);
                          }}
                          className="w-4 h-4"
                          aria-label={`Select ${person.name}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {hasNextPage && (
                <div className="p-3 flex justify-center">
                  <button
                    type="button"
                    className="px-3 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
                    onClick={() => fetchNextPage()}
                  >
                    Load more
                  </button>
                </div>
              )}

              {bulkMode && selectedPeopleIds.size > 0 && (
                <BulkActionsBar
                  visible={true}
                  selectedCount={selectedPeopleIds.size}
                  departments={departments}
                  bulkDepartment={bulkDepartment}
                  setBulkDepartment={setBulkDepartment}
                  onApply={handleBulkAssignment}
                  onClear={() => setSelectedPeopleIds(new Set())}
                />
              )}
            </>
          )}
        </div>
      </div>
  );

  return (
    <Layout>
      {listLoading && !isMobileLayout ? loadingContent : isMobileLayout ? mobileView : desktopView}
      {/* Mobile slide-over for person details */}
      <MobilePersonDetailsDrawer
        open={isMobileLayout && mobileDetailOpen && !!selectedPerson}
        title={selectedPerson?.name || 'Person details'}
        onClose={() => setMobileDetailOpen(false)}
      >
        {selectedPerson && (
          <PersonDetailsContainer person={selectedPerson} roles={roles} departments={departments} people={people} />
        )}
      </MobilePersonDetailsDrawer>
      {/* Toasts are shown globally via ToastHost */}
    </Layout>
  );
};

export default PeopleList;

const MobilePersonDetailsDrawer: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1150] bg-black/60 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">{title}</div>
          <button
            type="button"
            className="text-xl text-[var(--muted)]"
            onClick={onClose}
            aria-label="Close person details"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
};
