/**
 * Assignment Grid - Real implementation of the spreadsheet-like assignment interface
 * Replaces the form-based AssignmentForm with a modern grid view
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { useQueryClient } from '@tanstack/react-query';
import { Assignment, Person, Deliverable, Project } from '@/types/models';
import { assignmentsApi, peopleApi, deliverablesApi, projectsApi, jobsApi } from '@/services/api';
import { useCapabilities } from '@/hooks/useCapabilities';
import StatusBadge, { editableStatusOptions } from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import { useProjectStatusSubscription } from '@/components/projects/useProjectStatusSubscription';

// Enhanced project interface with loading states for status operations
interface ProjectWithState extends Project {
  isUpdating?: boolean;
  lastUpdated?: number;
}
import Layout from '@/components/layout/Layout';
import { useGridUrlState } from '@/pages/Assignments/grid/useGridUrlState';
import { toWeekHeader } from '@/pages/Assignments/grid/utils';
import Toast from '@/components/ui/Toast';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useUpdateProject } from '@/hooks/useProjects';
import GlobalDepartmentFilter from '@/components/filters/GlobalDepartmentFilter';

// Deliverable coloring (shared with calendar/project grid)
const deliverableTypeColors: Record<string, string> = {
  bulletin: '#3b82f6',
  cd: '#fb923c',
  dd: '#818cf8',
  ifc: '#06b6d4',
  ifp: '#f472b6',
  masterplan: '#a78bfa',
  sd: '#f59e0b',
  milestone: '#64748b',
};

function classifyDeliverableType(input?: string | null): string {
  const t = (input || '').toLowerCase();
  if (/(\b)bulletin(\b)/.test(t)) return 'bulletin';
  if (/(\b)cd(\b)/.test(t)) return 'cd';
  if (/(\b)dd(\b)/.test(t)) return 'dd';
  if (/(\b)ifc(\b)/.test(t)) return 'ifc';
  if (/(\b)ifp(\b)/.test(t)) return 'ifp';
  if (/(master ?plan)/.test(t)) return 'masterplan';
  if (/(\b)sd(\b)/.test(t)) return 'sd';
  return 'milestone';
}

interface PersonWithAssignments extends Person {
  assignments: Assignment[];
  isExpanded: boolean;
}

// Memoized Assignment Row Component for performance optimization
interface AssignmentRowProps {
  assignment: Assignment;
  projectsById: Map<number, ProjectWithState>;
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
}

const AssignmentRow = React.memo<AssignmentRowProps>(({
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
  gridTemplate
}) => {
  const isSelected = (week: string) => {
    // Selected range (multi-select)
    const inMulti = selectedCells.some(cell =>
      cell.personId === personId &&
      cell.assignmentId === assignment.id &&
      cell.week === week
    );
    // Single selected cell (keyboard/click without shift)
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

  const project = projectsById.get(assignment.project);
  const clientName = project?.client || '';
  const projectName = assignment.projectDisplayName || project?.name || '';

  return (
    <div className="grid gap-px p-1 bg-[#252526] hover:bg-[#2d2d30] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
      {/* Client Name Column */}
      <div className="flex items-center py-1 pl-[60px] pr-2">
        <div className="min-w-0 flex-1">
          <div className="text-[#969696] text-xs truncate" title={clientName}>
            {clientName || '—'}
          </div>
        </div>
      </div>

      {/* Project Name with Status Column */}
      <div className="flex items-center py-1 pr-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[#cccccc] text-xs truncate flex-1" title={projectName}>
              {projectName}
            </div>

            {/* Editable Status Badge with Dropdown */}
            <div className="relative flex-shrink-0">
              {/* Use per-assignment dropdown key so only the clicked row opens */}
              {(() => {
                const dropdownKey = `${assignment.id}:${assignment.project}`;
                return (
                  <>
                    <StatusBadge
                      status={getProjectStatus(assignment.project)}
                      variant="editable"
                      onClick={() => assignment.project && statusDropdown.toggle(dropdownKey)}
                      isUpdating={assignment.project && projectStatus.isUpdating(assignment.project)}
                    />
                    {assignment.project && (
                      <StatusDropdown
                        currentStatus={getProjectStatus(assignment.project)}
                        isOpen={statusDropdown.isOpen(dropdownKey)}
                        onSelect={(newStatus) => onStatusChange(assignment.project, newStatus)}
                        onClose={statusDropdown.close}
                        projectId={assignment.project}
                        disabled={projectStatus.isUpdating(assignment.project)}
                        closeOnSelect={false}
                      />
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Remove Assignment Button */}
      <div className="flex items-center justify-center">
        <button 
          onClick={() => onRemoveAssignment(assignment.id)}
          className="w-4 h-4 flex items-center justify-center text-[#969696] hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
          title="Remove assignment"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Week cells */}
      {mondays.map((monday) => {
        const isCurrentEditing = isEditing(monday.date);
        const isCurrentSelected = isSelected(monday.date);
        const currentHours = assignment.weeklyHours?.[monday.date] || 0;
        const deliverablesForWeek = assignment.project ? getDeliverablesForProjectWeek(assignment.project, monday.date) : [];
        // Build deduped entries for vertical bars (prefer entries with percentage per type)
        const deliverableBarEntries: { type: string; percentage?: number }[] = (() => {
          const map: { type: string; percentage?: number }[] = [];
          const add = (type: string, pct?: number) => {
            const numPct = pct == null ? undefined : Number(pct);
            const existing = map.find(e => e.type === type);
            if (existing) {
              if ((existing.percentage == null) && (numPct != null)) existing.percentage = numPct;
              else if (existing.percentage != null && numPct != null && existing.percentage !== numPct) {
                if (!map.some(e => e.type === type && e.percentage === numPct)) map.push({ type, percentage: numPct });
              }
              return;
            }
            map.push({ type, percentage: numPct });
          };
          (deliverablesForWeek || []).forEach(d => {
            const type = classifyDeliverableType((d as any).description);
            const pct = (d as any).percentage == null ? undefined : Number((d as any).percentage);
            add(type, pct);
          });
          return map;
        })();
        const hasDeliverable = deliverableBarEntries.length > 0;
        const deliverableTooltip = hasDeliverable
          ? deliverablesForWeek
              .map(d => {
                const pct = (d.percentage ?? '') !== '' ? `${d.percentage}% ` : '';
                const desc = d.description || '';
                const notes = d.notes ? ` - ${d.notes}` : '';
                return `${pct}${desc}${notes}`.trim();
              })
              .filter(Boolean)
              .join('\n')
          : undefined;
        
        return (
          <div 
            key={monday.date}
            className={`
              relative cursor-pointer transition-colors border-l border-[#3e3e42]
              ${isCurrentSelected ? 'bg-[#007acc]/20 border-[#007acc]' : 'hover:bg-[#3e3e42]/50'}
            `}
            onClick={(e) => onCellSelect(personId, assignment.id, monday.date, e.shiftKey)}
            onMouseDown={(e) => { e.preventDefault(); onCellMouseDown(personId, assignment.id, monday.date); }}
            onMouseEnter={() => onCellMouseEnter(personId, assignment.id, monday.date)}
            onDoubleClick={() => onEditStart(personId, assignment.id, monday.date, currentHours.toString())}
            title={deliverableTooltip}
          >
            {isCurrentEditing ? (
              <input
                type="number"
                value={editingValue}
                  onChange={(e) => onEditValueChange(e.target.value)}
                  onBlur={onEditSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onEditSave();
                    if (e.key === 'Escape') onEditCancel();
                  }}
                  className="w-full h-8 px-1 text-xs bg-[#1e1e1e] text-[#cccccc] border border-[#007acc] rounded focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] [appearance:textfield]"
                  autoFocus
                />
            ) : (
              <div className="h-8 flex items-center justify-center text-xs text-[#cccccc]">
                {currentHours > 0 ? currentHours : ''}
              </div>
            )}
            {hasDeliverable && (
              <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px] pointer-events-none">
                {deliverableBarEntries.slice(0,3).map((e, idx) => (
                  <div key={idx} className="w-[3px] rounded" style={{ background: deliverableTypeColors[e.type] || '#007acc' }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

// Removed local Monday computation — weeks come from server snapshot only.

const AssignmentGrid: React.FC = () => {
  const queryClient = useQueryClient();
  const { state: deptState, backendParams } = useDepartmentFilter();
  
  // Status dropdown management - single open dropdown per project
  // Use string keys so each assignment instance has its own dropdown instance
  const statusDropdown = useDropdownManager<string>();
  
  // Pub-sub system for cross-component status updates
  const { emitStatusChange } = useProjectStatusSubscription({
    debug: process.env.NODE_ENV === 'development'
  });
  const [people, setPeople] = useState<PersonWithAssignments[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignmentsData, setAssignmentsData] = useState<Assignment[]>([]);
  const [projectsData, setProjectsData] = useState<Project[]>([]);
  // Snapshot/rendering mode and aggregated hours
  const [hoursByPerson, setHoursByPerson] = useState<Record<number, Record<string, number>>>({});
  const [isSnapshotMode, setIsSnapshotMode] = useState<boolean>(false);
  // Weeks header: from grid snapshot when available; fallback to 12 Mondays
  // (state moved up near other snapshot states)
  // On-demand detail loading flags
  const [loadedAssignmentIds, setLoadedAssignmentIds] = useState<Set<number>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  // Grid snapshot aggregation state (declared above)
  
  // Enhanced memoized projectsById map with loading states and type safety
  const projectsById = useMemo(() => {
    const m = new Map<number, ProjectWithState>();
    for (const p of projectsData || []) {
      if (p?.id) {
        m.set(p.id, { ...p, isUpdating: false });
      }
    }
    return m;
  }, [projectsData]);
  
  // Memoized helper function for getting project status with null safety
  const getProjectStatus = useMemo(() => 
    (projectId: number) => projectsById.get(projectId)?.status ?? null
  , [projectsById]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingAssignment, setIsAddingAssignment] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSearchResults, setProjectSearchResults] = useState<Project[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(-1);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const [editingCell, setEditingCell] = useState<{ personId: number, assignmentId: number, week: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{ personId: number, assignmentId: number, week: string } | null>(null);
  const [selectedCells, setSelectedCells] = useState<{ personId: number, assignmentId: number, week: string }[]>([]);
  const [selectionStart, setSelectionStart] = useState<{ personId: number, assignmentId: number, week: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Async job state for snapshot generation
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const [asyncProgress, setAsyncProgress] = useState<number>(0);
  const [asyncMessage, setAsyncMessage] = useState<string | undefined>(undefined);
  const caps = useCapabilities();

  // Column width state for adjustable virtual columns
  // Default widths sized to prevent most client/project name cutoff
  const [clientColumnWidth, setClientColumnWidth] = useState(210); // 1.5x wider for longer client names
  const [projectColumnWidth, setProjectColumnWidth] = useState(300); // 1.5x wider for longer project names
  const [isResizing, setIsResizing] = useState<'client' | 'project' | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Persist column widths (shared with project grid)
  useEffect(() => {
    try {
      const cw = localStorage.getItem('assignGrid:clientColumnWidth');
      const pw = localStorage.getItem('assignGrid:projectColumnWidth');
      if (cw) {
        const n = parseInt(cw, 10); if (!Number.isNaN(n)) setClientColumnWidth(Math.max(80, n));
      }
      if (pw) {
        const n = parseInt(pw, 10); if (!Number.isNaN(n)) setProjectColumnWidth(Math.max(80, n));
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('assignGrid:clientColumnWidth', String(clientColumnWidth)); } catch {}
  }, [clientColumnWidth]);
  useEffect(() => {
    try { localStorage.setItem('assignGrid:projectColumnWidth', String(projectColumnWidth)); } catch {}
  }, [projectColumnWidth]);

  // New multi-select project status filters (aggregate selection)
  const statusFilterOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled', 'active_no_deliverables', 'Show All'] as const;
  type StatusFilter = typeof statusFilterOptions[number];
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<StatusFilter>>(new Set<StatusFilter>(['Show All']));
  
  const formatFilterStatus = (status: StatusFilter) => {
    switch (status) {
      case 'active': return 'Active';
      case 'active_ca': return 'Active AC';
      case 'on_hold': return 'On-Hold';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'active_no_deliverables': return 'Active - No Deliverables';
      case 'Show All': return 'Show All';
      default: return String(status);
    }
  };
  
  const toggleStatusFilter = (status: StatusFilter) => {
    setSelectedStatusFilters(prev => {
      const next = new Set<StatusFilter>(prev);
      if (status === 'Show All') {
        return new Set<StatusFilter>(['Show All']);
      }
      next.delete('Show All');
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      if (next.size === 0) {
        return new Set<StatusFilter>(['Show All']);
      }
      return next;
    });
  };

  // Weeks header: from grid snapshot when available (server weekKeys only)
  const [weeks, setWeeks] = useState<{ date: string; display: string; fullDisplay: string }[]>([]);
  const [weeksHorizon, setWeeksHorizon] = useState<number>(12);
  const url = useGridUrlState();

  // Create dynamic grid template based on column widths
  const gridTemplate = useMemo(() => {
    return `${clientColumnWidth}px ${projectColumnWidth}px 40px repeat(${weeks.length}, 70px)`;
  }, [clientColumnWidth, projectColumnWidth, weeks.length]);

  // Calculate total minimum width
  const totalMinWidth = useMemo(() => {
    return clientColumnWidth + projectColumnWidth + 40 + (weeks.length * 70) + 20; // +20 for gaps/padding
  }, [clientColumnWidth, projectColumnWidth, weeks.length]);

  // Initialize from URL (weeks + view)
  useEffect(() => {
    try {
      url.set('view', 'people');
      const w = url.get('weeks');
      if (w) {
        const n = parseInt(w, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 26) setWeeksHorizon(n);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist weeks in URL
  useEffect(() => { url.set('weeks', String(weeksHorizon)); }, [weeksHorizon]);

  // Measure sticky header height so the week header can offset correctly
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(88);
  useEffect(() => {
    function measure() {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.getBoundingClientRect().height);
      }
    }
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (ro && headerRef.current) ro.observe(headerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (ro && headerRef.current) ro.unobserve(headerRef.current);
    };
  }, []);

  // Error-bounded computation with explicit null/undefined handling
  const computeAllowedProjects = useMemo(() => {
    try {
      // Guard against missing data
      if (!assignmentsData?.length || !projectsData?.length) {
        return { projectHoursSum: new Map(), allowedProjectIds: new Set() };
      }

      const projectHoursSum = new Map<number, number>();
      const projectsWithHours = new Set<number>();
      const activeProjectIds = new Set<number>();

      // Build projectHoursSum with null/undefined safety
      assignmentsData.forEach(assignment => {
        // Skip assignments without valid project reference
        if (!assignment?.project || typeof assignment.project !== 'number') return;
        
        // Parse weeklyHours with null/undefined/string safety
        const weeklyHours = assignment.weeklyHours || {};
        let totalHours = 0;
        
        Object.values(weeklyHours).forEach(hours => {
          const parsedHours = parseFloat(hours?.toString() || '0') || 0;
          totalHours += parsedHours;
        });
        
        const currentSum = projectHoursSum.get(assignment.project) || 0;
        projectHoursSum.set(assignment.project, currentSum + totalHours);
        
        if (totalHours > 0) {
          projectsWithHours.add(assignment.project);
        }
      });

      // Build activeProjectIds with null/undefined safety
      projectsData.forEach(project => {
        if (!project?.id) return;
        
        const isActive = project.isActive === true;
        const hasActiveStatus = ['active', 'active_ca'].includes(project.status?.toLowerCase() || '');
        
        if (isActive || hasActiveStatus) {
          activeProjectIds.add(project.id);
        }
      });

      // Union operation
      const allowedProjectIds = new Set([...projectsWithHours, ...activeProjectIds]);

      return { projectHoursSum, allowedProjectIds };
      
    } catch (error) {
      console.error('Error computing allowed projects:', error);
      // Return safe fallback - show all projects on error
      return { 
        projectHoursSum: new Map(), 
        allowedProjectIds: new Set(projectsData?.map(p => p?.id).filter(Boolean) || [])
      };
    }
  }, [
    // Memoization dependencies (recompute when these change):
    assignmentsData,           // Assignment data array
    projectsData,             // Project data array
    // Note: Department filter state not needed here as data is pre-filtered
  ]);

  const { allowedProjectIds } = computeAllowedProjects;

  // Helper function to determine if a date falls within a given week
  const isDateInWeek = (date: string, weekStart: string): boolean => {
    const deliverableDate = new Date(date);
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekStartDate.getDate() + 6); // Week ends on Sunday
    
    return deliverableDate >= weekStartDate && deliverableDate <= weekEndDate;
  };

  // Get deliverables for a specific project and week
  const getDeliverablesForProjectWeek = (projectId: number, weekStart: string): Deliverable[] => {
    return deliverables.filter(deliverable => 
      deliverable.project === projectId && 
      deliverable.date && 
      isDateInWeek(deliverable.date, weekStart)
    );
  };

  // Smart project search (kept as-is; independent of status filters)
  const searchProjects = (query: string): Project[] => {
    try {
      if (!projectsData?.length) return [];
      
      if (!query?.trim()) {
        return [];
      }

      const searchWords = query.trim().toLowerCase().split(/\s+/);
      
      let results = projectsData.filter(project => {
        // Null/undefined safety for project properties
        const searchableText = [
          project?.name || '',
          project?.client || '',
          project?.projectNumber || ''
        ].join(' ').toLowerCase();
        
        // All search words must be found in the combined searchable text
        return searchWords.every(word => searchableText.includes(word));
      });
      
      return results.slice(0, 8); // Limit results
    } catch (error) {
      console.error('Error in searchProjects:', error);
      return []; // Safe fallback
    }
  };

  // Handle project search input changes
  const handleProjectSearch = (value: string) => {
    setNewProjectName(value);
    const results = searchProjects(value);
    setProjectSearchResults(results);
    setShowProjectDropdown(results.length > 0);
    setSelectedProject(null);
    setSelectedDropdownIndex(-1);
  };

  // Handle project selection from dropdown
  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setNewProjectName(project.name);
    setShowProjectDropdown(false);
    setProjectSearchResults([]);
    setSelectedDropdownIndex(-1);
  };

  // Show toast notification
  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ message, type });
  };

  // Enhanced project status management with discriminated unions and retry logic
  const projectStatus = useProjectStatus({
    getCurrentStatus: (projectId) => projectsById.get(projectId)?.status || null,
    onOptimisticUpdate: (projectId, newStatus, previousStatus) => {
      // Emit status change event for pub-sub system
      emitStatusChange(projectId, previousStatus, newStatus);
      
      // Optimistic update - update projectsData immediately
      setProjectsData(prevProjects => 
        prevProjects.map(project => 
          project.id === projectId 
            ? { ...project, status: newStatus, isUpdating: true }
            : project
        )
      );
      
      // Close the dropdown
      statusDropdown.close();
    },
    onSuccess: (projectId, newStatus) => {
      // Update success - clear updating flag and show success message
      setProjectsData(prevProjects => 
        prevProjects.map(project => 
          project.id === projectId 
            ? { ...project, isUpdating: false, lastUpdated: Date.now() }
            : project
        )
      );

      showToast(
        `Project status updated to ${newStatus.replace('_', ' ').toLowerCase()}`,
        'success'
      );
    },
    onRollback: (projectId, rollbackStatus) => {
      // Rollback optimistic update on error
      setProjectsData(prevProjects => 
        prevProjects.map(project => 
          project.id === projectId 
            ? { ...project, status: rollbackStatus, isUpdating: false }
            : project
        )
      );
    },
    onError: (projectId, error) => {
      showToast(
        `Failed to update project status: ${error}`,
        'error'
      );
    },
    maxRetries: 3,
    retryDelay: 1000
  });

  // Simple wrapper for the enhanced project status hook
  // Status change handler wired from StatusDropdown -> useProjectStatus -> useUpdateProject (API)
  const handleStatusChange = async (projectId: number, newStatus: Project['status']) => {
    const currentProject = projectsById.get(projectId);
    if (!currentProject) return;

    // If status is already the same, just close dropdown
    if (currentProject.status === newStatus) {
      statusDropdown.close();
      return;
    }

    try {
      // Use the enhanced hook which handles all the complexity
      await projectStatus.updateStatus(projectId, newStatus);
    } catch (error) {
      // Error is already handled by the hook callbacks
      console.error('Status update failed:', error);
    }
  };

  // Cell editing functions (placeholders for now - can be enhanced later)
  const startEditing = (personId: number, assignmentId: number, week: string, currentValue: string) => {
    setEditingCell({ personId, assignmentId, week });
    setEditingValue(currentValue);
  };

  // Sanitize hours input (allow decimals, clamp negatives to 0, optional max)
  const sanitizeHours = (val: string | number, max: number = 168): number => {
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!isFinite(n) || isNaN(n)) return 0;
    if (n < 0) return 0;
    return n > max ? max : n;
  };

  // Check if the current selectedCells form a contiguous range within the same assignment
  const isContiguousSelection = (): { ok: boolean; reason?: string } => {
    if (!selectedCells || selectedCells.length <= 1) return { ok: true };

    const allSame = selectedCells.every(
      c => c.personId === selectedCells[0].personId && c.assignmentId === selectedCells[0].assignmentId
    );
    if (!allSame) return { ok: false, reason: 'Selection must be within a single assignment row' };

    // Ensure weeks are contiguous according to the weeks array order
    const weekIndex = (date: string) => weeks.findIndex(w => w.date === date);
    const sorted = [...selectedCells].sort((a, b) => weekIndex(a.week) - weekIndex(b.week));
    const start = weekIndex(sorted[0].week);
    for (let i = 1; i < sorted.length; i++) {
      const expected = start + i;
      if (weekIndex(sorted[i].week) !== expected) {
        return { ok: false, reason: 'Selection must be a contiguous week range' };
      }
    }
    return { ok: true };
  };

  const saveEdit = async () => {
    if (!editingCell) return;

    const numValue = sanitizeHours(editingValue);

    try {
      // Bulk selection path
      if (selectedCells && selectedCells.length > 1) {
        const check = isContiguousSelection();
        if (!check.ok) {
          showToast(check.reason || 'Invalid selection for bulk apply', 'warning');
          setEditingCell(null);
          return;
        }
        await updateMultipleCells(selectedCells, numValue);

        // Mirror to assignmentsData for derived filters
        setAssignmentsData(prev => {
          const map = new Map(prev.map(a => [a.id, a] as const));
          for (const cell of selectedCells) {
            const a = map.get(cell.assignmentId);
            if (a) {
              a.weeklyHours = { ...a.weeklyHours, [cell.week]: numValue };
            }
          }
          return Array.from(map.values());
        });
      } else {
        // Single cell path
        await updateAssignmentHours(
          editingCell.personId,
          editingCell.assignmentId,
          editingCell.week,
          numValue
        );
        setAssignmentsData(prev => prev.map(a =>
          a.id === editingCell.assignmentId
            ? { ...a, weeklyHours: { ...a.weeklyHours, [editingCell.week]: numValue } }
            : a
        ));
      }

      // Move selection to next week (if possible) for smoother entry
      const currentIdx = weeks.findIndex(w => w.date === editingCell.week);
      if (currentIdx >= 0 && currentIdx < weeks.length - 1) {
        const next = { personId: editingCell.personId, assignmentId: editingCell.assignmentId, week: weeks[currentIdx + 1].date };
        setSelectedCell(next);
        setSelectionStart(next);
        setSelectedCells([]);
      }
    } catch (err: any) {
      console.error('Failed to save edit:', err);
      showToast('Failed to save hours: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setEditingCell(null);
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  const handleCellSelection = (personId: number, assignmentId: number, week: string, isShiftClick?: boolean) => {
    const cellKey = { personId, assignmentId, week };
    setSelectedCell(cellKey);
    if (!isShiftClick) {
      setSelectedCells([]);
    }
  };

  // Click + drag selection support within a single assignment row
  const handleCellMouseDown = (personId: number, assignmentId: number, week: string) => {
    const start = { personId, assignmentId, week };
    setSelectionStart(start);
    setSelectedCell(start);
    setSelectedCells([start]);
    setIsDragging(true);
  };

  const handleCellMouseEnter = (personId: number, assignmentId: number, week: string) => {
    if (!isDragging || !selectionStart) return;
    // Constrain drag selection to a single row (same person + assignment)
    if (selectionStart.personId !== personId || selectionStart.assignmentId !== assignmentId) return;

    const startIdx = weeks.findIndex(w => w.date === selectionStart.week);
    const endIdx = weeks.findIndex(w => w.date === week);
    if (startIdx === -1 || endIdx === -1) return;

    const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
    const range: { personId: number; assignmentId: number; week: string }[] = [];
    for (let i = min; i <= max; i++) {
      range.push({ personId, assignmentId, week: weeks[i].date });
    }
    setSelectedCells(range);
    setSelectedCell({ personId, assignmentId, week });
  };


  // Load data on mount and when department filter or weeks horizon changes
  useAuthenticatedEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptState.selectedDepartmentId, deptState.includeChildren, weeksHorizon]);

  // Global keyboard navigation and direct typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if we have a selected cell and we're not in edit mode
      // Also ignore if user is currently adding an assignment (typing in project search)
      if (!selectedCell || editingCell || isAddingAssignment !== null) return;

      const { personId, assignmentId, week } = selectedCell;
      const person = people.find(p => p.id === personId);
      const assignment = person?.assignments.find(a => a.id === assignmentId);
      
      if (!person || !assignment) return;

      const currentWeekIndex = weeks.findIndex(w => w.date === week);

      // Handle direct number typing - should clear existing value and start with new number
      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        // Start editing with the typed character (replaces existing value)
        setEditingCell({ personId, assignmentId, week });
        setEditingValue(e.key); // Start fresh with just the typed character
        return;
      }

      // Handle Enter key - only when NOT in edit mode (edit mode handles its own Enter)
      if (e.key === 'Enter') {
        e.preventDefault();
        // Move to next week (this should only happen when just selecting, not editing)
        if (currentWeekIndex < weeks.length - 1) {
          const nextCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          setSelectedCell(nextCell);
          setSelectionStart(nextCell);
          setSelectedCells([]);
        }
        return;
      }

      // Handle Tab key - move to next cell
      if (e.key === 'Tab') {
        e.preventDefault();
        // Move to next week
        if (currentWeekIndex < weeks.length - 1) {
          const nextCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          setSelectedCell(nextCell);
          setSelectionStart(nextCell);
          setSelectedCells([]);
        }
        return;
      }

      // Handle arrow key navigation
      let newCell = null;
      switch (e.key) {
        case 'ArrowLeft':
          if (currentWeekIndex > 0) {
            newCell = { personId, assignmentId, week: weeks[currentWeekIndex - 1].date };
          }
          break;
        case 'ArrowRight':
          if (currentWeekIndex < weeks.length - 1) {
            newCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          }
          break;
        // Add more navigation logic for up/down arrows if needed
      }

      if (newCell) {
        e.preventDefault();
        
        if (e.shiftKey && selectionStart) {
          // Extend selection
          const startWeekIndex = weeks.findIndex(w => w.date === selectionStart.week);
          const endWeekIndex = weeks.findIndex(w => w.date === newCell.week);
          const [minIndex, maxIndex] = [Math.min(startWeekIndex, endWeekIndex), Math.max(startWeekIndex, endWeekIndex)];
          
          const newSelectedCells = [];
          for (let i = minIndex; i <= maxIndex; i++) {
            newSelectedCells.push({
              personId: selectionStart.personId,
              assignmentId: selectionStart.assignmentId,
              week: weeks[i].date
            });
          }
          setSelectedCells(newSelectedCells);
        } else {
          // Single selection
          setSelectedCells([]);
          setSelectionStart(newCell);
        }
        
        setSelectedCell(newCell);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, editingCell, people, weeks, selectionStart]);

  // Global mouse up handler for drag selection and column resizing
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
      if (isResizing) {
        setIsResizing(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - resizeStartX;
        const newWidth = Math.max(80, resizeStartWidth + deltaX); // Min width of 80px

        if (isResizing === 'client') {
          setClientColumnWidth(newWidth);
        } else if (isResizing === 'project') {
          setProjectColumnWidth(newWidth);
        }
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDragging, isResizing, resizeStartX, resizeStartWidth]);

  // Column resize handlers
  const startColumnResize = (column: 'client' | 'project', e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(column === 'client' ? clientColumnWidth : projectColumnWidth);
  };

  // Use existing department filter state declared near top of component

  const loadData = async () => {
    const pageSize = 100;
    try {
      setLoading(true);
      setError(null);

      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;

      // Heuristic: use async if weeks target > 20 or estimated people count > 400
      const targetWeeks = weeksHorizon;
      let estimatedCount = 0;
      try {
        const headPage = await peopleApi.list({ page: 1, page_size: 1, department: dept, include_children: inc });
        estimatedCount = (headPage as any)?.count ?? 0;
      } catch {}
      const asyncEnabled = caps.data?.asyncJobs ?? false;
      const shouldUseAsync = asyncEnabled && (targetWeeks > 20 || estimatedCount > 400);

      let snapshot: { weekKeys: string[]; people: any[]; hoursByPerson: Record<string, Record<string, number>> };
      if (shouldUseAsync) {
        try {
          const { jobId } = await assignmentsApi.getGridSnapshotAsync({ weeks: targetWeeks, department: dept, include_children: inc });
          setAsyncJobId(jobId);
          setAsyncProgress(0);
          // Manual polling to surface progress
          while (true) {
            const s = await jobsApi.getStatus(jobId);
            setAsyncProgress(s.progress || 0);
            setAsyncMessage(s.message || undefined);
            if (s.state === 'SUCCESS') {
              if (s.result && (s.result as any).weekKeys) {
                snapshot = s.result as any;
              } else {
                throw new Error('Missing result');
              }
              break;
            }
            if (s.state === 'FAILURE') {
              throw new Error(s.error || 'Job failed');
            }
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (e: any) {
          console.warn('Async snapshot failed; falling back to sync path.', e);
          showToast('Async snapshot failed, using sync path', 'warning');
          const resp = await assignmentsApi.getGridSnapshot({ weeks: targetWeeks, department: dept, include_children: inc });
          snapshot = resp as any;
        } finally {
          setAsyncJobId(null);
          setAsyncProgress(0);
          setAsyncMessage(undefined);
        }
      } else {
        snapshot = await assignmentsApi.getGridSnapshot({ weeks: targetWeeks, department: dept, include_children: inc }) as any;
      }

      // Map weekKeys -> weeks state (server authoritative)
      const wk = toWeekHeader(snapshot.weekKeys || []);
      if (wk.length) setWeeks(wk);

      // People list from snapshot (collapsed; assignments empty)
      const peopleWithAssignments: PersonWithAssignments[] = (snapshot.people || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        weeklyCapacity: p.weeklyCapacity,
        department: p.department ?? null,
        assignments: [],
        isExpanded: false,
      })) as PersonWithAssignments[];
      setPeople(peopleWithAssignments);
      setAssignmentsData([]);

      // hoursByPerson map
      const hb: Record<number, Record<string, number>> = {};
      Object.entries(snapshot.hoursByPerson || {}).forEach(([pid, map]) => {
        hb[Number(pid)] = map as Record<string, number>;
      });
      setHoursByPerson(hb);

      // Deliverables + projects for UI
      const [deliverablesPage, projectsPage] = await Promise.all([
        deliverablesApi.list(undefined, { page: 1, page_size: pageSize }),
        projectsApi.list({ page: 1, page_size: pageSize })
      ]);
      setDeliverables(deliverablesPage.results || []);
      setProjects(projectsPage.results || []);
      setProjectsData(projectsPage.results || []);
      setIsSnapshotMode(true);
      // Telemetry breadcrumb
      try {
        trackPerformanceEvent('assignments-grid-load', 1, 'count', {
          mode: 'snapshot',
          weeks: wk.length,
          department: deptState.selectedDepartmentId ?? null,
          include_children: deptState.includeChildren ? 1 : 0,
        });
      } catch {}

    } catch (err: any) {
      console.warn('Grid snapshot unavailable; not using client aggregation.', err);
      setError('Failed to load assignment grid snapshot: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Load a person's assignments once when expanding
  const ensureAssignmentsLoaded = async (personId: number) => {
    if (loadedAssignmentIds.has(personId) || loadingAssignments.has(personId)) return;
    setLoadingAssignments(prev => new Set(prev).add(personId));
    try {
      const rows = await assignmentsApi.byPerson(personId);
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, assignments: rows } : p)));
      setLoadedAssignmentIds(prev => new Set(prev).add(personId));
    } catch (e: any) {
      showToast('Failed to load assignments: ' + (e?.message || 'Unknown error'), 'error');
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, isExpanded: false } : p)));
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(personId); return n; });
    }
  };

  // Manual refresh for a person's assignments on demand
  const refreshPersonAssignments = async (personId: number) => {
    setLoadingAssignments(prev => new Set(prev).add(personId));
    try {
      const rows = await assignmentsApi.byPerson(personId);
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, assignments: rows } : p)));
      setLoadedAssignmentIds(prev => new Set(prev).add(personId));
      // Optional: recompute aggregated totals for this person from refreshed rows
      try {
        setHoursByPerson(prev => {
          const next = { ...prev } as Record<number, Record<string, number>>;
          const totals: Record<string, number> = {};
          for (const wk of weeks.map(w => w.date)) {
            let sum = 0;
            for (const a of rows) {
              const wh = (a as any).weeklyHours || {};
              const v = parseFloat((wh[wk] ?? 0).toString()) || 0;
              sum += v;
            }
            if (sum !== 0) totals[wk] = sum;
          }
          next[personId] = { ...(next[personId] || {}), ...totals };
          return next;
        });
      } catch {}
      showToast('Assignments refreshed', 'success');
    } catch (e: any) {
      showToast('Failed to refresh assignments: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(personId); return n; });
    }
  };

  // Toggle person expansion
  const togglePersonExpanded = (personId: number) => {
    const person = people.find(p => p.id === personId);
    const willExpand = !(person?.isExpanded ?? false);
    setPeople(prev => prev.map(p => (p.id === personId ? { ...p, isExpanded: !p.isExpanded } : p)));
    if (willExpand) {
      void ensureAssignmentsLoaded(personId);
    }
  };

  // Precompute future deliverables per project for filter
  const projectHasFutureDeliverables = useMemo(() => {
    const map = new Map<number, boolean>();
    const now = new Date();
    for (const d of deliverables || []) {
      if (!d?.project || !d?.date) continue;
      const dt = new Date(d.date);
      if (dt >= now) {
        map.set(d.project, true);
      }
    }
    return map;
  }, [deliverables]);

  const matchesStatusFilters = (project: Project | undefined | null): boolean => {
    if (!project) return false;
    if (selectedStatusFilters.has('Show All') || selectedStatusFilters.size === 0) return true;
    const status = (project.status || '').toLowerCase();
    // Base status match
    const baseMatch = Array.from(selectedStatusFilters).some(f => 
      f !== 'Show All' && f !== 'active_no_deliverables' && f === status
    );
    // Active - No Deliverables special case
    const noDeliverablesSelected = selectedStatusFilters.has('active_no_deliverables');
    const noDeliverablesMatch = noDeliverablesSelected && status === 'active' && !projectHasFutureDeliverables.get(project.id!);
    return baseMatch || noDeliverablesMatch;
  };

  // Filter assignments based on multi-select status filters
  const getVisibleAssignments = (assignments: Assignment[]): Assignment[] => {
    try {
      if (!assignments?.length) return [];

      const filteredAssignments = assignments.filter(assignment => {
        const project = assignment?.project ? projectsById.get(assignment.project) : undefined;
        return matchesStatusFilters(project as Project);
      });

      // Sorting is now handled by the backend API (client, then project name).
      return filteredAssignments;
    } catch (error) {
      console.error('Error filtering/sorting assignments:', error);
      return assignments || []; // Safe fallback - show all on error
    }
  };

  // Calculate person total using filtered assignments with null safety
  const calculatePersonTotal = (assignments: Assignment[], week: string): number => {
    try {
      const visibleAssignments = getVisibleAssignments(assignments);
      return visibleAssignments.reduce((sum, assignment) => {
        const hours = parseFloat(assignment?.weeklyHours?.[week]?.toString() || '0') || 0;
        return sum + hours;
      }, 0);
    } catch (error) {
      console.error('Error calculating person total:', error);
      return 0; // Safe fallback
    }
  };

  // Get person's total hours for a specific week (updated to use filtered assignments)
  const getPersonTotalHours = (person: PersonWithAssignments, week: string) => {
    const byWeek = hoursByPerson[person.id!];
    if (byWeek && Object.prototype.hasOwnProperty.call(byWeek, week)) {
      return byWeek[week] || 0;
    }
    return calculatePersonTotal(person.assignments, week);
  };

  // Add new assignment
  const addAssignment = async (personId: number, project: Project) => {
    try {
      const newAssignment = await assignmentsApi.create({
        person: personId,
        project: project.id!,
        weeklyHours: {}
      });
      
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, assignments: [...person.assignments, newAssignment] }
          : person
      ));

      // Show notification about assignment creation and potential overallocation risk
      const person = people.find(p => p.id === personId);
      if (person) {
        const projectCount = person.assignments.length + 1; // Include the new assignment
        
        if (projectCount >= 3) {
          showToast(
            `⚠️ ${person.name} is now assigned to ${projectCount} projects. Monitor workload to avoid overallocation.`,
            'warning'
          );
        } else {
          showToast(
            `✓ ${person.name} successfully assigned to ${project.name}`,
            'success'
          );
        }
      }
      
      setIsAddingAssignment(null);
      setNewProjectName('');
      setSelectedProject(null);
      setProjectSearchResults([]);
      setShowProjectDropdown(false);
      
    } catch (err: any) {
      console.error('Failed to create assignment:', err);
      showToast('Failed to create assignment: ' + err.message, 'error');
    }
  };

  // Remove assignment
  const removeAssignment = async (assignmentId: number, personId: number) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return;
    
    try {
      await assignmentsApi.delete(assignmentId);
      
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, assignments: person.assignments.filter(a => a.id !== assignmentId) }
          : person
      ));
      
    } catch (err: any) {
      console.error('Failed to delete assignment:', err);
      showToast('Failed to delete assignment: ' + err.message, 'error');
    }
  };

  // Update assignment hours
  const updateAssignmentHours = async (personId: number, assignmentId: number, week: string, hours: number) => {
    // Find the assignment to update (for optimistic baseline)
    const person = people.find(p => p.id === personId);
    const assignment = person?.assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    const prevWeeklyHours = { ...assignment.weeklyHours };
    const updatedWeeklyHours = { ...prevWeeklyHours, [week]: hours };

    // Optimistic: update local state immediately
    setPeople(prev => prev.map(p =>
      p.id === personId
        ? {
            ...p,
            assignments: p.assignments.map(a =>
              a.id === assignmentId ? { ...a, weeklyHours: updatedWeeklyHours } : a
            )
          }
        : p
    ));
    setAssignmentsData(prev => prev.map(a =>
      a.id === assignmentId ? { ...a, weeklyHours: updatedWeeklyHours } : a
    ));

    try {
      await assignmentsApi.update(assignmentId, { weeklyHours: updatedWeeklyHours });
      // Invalidate analytics queries so heatmaps/forecasts refresh
      queryClient.invalidateQueries({ queryKey: ['capacityHeatmap'] });
      queryClient.invalidateQueries({ queryKey: ['workloadForecast'] });
    } catch (err: any) {
      // Rollback on error
      setPeople(prev => prev.map(p =>
        p.id === personId
          ? {
              ...p,
              assignments: p.assignments.map(a =>
                a.id === assignmentId ? { ...a, weeklyHours: prevWeeklyHours } : a
              )
            }
          : p
      ));
      setAssignmentsData(prev => prev.map(a =>
        a.id === assignmentId ? { ...a, weeklyHours: prevWeeklyHours } : a
      ));
      console.error('Failed to update assignment hours:', err);
      showToast('Failed to update hours: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  // Helper function to check if a cell is in the selected cells array
  const isCellSelected = (personId: number, assignmentId: number, week: string) => {
    return selectedCells.some(cell => 
      cell.personId === personId && 
      cell.assignmentId === assignmentId && 
      cell.week === week
    );
  };

  // Update multiple cells at once (for bulk editing)
  const updateMultipleCells = async (cells: { personId: number, assignmentId: number, week: string }[], hours: number) => {
    // Group cells by assignment to minimize API calls and to support per-assignment rollback
    const assignmentUpdates = new Map<string, {
      personId: number;
      assignmentId: number;
      weeklyHours: Record<string, number>;
      prevWeeklyHours: Record<string, number>;
    }>();

    cells.forEach(cell => {
      const key = `${cell.personId}-${cell.assignmentId}`;
      if (!assignmentUpdates.has(key)) {
        const person = people.find(p => p.id === cell.personId);
        const assignment = person?.assignments.find(a => a.id === cell.assignmentId);
        if (assignment) {
          assignmentUpdates.set(key, {
            personId: cell.personId,
            assignmentId: cell.assignmentId,
            weeklyHours: { ...assignment.weeklyHours },
            prevWeeklyHours: { ...assignment.weeklyHours }
          });
        }
      }
      const update = assignmentUpdates.get(key);
      if (update) {
        update.weeklyHours[cell.week] = hours;
      }
    });

    const updatesArray = Array.from(assignmentUpdates.values());

    // Optimistic apply all local changes
    setPeople(prev => prev.map(person => {
      const personUpdates = updatesArray.filter(u => u.personId === person.id);
      if (personUpdates.length === 0) return person;
      return {
        ...person,
        assignments: person.assignments.map(assignment => {
          const u = personUpdates.find(x => x.assignmentId === assignment.id);
          return u ? { ...assignment, weeklyHours: u.weeklyHours } : assignment;
        })
      };
    }));
    setAssignmentsData(prev => prev.map(a => {
      const u = updatesArray.find(x => x.assignmentId === a.id);
      return u ? { ...a, weeklyHours: u.weeklyHours } : a;
    }));

    // Update aggregated totals (hoursByPerson) for affected people/weeks
    try {
      const byPersonWeeks = new Map<number, Set<string>>();
      cells.forEach(c => {
        if (!byPersonWeeks.has(c.personId)) byPersonWeeks.set(c.personId, new Set());
        byPersonWeeks.get(c.personId)!.add(c.week);
      });
      const newMap: Record<number, Record<string, number>> = { ...hoursByPerson };
      for (const [pid, weeksSet] of byPersonWeeks.entries()) {
        const person = people.find(p => p.id === pid);
        if (!person) continue;
        if (!newMap[pid]) newMap[pid] = { ...(hoursByPerson[pid] || {}) };
        for (const wk of weeksSet) {
          const total = (person.assignments || []).reduce((sum, a) => {
            const u = updatesArray.find(x => x.assignmentId === a.id && x.personId === pid);
            const wh = u ? u.weeklyHours : a.weeklyHours || {};
            const v = parseFloat((wh?.[wk] as any)?.toString?.() || '0') || 0;
            return sum + v;
          }, 0);
          newMap[pid][wk] = total;
        }
      }
      setHoursByPerson(newMap);
    } catch {}

    // Execute API updates (use bulk endpoint when multiple assignments updated)
    let results: PromiseSettledResult<any>[] = [];
    if (updatesArray.length > 1) {
      try {
        const bulk = await assignmentsApi.bulkUpdateHours(
          updatesArray.map(u => ({ assignmentId: u.assignmentId, weeklyHours: u.weeklyHours }))
        );
        // Normalize results to a Promise.allSettled-like structure
        const ok = (bulk?.results || []).map(r => ({ status: 'fulfilled', value: r })) as PromiseSettledResult<any>[];
        results = ok;
      } catch (e) {
        results = updatesArray.map(() => ({ status: 'rejected', reason: e })) as PromiseSettledResult<any>[];
      }
    } else {
      results = await Promise.allSettled(
        updatesArray.map(u => assignmentsApi.update(u.assignmentId, { weeklyHours: u.weeklyHours }))
      );
    }

    // Rollback failed ones, if any
    const failed: typeof updatesArray = [];
    results.forEach((res, idx) => {
      if (res.status === 'rejected') failed.push(updatesArray[idx]);
    });

    // Invalidate analytics if there were any successful updates
    const succeeded = results.some(r => r.status === 'fulfilled');
    if (succeeded) {
      queryClient.invalidateQueries({ queryKey: ['capacityHeatmap'] });
      queryClient.invalidateQueries({ queryKey: ['workloadForecast'] });
    }

    if (failed.length > 0) {
      // Revert failed assignments only
      setPeople(prev => prev.map(person => {
        const failedForPerson = failed.filter(u => u.personId === person.id);
        if (failedForPerson.length === 0) return person;
        return {
          ...person,
          assignments: person.assignments.map(assignment => {
            const f = failedForPerson.find(x => x.assignmentId === assignment.id);
            return f ? { ...assignment, weeklyHours: f.prevWeeklyHours } : assignment;
          })
        };
      }));
      setAssignmentsData(prev => prev.map(a => {
        const f = failed.find(x => x.assignmentId === a.id);
        return f ? { ...a, weeklyHours: f.prevWeeklyHours } : a;
      }));
      showToast(`Failed to update ${failed.length} assignment(s). Changes were reverted for those.`, 'error');
    }
  };

  // Get utilization badge styling
  const getUtilizationBadgeStyle = (hours: number, capacity: number) => {
    if (hours === 0) return 'bg-[#3e3e42] text-[#969696]';
    const percentage = (hours / capacity) * 100;
    if (percentage <= 70) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    if (percentage <= 85) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    if (percentage <= 100) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Loading assignments...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400">{error}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Sticky Header Section */}
        <div ref={headerRef} className="sticky top-0 bg-[#1e1e1e] border-b border-[#3e3e42] z-30 px-6 py-4">
          {/* Top row: title + counts */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold text-[#cccccc]">Assignment Grid</h1>
              <div className="flex items-center gap-3">
                <p className="text-[#969696] text-sm">Manage team workload allocation across {weeks.length} weeks</p>
                <span
                  title={isSnapshotMode ? 'Rendering from server grid snapshot' : 'Server snapshot unavailable; using legacy client aggregation'}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
                    isSnapshotMode
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-[#3e3e42] text-[#bbbbbb] border-[#4e4e52]'
                  }`}
                >
                  {isSnapshotMode ? 'Snapshot Mode' : 'Legacy Mode'}
                </span>
              </div>
              {/* Weeks controls + Project View */}
              <div className="flex items-center gap-2 text-xs text-[#969696]">
                <span>Weeks</span>
                {[8,12,16,20].map(n => (
                  <button
                    key={n}
                    onClick={() => setWeeksHorizon(n)}
                    className={`px-2 py-0.5 rounded border ${weeksHorizon===n?'border-[#007acc] text-[#e0e0e0] bg-[#007acc]/20':'border-[#3e3e42] text-[#9aa0a6] hover:text-[#cfd8dc]'}`}
                  >{n}</button>
                ))}
                {(() => {
                  const s = selectedStatusFilters;
                  const statusStr = s.size===0 || s.has('Show All') ? '' : `&status=${encodeURIComponent(Array.from(s).join(','))}`;
                  const href = `/project-assignments?view=project&weeks=${weeksHorizon}${statusStr}`;
                  return (
                    <a href={href} className="ml-2 px-2 py-0.5 rounded border border-[#3e3e42] text-xs text-[#9aa0a6] hover:text-[#cfd8dc]">Project View</a>
                  );
                })()}
              </div>
            </div>
              <div className="flex items-center gap-4">
                <div className="text-xs text-[#969696]">
                  {people.length} people • {people.reduce((total, p) => total + p.assignments.length, 0)} assignments
                </div>
                {asyncJobId && (
                  <div className="flex items-center gap-2 text-xs text-[#cccccc]">
                    <span className="inline-block w-3 h-3 border-2 border-[#969696] border-t-transparent rounded-full animate-spin" />
                    <span>Generating snapshot… {asyncProgress}%</span>
                    {asyncMessage && <span className="text-[#969696]">({asyncMessage})</span>}
                  </div>
                )}
              </div>
          </div>

          {/* Second row: Department filter + project status filters */}
          <div className="mt-3 flex items-center justify-between gap-6">
            {/* Department filter is now part of page header to stay visible */}
            <div className="flex-1 min-w-[320px]">
              <GlobalDepartmentFilter
                showCopyLink={false}
                rightActions={(
                  <>
                    <button
                      className="px-2 py-0.5 rounded border border-[#3e3e42] text-xs text-[#9aa0a6] hover:text-[#cfd8dc]"
                      title="Expand all people"
                      onClick={async () => {
                        try {
                          // Expand all
                          setPeople(prev => prev.map(p => ({ ...p, isExpanded: true })));
                          // Load assignments for any person not yet loaded
                          const allIds = people.map(p => p.id!).filter(Boolean) as number[];
                          const toLoad = allIds.filter(id => !loadedAssignmentIds.has(id));
                          if (toLoad.length > 0) {
                            setLoadingAssignments(prev => { const n = new Set(prev); toLoad.forEach(id => n.add(id)); return n; });
                            await Promise.all(toLoad.map(async (pid) => {
                              try {
                                const rows = await assignmentsApi.byPerson(pid);
                                setPeople(prev => prev.map(x => x.id === pid ? { ...x, assignments: rows, isExpanded: true } : x));
                                setLoadedAssignmentIds(prev => new Set(prev).add(pid));
                              } catch {}
                              finally {
                                setLoadingAssignments(prev => { const n = new Set(prev); n.delete(pid); return n; });
                              }
                            }));
                          }
                        } catch {}
                      }}
                    >
                      Expand All
                    </button>
                    <button
                      className="px-2 py-0.5 rounded border border-[#3e3e42] text-xs text-[#9aa0a6] hover:text-[#cfd8dc]"
                      title="Collapse all people"
                      onClick={() => {
                        setPeople(prev => prev.map(p => ({ ...p, isExpanded: false })));
                      }}
                    >
                      Collapse All
                    </button>
                  </>
                )}
              />
            </div>
            {/* Project Status Filters (multi-select) */}
            <div className="flex flex-wrap items-center gap-1">
              {statusFilterOptions.map((status) => {
                const isActive = selectedStatusFilters.has(status);
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatusFilter(status)}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      isActive
                        ? 'bg-[#007acc] border-[#007acc] text-white'
                        : 'bg-[#3e3e42] border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#4e4e52]'
                    }`}
                    aria-pressed={isActive}
                    aria-label={`Filter: ${formatFilterStatus(status)}`}
                  >
                    {formatFilterStatus(status)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Week Header - positioned directly below measured header */}
        <div className="sticky bg-[#2d2d30] border-b border-[#3e3e42] z-20 overflow-x-auto" style={{ top: headerHeight }}>
          <div style={{ minWidth: totalMinWidth }}>
            <div className="grid gap-px p-2" style={{ gridTemplateColumns: gridTemplate }}>
              {/* Client column header with resize handle */}
              <div className="font-medium text-[#cccccc] text-sm px-2 py-1 relative group">
                Client
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]/50 transition-colors"
                  onMouseDown={(e) => startColumnResize('client', e)}
                  title="Drag to resize client column"
                />
              </div>

              {/* Project column header with resize handle */}
              <div className="font-medium text-[#cccccc] text-sm px-2 py-1 relative group">
                Project
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]/50 transition-colors"
                  onMouseDown={(e) => startColumnResize('project', e)}
                  title="Drag to resize project column"
                />
              </div>

              <div className="text-center text-xs text-[#969696] px-1">+/-</div>
              {weeks.map((week, index) => (
                <div key={week.date} className="text-center px-1">
                  <div className="text-xs font-medium text-[#cccccc]">{week.display}</div>
                  <div className="text-[10px] text-[#757575]">W{index + 1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        

        {/* Full Width Grid Container */}
        <div className="flex-1 overflow-x-auto bg-[#1e1e1e]">
          <div style={{ minWidth: totalMinWidth }}>

            {/* Data Rows */}
            <div>
              {people.map((person) => (
                <div key={person.id} className="border-b border-[#3e3e42] last:border-b-0">
                  
                  {/* Person Row */}
                  <div className="grid gap-px p-2 hover:bg-[#2d2d30]/50 transition-colors" style={{ gridTemplateColumns: gridTemplate }}>

                    {/* Person Info - Spans both client and project columns */}
                    <div className="col-span-2 flex items-center">
                      <button
                        onClick={() => togglePersonExpanded(person.id!)}
                        className="flex items-center gap-2 pl-3 pr-2 py-1 w-full text-left hover:bg-[#3e3e42]/50 transition-all duration-200 rounded-sm"
                      >
                        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[#969696]">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            className={`transition-transform duration-200 ${person.isExpanded ? 'rotate-90' : 'rotate-0'}`}
                          >
                            <path
                              d="M4 2 L8 6 L4 10"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#cccccc] text-sm truncate">{person.name}</div>
                          <div className="text-xs text-[#969696]">{person.role} • {person.weeklyCapacity}h/wk</div>
                        </div>
                      </button>
                    </div>

                    {/* Add Assignment Button */}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="w-7 h-7 rounded text-white hover:text-[#969696] hover:bg-[#3e3e42] transition-colors text-center text-sm font-medium leading-none font-mono"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Add new assignment"
                        onClick={() => {
                          setIsAddingAssignment(person.id!);
                          setNewProjectName('');
                        }}
                      >
                        +
                      </button>
                      <button
                        className={`w-7 h-7 rounded transition-colors text-center text-sm font-medium leading-none ${loadingAssignments.has(person.id!) ? 'bg-[#3e3e42] text-[#969696] cursor-wait' : 'bg-transparent text-[#cccccc] hover:text-white hover:bg-[#3e3e42]'}`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Refresh assignments"
                        onClick={() => refreshPersonAssignments(person.id!)}
                        disabled={loadingAssignments.has(person.id!)}
                        aria-busy={loadingAssignments.has(person.id!)}
                      >
                        {loadingAssignments.has(person.id!) ? (
                          <span className="inline-block w-3 h-3 border-2 border-[#969696] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span aria-hidden>↻</span>
                        )}
                      </button>
                    </div>

                    {/* Person's Weekly Totals */}
                    {weeks.map((week) => {
                      const totalHours = getPersonTotalHours(person, week.date);
                      
                      return (
                        <div key={week.date} className="flex items-center justify-center px-1">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium min-w-[40px] text-center ${getUtilizationBadgeStyle(totalHours, person.weeklyCapacity!)}`}>
                            {totalHours > 0 ? `${totalHours}h` : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Assignment Rows */}
                  {person.isExpanded && loadingAssignments.has(person.id!) && (
                    <div className="grid gap-px p-2" style={{ gridTemplateColumns: gridTemplate }}>
                      <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
                        <div className="text-[#969696] text-xs">Loading assignments…</div>
                      </div>
                      <div></div>
                      {weeks.map((week) => (
                        <div key={week.date} className="flex items-center justify-center">
                          <div className="w-12 h-6 flex items-center justify-center text-[#757575] text-xs">—</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {person.isExpanded && !loadingAssignments.has(person.id!) && getVisibleAssignments(person.assignments).map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment}
                      projectsById={projectsById}
                      getProjectStatus={getProjectStatus}
                      mondays={weeks}
                      onStatusChange={handleStatusChange}
                      onRemoveAssignment={(assignmentId) => removeAssignment(assignmentId, person.id!)}
                      onCellEdit={(assignmentId, week, hours) => {
                        // Handle cell edit
                        console.log('Cell edit:', assignmentId, week, hours);
                      }}
                      statusDropdown={statusDropdown}
                      projectStatus={projectStatus}
                      editingCell={editingCell}
                      onEditStart={startEditing}
                      onEditSave={saveEdit}
                      onEditCancel={cancelEdit}
                      editingValue={editingValue}
                      onEditValueChange={setEditingValue}
                      selectedCells={selectedCells}
                      selectedCell={selectedCell}
                      onCellSelect={handleCellSelection}
                      getDeliverablesForProjectWeek={getDeliverablesForProjectWeek}
                      onCellMouseDown={handleCellMouseDown}
                      onCellMouseEnter={handleCellMouseEnter}
                      personId={person.id!}
                      gridTemplate={gridTemplate}
                    />
                  ))}

                  {/* Add Assignment Form */}
                  {person.isExpanded && isAddingAssignment === person.id && (
                    <div className="grid gap-px p-1 bg-[#2d2d30] border border-blue-500/30" style={{ gridTemplateColumns: gridTemplate }}>
                      <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2 relative">
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => handleProjectSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (selectedDropdownIndex >= 0 && selectedDropdownIndex < projectSearchResults.length) {
                                // Select the highlighted project from dropdown
                                const selectedProject = projectSearchResults[selectedDropdownIndex];
                                handleProjectSelect(selectedProject);
                                addAssignment(person.id!, selectedProject);
                              } else if (selectedProject) {
                                // Use already selected project
                                addAssignment(person.id!, selectedProject);
                              }
                            } else if (e.key === 'Escape') {
                              setIsAddingAssignment(null);
                              setNewProjectName('');
                              setSelectedProject(null);
                              setShowProjectDropdown(false);
                              setSelectedDropdownIndex(-1);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (projectSearchResults.length > 0) {
                                setShowProjectDropdown(true);
                                setSelectedDropdownIndex(prev => 
                                  prev < projectSearchResults.length - 1 ? prev + 1 : prev
                                );
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (showProjectDropdown && projectSearchResults.length > 0) {
                                setSelectedDropdownIndex(prev => prev > -1 ? prev - 1 : -1);
                              }
                            }
                          }}
                          placeholder="Search projects (name, client, number)..."
                          className="w-full px-2 py-1 text-xs bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                          autoFocus
                        />
                        
                        {/* Project Search Dropdown */}
                        {showProjectDropdown && projectSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                            {projectSearchResults.map((project, index) => (
                              <button
                                key={project.id}
                                onClick={() => handleProjectSelect(project)}
                                className={`w-full text-left px-2 py-1 text-xs transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0 ${
                                  selectedDropdownIndex === index 
                                    ? 'bg-[#007acc]/30 border-[#007acc]' 
                                    : 'hover:bg-[#3e3e42]'
                                }`}
                              >
                                <div className="font-medium">{project.name}</div>
                                <div className="text-[#969696]">
                                  {[project.client, project.projectNumber].filter(Boolean).join(' • ')}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          className="w-5 h-5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors flex items-center justify-center"
                          title="Save assignment"
                          onClick={() => selectedProject && addAssignment(person.id!, selectedProject)}
                          disabled={!selectedProject}
                        >
                          ✓
                        </button>
                        <button 
                          className="w-5 h-5 rounded bg-[#3e3e42] hover:bg-[#4e4e52] text-white text-xs font-medium transition-colors flex items-center justify-center"
                          title="Cancel"
                          onClick={() => {
                            setIsAddingAssignment(null);
                            setNewProjectName('');
                            setSelectedProject(null);
                            setProjectSearchResults([]);
                            setShowProjectDropdown(false);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      {weeks.map((week) => (
                        <div key={week.date} className="flex items-center justify-center">
                          <div className="w-12 h-6 flex items-center justify-center text-[#757575] text-xs">—</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty State */}
                  {person.isExpanded && person.assignments.length === 0 && (
                    <div className="grid gap-px p-1 bg-[#252526]" style={{ gridTemplateColumns: gridTemplate }}>
                      <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
                        <div className="text-[#757575] text-xs italic">
                          No assignments
                        </div>
                      </div>
                      <div></div>
                      {weeks.map((week) => (
                        <div key={week.date} className="flex items-center justify-center">
                          <div className="w-12 h-6 flex items-center justify-center text-[#757575] text-xs">—</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex justify-between items-center text-xs text-[#969696] px-1">
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span>Available (≤70%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span>Busy (71-85%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span>Full (86-100%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Overallocated (&gt;100%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </Layout>
  );
};

export default AssignmentGrid;

