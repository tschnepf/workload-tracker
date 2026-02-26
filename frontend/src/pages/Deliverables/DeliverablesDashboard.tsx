import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './DeliverablesDashboard.css';
import { useDeliverablesCalendar, toIsoDate } from '@/hooks/useDeliverablesCalendar';
import { assignmentsApi, departmentsApi, deliverablesApi } from '@/services/api';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import type { Assignment, Department } from '@/types/models';

const UNKNOWN_DEPT_ID = -1;

type DeliverablesRow = {
  id: string;
  deliverableId?: number;
  date: string;
  projectId: number | null;
  projectName: string;
  projectClient?: string | null;
  title: string;
  isCompleted: boolean;
  percentage?: number | null;
  notes?: string | null;
};

type DepartmentMeta = {
  id: number;
  name: string;
  lead: string;
  color: string;
};

const DEPT_PALETTE = [
  '#5ed3c6',
  '#f29f74',
  '#f2c46e',
  '#86b6f5',
  '#f08fb5',
  '#6fd39f',
  '#cbd874',
  '#9fd0e3',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getDeptColor(seed: string): string {
  if (!seed) return DEPT_PALETTE[0];
  const idx = hashString(seed) % DEPT_PALETTE.length;
  return DEPT_PALETTE[idx];
}

function formatDaysLabel(daysUntil: number): { label: string; urgency: 'urgent' | 'soon' | 'normal' } {
  if (daysUntil < 0) {
    return { label: `${Math.abs(daysUntil)}d overdue`, urgency: 'urgent' };
  }
  if (daysUntil === 0) {
    return { label: 'Today', urgency: 'urgent' };
  }
  if (daysUntil === 1) {
    return { label: 'Tomorrow', urgency: 'soon' };
  }
  if (daysUntil <= 3) {
    return { label: `In ${daysUntil} days`, urgency: 'soon' };
  }
  return { label: `In ${daysUntil} days`, urgency: 'normal' };
}

function stripNotes(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

const DeliverablesDashboard: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [fallbackProjectDepartmentLeads, setFallbackProjectDepartmentLeads] = useState<Record<number, Record<number, string[]>>>({});
  const [fallbackAssignmentsLoading, setFallbackAssignmentsLoading] = useState(false);
  const [fallbackAssignmentsError, setFallbackAssignmentsError] = useState<string | null>(null);
  const [fallbackDeliverableNotesById, setFallbackDeliverableNotesById] = useState<Record<number, string | null>>({});
  const [rowsPerPage, setRowsPerPage] = useState(6);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageDeadline, setPageDeadline] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tableHeaderRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    const root: any = document.documentElement;
    const doc: any = document;
    if (!document.fullscreenElement) {
      const request = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
      if (request) request.call(root);
    } else {
      const exit = document.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exit) exit.call(document);
    }
  };

  const todayKey = toIsoDate(now);
  const range = useMemo(() => {
    const start = new Date(`${todayKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 13);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }, [todayKey]);

  const deliverablesQuery = useDeliverablesCalendar(range, {
    mineOnly: false,
    includeNotes: 'preview',
    includeProjectLeads: true,
  });

  const deliverables = useMemo<DeliverablesRow[]>(() => {
    const items = deliverablesQuery.data ?? [];
    const startBound = new Date(`${range.start}T00:00:00`);
    const endBound = new Date(`${range.end}T23:59:59`);
    return items
      .filter((item) => {
        const raw = item as any;
        const itemType = raw.itemType ?? raw.kind;
        if (itemType && itemType !== 'deliverable') return false;
        if (raw.preDeliverableType != null || raw.preDeliverableTypeId != null) return false;
        const title = typeof raw.title === 'string' ? raw.title.trim().toLowerCase() : '';
        if (!itemType && title.startsWith('pre:')) return false;
        if (!raw.date) return false;
        const date = new Date(`${raw.date}T00:00:00`);
        return date >= startBound && date <= endBound;
      })
      .map((item) => {
        const raw = item as any;
        const projectId = typeof raw.project === 'number' ? raw.project : null;
        const projectName = raw.projectName || raw.projectClient || (projectId != null ? `Project ${projectId}` : 'Unknown Project');
        const projectClient = raw.projectName ? raw.projectClient ?? null : null;
        const deliverableId = typeof raw.id === 'number' ? raw.id : undefined;
        const bundledNotes = stripNotes(raw.notesPreview ?? raw.notes);
        const fallbackNotes = deliverableId != null ? (fallbackDeliverableNotesById[deliverableId] ?? null) : null;
        return {
          id: `deliv-${raw.id}`,
          deliverableId,
          date: raw.date as string,
          projectId,
          projectName,
          projectClient,
          title: raw.title || 'Deliverable',
          isCompleted: Boolean(raw.isCompleted),
          percentage: typeof raw.percentage === 'number' ? Number(raw.percentage) : null,
          notes: bundledNotes ?? fallbackNotes,
        } as DeliverablesRow;
      })
      .sort((a, b) => {
        const da = new Date(`${a.date}T00:00:00`).getTime();
        const db = new Date(`${b.date}T00:00:00`).getTime();
        return da - db;
      });
  }, [deliverablesQuery.data, range.end, range.start, fallbackDeliverableNotesById]);

  const projectIds = useMemo(() => {
    const ids = new Set<number>();
    deliverables.forEach((item) => {
      if (typeof item.projectId === 'number') ids.add(item.projectId);
    });
    return Array.from(ids);
  }, [deliverables]);

  const deliverableIds = useMemo(() => {
    const ids = new Set<number>();
    deliverables.forEach((item) => {
      if (typeof item.deliverableId === 'number') ids.add(item.deliverableId);
    });
    return Array.from(ids);
  }, [deliverables]);

  const hasBundledNotes = useMemo(() => {
    const items = deliverablesQuery.data ?? [];
    return items.some((item) => {
      const raw = item as any;
      const itemType = raw.itemType ?? raw.kind;
      if (itemType && itemType !== 'deliverable') return false;
      return Object.prototype.hasOwnProperty.call(raw, 'notesPreview') || Object.prototype.hasOwnProperty.call(raw, 'notes');
    });
  }, [deliverablesQuery.data]);

  const hasBundledDepartmentLeads = useMemo(() => {
    const items = deliverablesQuery.data ?? [];
    return items.some((item) => {
      const raw = item as any;
      const itemType = raw.itemType ?? raw.kind;
      if (itemType && itemType !== 'deliverable') return false;
      return Object.prototype.hasOwnProperty.call(raw, 'departmentLeads');
    });
  }, [deliverablesQuery.data]);

  const safeRowsPerPage = useMemo(() => {
    if (!Number.isFinite(rowsPerPage) || rowsPerPage <= 0) return Math.max(1, deliverables.length || 1);
    return Math.max(1, rowsPerPage);
  }, [rowsPerPage, deliverables.length]);

  const pages = useMemo(() => {
    if (safeRowsPerPage <= 0) return deliverables.length ? [deliverables] : [[]];
    const chunks: DeliverablesRow[][] = [];
    for (let i = 0; i < deliverables.length; i += safeRowsPerPage) {
      chunks.push(deliverables.slice(i, i + safeRowsPerPage));
    }
    return chunks.length ? chunks : [[]];
  }, [deliverables, safeRowsPerPage]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)] || [];

  const departmentMap = useMemo(() => {
    const map = new Map<number, Department>();
    departments.forEach((dept) => {
      if (dept.id != null) map.set(dept.id, dept);
    });
    return map;
  }, [departments]);

  const projectDepartmentLeads = useMemo(() => {
    const normalized: Record<number, Record<number, string[]>> = { ...fallbackProjectDepartmentLeads };
    const items = deliverablesQuery.data ?? [];
    items.forEach((item) => {
      const raw = item as any;
      const itemType = raw.itemType ?? raw.kind;
      if (itemType && itemType !== 'deliverable') return;
      const projectId = typeof raw.project === 'number' ? raw.project : null;
      if (projectId == null) return;
      const leadsMap = raw.departmentLeads;
      if (!leadsMap || typeof leadsMap !== 'object') return;
      const projectEntry = { ...(normalized[projectId] || {}) };
      Object.entries(leadsMap).forEach(([deptIdRaw, leadsValue]) => {
        const deptId = Number(deptIdRaw);
        if (!Number.isFinite(deptId)) return;
        const leads = Array.isArray(leadsValue)
          ? leadsValue.filter((name) => typeof name === 'string')
          : [];
        projectEntry[deptId] = leads;
      });
      normalized[projectId] = projectEntry;
    });
    return normalized;
  }, [deliverablesQuery.data, fallbackProjectDepartmentLeads]);

  const departmentMetaByProject = useMemo(() => {
    const entries: Record<number, DepartmentMeta[]> = {};
    Object.entries(projectDepartmentLeads).forEach(([projectId, deptMap]) => {
      const metas = Object.entries(deptMap).map(([deptIdRaw, leads]) => {
        const deptId = Number(deptIdRaw);
        if (deptId === UNKNOWN_DEPT_ID) {
          const leadLabel = leads.length ? leads.join(' • ') : 'Lead TBD';
          return {
            id: UNKNOWN_DEPT_ID,
            name: 'Unassigned Department',
            lead: leadLabel,
            color: getDeptColor('unknown-dept'),
          };
        }
        const dept = departmentMap.get(deptId);
        const name = dept?.shortName || dept?.name || `Department ${deptId}`;
        const leadLabel = leads.length ? leads.join(' • ') : 'Lead TBD';
        return {
          id: deptId,
          name,
          lead: leadLabel,
          color: getDeptColor(name),
        };
      });
      metas.sort((a, b) => a.name.localeCompare(b.name));
      entries[Number(projectId)] = metas;
    });
    return entries;
  }, [projectDepartmentLeads, departmentMap]);

  useAuthenticatedEffect(() => {
    let active = true;
    setDepartmentError(null);
    (async () => {
      try {
        const list = await departmentsApi.listAll({ include_inactive: 1 });
        if (!active) return;
        setDepartments(list || []);
      } catch (err) {
        if (!active) return;
        console.error('Failed to load departments:', err);
        setDepartmentError('Departments unavailable');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const table = tableRef.current;
    const header = tableHeaderRef.current;
    const page = pageRef.current;
    if (!table || !page) return;

    const compute = () => {
      const tableHeight = table.clientHeight;
      const headerHeight = header?.clientHeight ?? 0;
      const available = Math.max(0, tableHeight - headerHeight);
      const rows = Array.from(page.querySelectorAll<HTMLElement>('.dd-row'));
      if (!rows.length) return;
      const maxRowHeight = rows.reduce((max, row) => Math.max(max, row.getBoundingClientRect().height), 0);
      if (!maxRowHeight) return;
      const next = Math.max(1, Math.floor(available / maxRowHeight));
      if (!Number.isFinite(next) || next <= 0) return;
      setRowsPerPage((prev) => (prev === next ? prev : next));
    };

    const raf = requestAnimationFrame(compute);
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(raf);
    const ro = new ResizeObserver(() => compute());
    ro.observe(table);
    if (header) ro.observe(header);
    ro.observe(page);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [pageIndex, pages.length, deliverables.length, isFullscreen]);

  useEffect(() => {
    if (deliverables.length && pageIndex !== 0) {
      setPageIndex(0);
    }
  }, [deliverables.length]);

  useEffect(() => {
    if (pageIndex >= pages.length) setPageIndex(0);
  }, [pageIndex, pages.length]);

  useEffect(() => {
    if (pages.length <= 1) return;
    const timer = setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pages.length);
    }, 20000);
    return () => clearInterval(timer);
  }, [pages.length]);

  useEffect(() => {
    if (pages.length <= 1) {
      setPageDeadline(null);
      setSecondsRemaining(0);
      return;
    }
    const deadline = Date.now() + 20000;
    setPageDeadline(deadline);
    setSecondsRemaining(20);
  }, [pageIndex, pages.length]);

  useEffect(() => {
    if (!pageDeadline) return;
    const tick = () => {
      const diffMs = pageDeadline - Date.now();
      const next = Math.max(0, Math.ceil(diffMs / 1000));
      setSecondsRemaining(next);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [pageDeadline]);

  useAuthenticatedEffect(() => {
    let active = true;
    if (hasBundledNotes || !deliverableIds.length) {
      return () => {
        active = false;
      };
    }
    const missing = deliverableIds.filter((id) => !(id in fallbackDeliverableNotesById));
    if (!missing.length) {
      return () => {
        active = false;
      };
    }
    (async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const detail = await deliverablesApi.get(id);
            return { id, notes: stripNotes(detail.notes) };
          } catch (err) {
            console.warn('Fallback note load failed', id, err);
            return { id, notes: null };
          }
        })
      );
      if (!active) return;
      setFallbackDeliverableNotesById((prev) => {
        const next = { ...prev };
        results.forEach((item) => {
          next[item.id] = item.notes;
        });
        return next;
      });
    })();
    return () => {
      active = false;
    };
  }, [hasBundledNotes, deliverableIds.join(','), fallbackDeliverableNotesById]);

  useAuthenticatedEffect(() => {
    let active = true;
    if (hasBundledDepartmentLeads) {
      setFallbackAssignmentsLoading(false);
      setFallbackAssignmentsError(null);
      return () => {
        active = false;
      };
    }
    if (!projectIds.length) {
      setFallbackProjectDepartmentLeads({});
      setFallbackAssignmentsLoading(false);
      setFallbackAssignmentsError(null);
      return () => {
        active = false;
      };
    }
    setFallbackAssignmentsLoading(true);
    setFallbackAssignmentsError(null);
    (async () => {
      const all = await assignmentsApi.listAll(
        {
          project_ids: projectIds,
          include_placeholders: 1,
        },
        { noCache: true }
      );
      const map: Record<number, Map<number, Set<string>>> = {};
      (all || []).forEach((assignment: Assignment) => {
        const pid = assignment.project;
        if (typeof pid !== 'number') return;
        if (!map[pid]) map[pid] = new Map<number, Set<string>>();
        const deptIdRaw = assignment.personDepartmentId;
        const deptId = typeof deptIdRaw === 'number' && deptIdRaw > 0 ? deptIdRaw : UNKNOWN_DEPT_ID;
        if (!map[pid].has(deptId)) map[pid].set(deptId, new Set<string>());
        const roleName = assignment.roleName || '';
        const personName = assignment.personName || '';
        if (personName && /lead/i.test(roleName)) {
          map[pid].get(deptId)!.add(personName);
        }
      });
      const normalized: Record<number, Record<number, string[]>> = {};
      Object.entries(map).forEach(([pid, deptMap]) => {
        const deptEntries: Record<number, string[]> = {};
        deptMap.forEach((leads, deptId) => {
          deptEntries[deptId] = Array.from(leads);
        });
        normalized[Number(pid)] = deptEntries;
      });
      if (!active) return;
      setFallbackProjectDepartmentLeads(normalized);
      setFallbackAssignmentsLoading(false);
    })().catch((err) => {
      if (!active) return;
      console.error('Fallback lead coverage load failed:', err);
      setFallbackAssignmentsError('Assignment coverage unavailable');
      setFallbackAssignmentsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [hasBundledDepartmentLeads, projectIds.join(',')]);

  const headerDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(now);
  }, [now]);

  const headerTime = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
  }, [now]);

  const updatedAtLabel = useMemo(() => {
    const ts = deliverablesQuery.dataUpdatedAt;
    if (!ts) return 'Updating';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ts));
  }, [deliverablesQuery.dataUpdatedAt]);

  const totalProjects = projectIds.length;
  const totalDeliverables = deliverables.length;
  const leadCoverageLoading =
    deliverablesQuery.isLoading || deliverablesQuery.isFetching || fallbackAssignmentsLoading;

  return (
    <div className="deliverables-dashboard">
      <div className="dd-shell">
        <header className="dd-header">
          <div>
            <div className="dd-title">Upcoming Deliverables</div>
            <div className="dd-subtitle">Next 14 Days - {totalDeliverables} Deliverables - {totalProjects} Projects</div>
          </div>
          <div className="dd-clock">
            <div className="dd-clock-date">{headerDate}</div>
            <div className="dd-clock-time">{headerTime}</div>
            <button type="button" className="dd-fullscreen-btn" onClick={toggleFullscreen}>
              {isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
            </button>
          </div>
        </header>

        <section className="dd-table" aria-live="polite" ref={tableRef}>
          <div className="dd-table-header" ref={tableHeaderRef}>
            <div>Due Date</div>
            <div>Project</div>
            <div></div>
            <div>Deliverable</div>
            <div>Departments and Leads</div>
          </div>

          <div className="dd-page" key={`page-${pageIndex}-${rowsPerPage}-${deliverables.length}`} ref={pageRef}>
            {deliverablesQuery.isLoading && (
              <div className="dd-row">
                <div className="dd-empty">Loading deliverables...</div>
              </div>
            )}

            {deliverablesQuery.isError && (
              <div className="dd-row">
                <div className="dd-empty">Deliverables unavailable right now.</div>
              </div>
            )}

            {!deliverablesQuery.isLoading && !deliverablesQuery.isError && deliverables.length === 0 && (
              <div className="dd-row">
                <div className="dd-empty">No deliverables scheduled in the next 14 days.</div>
              </div>
            )}

            {currentPage.map((item, index) => {
            const dateObj = new Date(`${item.date}T00:00:00`);
            const today = new Date(`${todayKey}T00:00:00`);
            const daysUntil = Math.ceil((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const badge = formatDaysLabel(daysUntil);
            const urgencyClass = badge.urgency === 'urgent' ? 'is-urgent' : badge.urgency === 'soon' ? 'is-soon' : '';
            const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateObj);
            const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dateObj);
            const departmentsForProject = item.projectId != null ? (departmentMetaByProject[item.projectId] || []) : [];

            return (
              <div
                key={item.id}
                className={`dd-row ${urgencyClass}`}
                style={{ ['--dd-delay' as any]: `${index * 45}ms` }}
              >
                <div className="dd-date-block">
                  <div className="dd-date-info">
                    <div className="dd-date-main">{dateLabel}</div>
                    <div className="dd-date-sub">{dayLabel}</div>
                  </div>
                </div>

                <div>
                  <div className="dd-project-name">{item.projectName}</div>
                  {item.projectClient && <div className="dd-project-client">{item.projectClient}</div>}
                </div>

                <div className="dd-badge-cell">
                  <div className={`dd-badge is-${badge.urgency}`}>{badge.label}</div>
                </div>

                <div>
                  <div className="dd-deliverable-title">{item.title}</div>
                  {item.notes && <div className="dd-deliverable-notes">{item.notes}</div>}
                  <div className="dd-deliverable-meta">
                    {item.percentage != null && <span className="dd-pill">{Math.round(item.percentage)}%</span>}
                    {item.isCompleted && <span className="dd-pill">Completed</span>}
                  </div>
                </div>

                <div>
                  {leadCoverageLoading ? (
                    <div className="dd-empty">Loading lead coverage...</div>
                  ) : departmentsForProject.length > 0 ? (
                    <div className="dd-dept-list">
                      {departmentsForProject.map((dept) => (
                        <div key={`${item.id}-${dept.id}-${dept.name}`} className="dd-dept-chip">
                          <div className="dd-dept-name">
                            <span className="dd-dept-dot" style={{ background: dept.color }} />
                            <span>{dept.name}</span>
                          </div>
                          <div className="dd-dept-lead">{dept.lead}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dd-empty">No department leads mapped</div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </section>

        <footer className="dd-footer">
          <div className="dd-status">
            <span className="dd-status-dot" />
            Updated {updatedAtLabel}
          </div>
          <div className="dd-footer-meta">
            <div className="dd-page-indicator">Page {Math.min(pageIndex + 1, pages.length || 1)} of {pages.length || 1}</div>
            {pages.length > 1 && (
              <div className="dd-timer" style={{ ['--dd-timer-duration' as any]: '20s' }}>
                <div className="dd-timer-ring" key={`timer-${pageIndex}`}>
                  <svg viewBox="0 0 36 36" aria-hidden="true">
                    <circle className="dd-timer-track" cx="18" cy="18" r="14" />
                    <circle className="dd-timer-progress" cx="18" cy="18" r="14" />
                  </svg>
                </div>
                <div className="dd-timer-text">Next in {secondsRemaining}s</div>
              </div>
            )}
          </div>
          <div>
            {leadCoverageLoading && 'Refreshing coverage'}
            {!leadCoverageLoading && fallbackAssignmentsError && fallbackAssignmentsError}
            {!leadCoverageLoading && !fallbackAssignmentsError && departmentError && departmentError}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default DeliverablesDashboard;
