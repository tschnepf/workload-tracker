/**
 * People List - Split-panel layout following ProjectsList.tsx pattern
 * Left panel: People list with filtering
 * Right panel: Person details with skills management
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Link } from 'react-router';
import { Person, Department, Role } from '@/types/models';
import { departmentsApi, rolesApi } from '@/services/api';
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
import { usePeopleQueryPagination } from '@/pages/People/list/hooks/usePeopleQueryPagination';
import { usePersonSelection } from '@/pages/People/list/hooks/usePersonSelection';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const PeopleList: React.FC = () => {
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  const [showInactive, setShowInactive] = useState(false);
  const { people, loading: listLoading, error: listError, fetchNextPage, hasNextPage } = usePeopleQueryPagination(showInactive);
  const [departments, setDepartments] = useState<Department[]>([]); // Phase 2: Department filter
  const [roles, setRoles] = useState<Role[]>([]); // Phase 1: Role management
  const { selectedPerson, selectedIndex, onRowClick, setSelectedPerson, setSelectedIndex, selectByIndex } = usePersonSelection(people);
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
    loadDepartments(); // Phase 2: Load departments for filter
    loadRoles(); // Phase 1: Load roles for dropdowns
  }, []);

  // Phase 2: Load departments for filter dropdown
  const loadDepartments = async () => {
    try {
      const page = await departmentsApi.list({ page: 1, page_size: 500 });
      setDepartments(page.results || []);
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

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

  // Mirror global department selection into local People list filter
  useEffect(() => {
    const id = deptState.selectedDepartmentId;
    if (id == null) {
      setDepartmentFilter([]);
    } else {
      setDepartmentFilter([String(id)]);
    }
  }, [deptState.selectedDepartmentId]);

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
      await loadDepartments();

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

  // Filter and sort people
  const filteredAndSortedPeople = people
    .filter(person => {
      // Enhanced search filter (includes notes/description + location search)
      const matchesSearch = !searchTerm ||
        person.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.roleName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.departmentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.notes?.toLowerCase().includes(searchTerm.toLowerCase());

      // Department filter - Multi-select
      const matchesDepartment = departmentFilter.length === 0 ||
        departmentFilter.includes(person.department?.toString() || '') ||
        (departmentFilter.includes('unassigned') && !person.department);

      // Location filter - Multi-select with special Remote handling
      const matchesLocation = locationFilter.length === 0 ||
        locationFilter.some(filterLocation => {
          const personLocation = person.location?.trim() || '';

          // Special case: "Remote" filter includes any location containing "remote" (case-insensitive)
          if (filterLocation === 'Remote') {
            return personLocation.toLowerCase().includes('remote');
          }

          // All other filters use exact matching
          return filterLocation === personLocation;
        }) ||
        (locationFilter.includes('unspecified') && (!person.location || person.location.trim() === ''));

      // Status filter: hide inactive unless explicitly shown
      const matchesStatus = showInactive ? true : (person.isActive !== false);

      return matchesSearch && matchesDepartment && matchesLocation && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'location':
          const aLoc = a.location?.trim() || 'zzz_unspecified'; // Put unspecified at end
          const bLoc = b.location?.trim() || 'zzz_unspecified';
          comparison = aLoc.localeCompare(bLoc);
          break;
        case 'department':
          const aDept = a.departmentName || 'zzz_unassigned';
          const bDept = b.departmentName || 'zzz_unassigned';
          comparison = aDept.localeCompare(bDept);
          break;
        case 'weeklyCapacity':
          comparison = (a.weeklyCapacity || 0) - (b.weeklyCapacity || 0);
          break;
        case 'role':
          const aRole = a.roleName || 'zzz_no_role';
          const bRole = b.roleName || 'zzz_no_role';
          comparison = aRole.localeCompare(bRole);
          break;
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Auto-select first person from filtered list
  useEffect(() => {
    if (filteredAndSortedPeople.length > 0 && !selectedPerson) {
      setSelectedPerson(filteredAndSortedPeople[0]);
      setSelectedIndex(0);
    }
  }, [filteredAndSortedPeople, selectedPerson]);

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
              people={people}
              departments={departments}
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
            items={filteredAndSortedPeople}
            bulkMode={bulkMode}
            selectedPersonId={selectedPerson?.id ?? null}
            selectedPeopleIds={selectedPeopleIds}
            onRowClick={onRowClick}
            onArrowKey={(dir) => {
              if (!filteredAndSortedPeople.length) return;
              if (selectedIndex < 0) {
                onRowClick(filteredAndSortedPeople[0], 0);
                return;
              }
              const delta = dir === 'down' ? 1 : -1;
              const nextIndex = Math.max(0, Math.min(
                filteredAndSortedPeople.length - 1,
                selectedIndex + delta
              ));
              if (nextIndex !== selectedIndex) {
                const nextPerson = filteredAndSortedPeople[nextIndex];
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
                  people={people}
                  departments={departments}
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
                {filteredAndSortedPeople.map((person, index) => {
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
