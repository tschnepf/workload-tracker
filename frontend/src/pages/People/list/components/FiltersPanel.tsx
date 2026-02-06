import React from 'react';
import type { Department } from '@/types/models';

export interface FiltersPanelProps {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  departments: Department[];
  locations: string[];
  departmentFilter: string[];
  setDepartmentFilter: React.Dispatch<React.SetStateAction<string[]>>;
  locationFilter: string[];
  setLocationFilter: React.Dispatch<React.SetStateAction<string[]>>;
  showDepartmentDropdown: boolean;
  setShowDepartmentDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  showLocationDropdown: boolean;
  setShowLocationDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  showInactive: boolean;
  setShowInactive: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function FiltersPanel(props: FiltersPanelProps) {
  const {
    searchTerm,
    setSearchTerm,
    departments,
    locations,
    departmentFilter,
    setDepartmentFilter,
    locationFilter,
    setLocationFilter,
    showDepartmentDropdown,
    setShowDepartmentDropdown,
    showLocationDropdown,
    setShowLocationDropdown,
    showInactive,
    setShowInactive,
  } = props;

  const getLocationOptions = () => {
    const unique = new Set<string>();
    const remoteLocations = new Set<string>();
    locations.forEach((loc) => {
      const location = (loc || '').trim();
      if (!location) return;
      if (location.toLowerCase().includes('remote')) {
        unique.add('Remote');
        remoteLocations.add(location);
      } else {
        unique.add(location);
      }
    });
    return Array.from(unique)
      .map((location) => ({
        location,
        isConsolidated: location === 'Remote' && remoteLocations.size > 1,
      }))
      .sort((a, b) => a.location.localeCompare(b.location));
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search people (name, role, department, location, notes)"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
      />

      {/* Department Multi-Select Filter */}
      <div className="department-filter relative">
        <div
          onClick={() => setShowDepartmentDropdown(!showDepartmentDropdown)}
          className="w-full px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] min-h-[32px] flex flex-wrap items-center gap-1 cursor-pointer hover:border-[var(--focus)] focus:border-[var(--focus)]"
        >
          {departmentFilter.length === 0 ? (
            <span className="text-[var(--muted)]">All Departments</span>
          ) : (
            <>
              {departmentFilter.map((deptId, index) => {
                const department = departments.find(d => d.id?.toString() === deptId);
                const displayName = deptId === 'unassigned' ? 'Not Assigned' : department?.name || 'Unknown';
                return (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--surfaceHover)] text-[var(--text)] rounded text-xs border border-[var(--primary)]"
                  >
                    {displayName}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDepartmentFilter(prev => prev.filter(d => d !== deptId));
                      }}
                      className="hover:text-[var(--primary)] hover:bg-[var(--surfaceHover)] rounded-full w-3 h-3 flex items-center justify-center"
                      aria-label={`Remove ${displayName}`}
                      title={`Remove ${displayName}`}
                    >
                      <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                  </span>
                );
              })}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDepartmentFilter([]);
                }}
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] ml-1"
              >
                Clear All
              </button>
            </>
          )}
          <svg className="ml-auto w-4 h-4 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>

        {/* Department Options Dropdown */}
        {showDepartmentDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-40 max-h-40 overflow-y-auto">
            <button
              onClick={() => {
                if (!departmentFilter.includes('unassigned')) {
                  setDepartmentFilter(prev => [...prev, 'unassigned']);
                }
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors ${
                departmentFilter.includes('unassigned') ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
              }`}
              disabled={departmentFilter.includes('unassigned')}
            >
              Not Assigned
            </button>
            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => {
                  const deptId = dept.id?.toString() || '';
                  if (!departmentFilter.includes(deptId)) {
                    setDepartmentFilter(prev => [...prev, deptId]);
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors ${
                  departmentFilter.includes(dept.id?.toString() || '') ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
                }`}
                disabled={departmentFilter.includes(dept.id?.toString() || '')}
              >
                {dept.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Location Multi-Select Filter */}
      <div className="location-filter relative">
        <div
          onClick={() => setShowLocationDropdown(!showLocationDropdown)}
          className="w-full px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] min-h-[32px] flex flex-wrap items-center gap-1 cursor-pointer hover:border-[var(--focus)] focus:border-[var(--focus)]"
        >
          {locationFilter.length === 0 ? (
            <span className="text-[var(--muted)]">All Locations</span>
          ) : (
            <>
              {locationFilter.map((location, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--surfaceHover)] text-[var(--text)] rounded text-xs border border-[var(--primary)]"
                >
                  {location}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocationFilter(prev => prev.filter(l => l !== location));
                      }}
                    className="hover:text-[var(--primary)] hover:bg-[var(--surfaceHover)] rounded-full w-3 h-3 flex items-center justify-center"
                    aria-label={`Remove ${location}`}
                    title={`Remove ${location}`}
                    >
                      <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                </span>
              ))}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocationFilter([]);
                }}
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] ml-1"
              >
                Clear All
              </button>
            </>
          )}
          <svg className="ml-auto w-4 h-4 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>

        {/* Location Options Dropdown */}
        {showLocationDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-40 max-h-40 overflow-y-auto">
            <button
              onClick={() => {
                if (!locationFilter.includes('unspecified')) {
                  setLocationFilter(prev => [...prev, 'unspecified']);
                }
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors ${
                locationFilter.includes('unspecified') ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
              }`}
              disabled={locationFilter.includes('unspecified')}
            >
              Not Specified
            </button>
            {getLocationOptions().map(({ location, isConsolidated }) => (
              <button
                key={location}
                onClick={() => {
                  if (!locationFilter.includes(location)) {
                    setLocationFilter(prev => [...prev, location]);
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors ${
                  locationFilter.includes(location) ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
                }`}
                disabled={locationFilter.includes(location)}
              >
                {location}
                {isConsolidated && (
                  <span className="text-xs opacity-75 ml-1">- includes all remote</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status Filter (themed checkbox) */}
      <label htmlFor="showInactive" className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          id="showInactive"
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive((e.target as HTMLInputElement).checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="inline-flex w-4 h-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--focus)] peer-checked:bg-[var(--primary)] peer-checked:border-[var(--primary)]"
        >
          <svg className="w-3 h-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span className="text-sm text-[var(--text)]">Show Inactive</span>
      </label>
    </div>
  );
}
