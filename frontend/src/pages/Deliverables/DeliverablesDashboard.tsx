import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import './DeliverablesDashboard.css';
import { useDeliverablesCalendar } from '@/hooks/useDeliverablesCalendar';
import { assignmentsApi, departmentsApi, deliverablesApi } from '@/services/api';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import type { Assignment, Department } from '@/types/models';
import { t } from '@/copy';
import { DELIVERABLE_PHASE_COLOR_TOKENS } from '@/theme/chartPalette';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';

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
  DELIVERABLE_PHASE_COLOR_TOKENS.ifc,
  DELIVERABLE_PHASE_COLOR_TOKENS.cd,
  DELIVERABLE_PHASE_COLOR_TOKENS.sd,
  DELIVERABLE_PHASE_COLOR_TOKENS.dd,
  DELIVERABLE_PHASE_COLOR_TOKENS.ifp,
  DELIVERABLE_PHASE_COLOR_TOKENS.bulletin,
  DELIVERABLE_PHASE_COLOR_TOKENS.masterplan,
  DELIVERABLE_PHASE_COLOR_TOKENS.milestone,
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
    return { label: t('deliverables.overdue', { days: Math.abs(daysUntil) }), urgency: 'urgent' };
  }
  if (daysUntil === 0) {
    return { label: t('deliverables.today'), urgency: 'urgent' };
  }
  if (daysUntil === 1) {
    return { label: t('deliverables.tomorrow'), urgency: 'soon' };
  }
  if (daysUntil <= 3) {
    return { label: t('deliverables.inDays', { days: daysUntil }), urgency: 'soon' };
  }
  return { label: t('deliverables.inDays', { days: daysUntil }), urgency: 'normal' };
}

function stripNotes(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

function toLocalIsoDate(date: Date | string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function estimateRowsPerPage(): number {
  if (typeof window === 'undefined') return 6;
  const h = window.innerHeight || 900;
  if (h < 700) return 3;
  if (h < 860) return 4;
  if (h < 1040) return 5;
  return 6;
}

const DeliverablesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [fallbackProjectDepartmentLeads, setFallbackProjectDepartmentLeads] = useState<Record<number, Record<number, string[]>>>({});
  const [fallbackAssignmentsLoading, setFallbackAssignmentsLoading] = useState(false);
  const [fallbackAssignmentsError, setFallbackAssignmentsError] = useState<string | null>(null);
  const [fallbackDeliverableNotesById, setFallbackDeliverableNotesById] = useState<Record<number, string | null>>({});
  const [rowsPerPage, setRowsPerPage] = useState<number>(() => estimateRowsPerPage());
  const [pageIndex, setPageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const lastPageTurnAtRef = useRef<number>(Date.now());
  const tableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const updateRows = () => {
      const next = estimateRowsPerPage();
      setRowsPerPage((prev) => (prev === next ? prev : next));
    };
    updateRows();
    window.addEventListener('resize', updateRows);
    document.addEventListener('fullscreenchange', updateRows);
    return () => {
      window.removeEventListener('resize', updateRows);
      document.removeEventListener('fullscreenchange', updateRows);
    };
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

  const handleReturn = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/deliverables/calendar');
  };

  const todayKey = toLocalIsoDate(now);
  const range = useMemo(() => {
    const start = new Date(`${todayKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 13);
    return { start: toLocalIsoDate(start), end: toLocalIsoDate(end) };
  }, [todayKey]);

  const deliverablesQuery = useDeliverablesCalendar(range, {
    mineOnly: false,
    includeNotes: 'preview',
    includeProjectLeads: true,
    staleTimeMs: 5000,
    refetchIntervalMs: 30000,
    refetchIntervalInBackground: true,
    forceRefetchOnMount: true,
  });
  const calendarMeta = (deliverablesQuery.data as any)?.__meta as
    | { source?: 'bundle' | 'legacy' | 'fallback'; notesRequested?: boolean; projectLeadsRequested?: boolean; truncated?: boolean }
    | undefined;

  useEffect(() => {
    const onFullscreenChange = () => {
      void deliverablesQuery.refetch();
      window.setTimeout(() => setLayoutEpoch((prev) => prev + 1), 80);
      window.setTimeout(() => setLayoutEpoch((prev) => prev + 1), 280);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [deliverablesQuery.refetch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void deliverablesQuery.refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [deliverablesQuery.refetch]);

  useEffect(() => {
    const onViewportResize = () => {
      const next = estimateRowsPerPage();
      setRowsPerPage((prev) => (prev === next ? prev : next));
      setLayoutEpoch((prev) => prev + 1);
    };
    window.addEventListener('orientationchange', onViewportResize);
    window.visualViewport?.addEventListener('resize', onViewportResize);
    return () => {
      window.removeEventListener('orientationchange', onViewportResize);
      window.visualViewport?.removeEventListener('resize', onViewportResize);
    };
  }, []);

  useEffect(() => {
    const unsubDeliverables = subscribeDeliverablesRefresh(() => {
      void deliverablesQuery.refetch();
    });
    const unsubGrid = subscribeGridRefresh((payload) => {
      const reason = String(payload?.reason || '').toLowerCase();
      if (reason.includes('deliverable')) {
        void deliverablesQuery.refetch();
      }
    });
    return () => {
      unsubDeliverables();
      unsubGrid();
    };
  }, [deliverablesQuery.refetch]);

  const deliverables = useMemo<DeliverablesRow[]>(() => {
    const items = deliverablesQuery.data ?? [];
    const startBound = new Date(`${range.start}T00:00:00`);
    const endBound = new Date(`${range.end}T23:59:59`);
    return items
      .filter((item) => {
        const raw = item as any;
        const itemType = raw.itemType ?? raw.kind ?? 'deliverable';
        if (itemType !== 'deliverable') return false;
        if (raw.preDeliverableType != null || raw.preDeliverableTypeId != null) return false;
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
      const itemType = raw.itemType ?? raw.kind ?? 'deliverable';
      if (itemType !== 'deliverable') return false;
      return Object.prototype.hasOwnProperty.call(raw, 'notesPreview') || Object.prototype.hasOwnProperty.call(raw, 'notes');
    });
  }, [deliverablesQuery.data]);
  const notesHandledByBundle = Boolean(calendarMeta?.source === 'bundle' && calendarMeta?.notesRequested);

  const hasBundledDepartmentLeads = useMemo(() => {
    const items = deliverablesQuery.data ?? [];
    return items.some((item) => {
      const raw = item as any;
      const itemType = raw.itemType ?? raw.kind ?? 'deliverable';
      if (itemType !== 'deliverable') return false;
      return Object.prototype.hasOwnProperty.call(raw, 'departmentLeads');
    });
  }, [deliverablesQuery.data]);
  const projectLeadsHandledByBundle = Boolean(
    calendarMeta?.source === 'bundle' && calendarMeta?.projectLeadsRequested
  );

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
      const itemType = raw.itemType ?? raw.kind ?? 'deliverable';
      if (itemType !== 'deliverable') return;
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
    lastPageTurnAtRef.current = Date.now();
  }, [pageIndex]);

  useEffect(() => {
    const watchdog = setInterval(() => {
      const nowMs = Date.now();
      if (pages.length > 1 && nowMs - lastPageTurnAtRef.current > 45000) {
        setPageIndex((prev) => (prev + 1) % pages.length);
        lastPageTurnAtRef.current = nowMs;
        void deliverablesQuery.refetch();
      }
      const updatedAt = deliverablesQuery.dataUpdatedAt || 0;
      if (updatedAt > 0 && nowMs - updatedAt > 120000) {
        void deliverablesQuery.refetch();
      }
      const tableEl = tableRef.current;
      if (tableEl) {
        const rect = tableEl.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 120 || (deliverables.length > 0 && tableEl.scrollHeight <= 2)) {
          setLayoutEpoch((prev) => prev + 1);
          void deliverablesQuery.refetch();
        }
      }
    }, 15000);
    return () => clearInterval(watchdog);
  }, [pages.length, deliverables.length, deliverablesQuery.dataUpdatedAt, deliverablesQuery.refetch]);

  useAuthenticatedEffect(() => {
    let active = true;
    if (notesHandledByBundle || hasBundledNotes || !deliverableIds.length) {
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
  }, [notesHandledByBundle, hasBundledNotes, deliverableIds.join(','), fallbackDeliverableNotesById]);

  useAuthenticatedEffect(() => {
    let active = true;
    if (projectLeadsHandledByBundle || hasBundledDepartmentLeads) {
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
  }, [projectLeadsHandledByBundle, hasBundledDepartmentLeads, projectIds.join(',')]);

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
    if (!ts) return t('deliverables.updating');
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ts));
  }, [deliverablesQuery.dataUpdatedAt]);

  const totalProjects = projectIds.length;
  const totalDeliverables = deliverables.length;
  const isDataDegraded = calendarMeta?.source === 'fallback' || calendarMeta?.source === 'legacy';
  const isDataPartial = Boolean(calendarMeta?.truncated);
  const leadCoverageLoading =
    deliverablesQuery.isLoading || fallbackAssignmentsLoading;
  const dataModeLabel =
    calendarMeta?.source === 'fallback'
      ? t('deliverables.modeFallback')
      : calendarMeta?.source === 'legacy'
        ? t('deliverables.modeLegacy')
        : t('deliverables.modeBundle');

  return (
    <div className="deliverables-dashboard">
      <div className="dd-shell">
        <header className="dd-header">
          <div>
            <div className="dd-title">{t('deliverables.title')}</div>
            <div className="dd-subtitle">{t('deliverables.subtitle', { deliverables: totalDeliverables, projects: totalProjects })}</div>
          </div>
          <div className="dd-clock">
            <div className="dd-clock-date">{headerDate}</div>
            <div className="dd-clock-time">{headerTime}</div>
            <div className="dd-clock-actions">
              <button type="button" className="dd-fullscreen-btn" onClick={toggleFullscreen}>
                {isFullscreen ? t('deliverables.exitFullscreen') : t('deliverables.enterFullscreen')}
              </button>
              {!isFullscreen ? (
                <button type="button" className="dd-return-btn" onClick={handleReturn}>
                  {t('deliverables.return')}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="dd-table" aria-live="polite" key={`dd-table-${layoutEpoch}`} ref={tableRef}>
          <div className="dd-table-header">
            <div>{t('deliverables.col.dueDate')}</div>
            <div>{t('deliverables.col.project')}</div>
            <div></div>
            <div>{t('deliverables.col.deliverable')}</div>
            <div>{t('deliverables.col.departmentsLeads')}</div>
          </div>

          <div className="dd-page" key={`page-${pageIndex}-${rowsPerPage}-${deliverables.length}`}>
            {deliverablesQuery.isLoading && (
              <div className="dd-row">
                <div className="dd-empty">{t('deliverables.loading')}</div>
              </div>
            )}

            {deliverablesQuery.isError && (
              <div className="dd-row">
                <div className="dd-empty">{t('deliverables.unavailable')}</div>
              </div>
            )}

            {!deliverablesQuery.isLoading && !deliverablesQuery.isError && deliverables.length === 0 && (
              <div className="dd-row">
                <div className="dd-empty">{t('deliverables.noneUpcoming')}</div>
              </div>
            )}

            {currentPage.map((item) => {
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
                    {item.isCompleted && <span className="dd-pill">{t('deliverables.completed')}</span>}
                  </div>
                </div>

                <div>
                  {leadCoverageLoading ? (
                    <div className="dd-empty">{t('deliverables.loadingCoverage')}</div>
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
                    <div className="dd-empty">{t('deliverables.noLeadsMapped')}</div>
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
            {t('deliverables.updatedAt', { time: updatedAtLabel })}
            <span className="dd-status-mode">{dataModeLabel}</span>
          </div>
          <div className="dd-footer-meta">
            <div className="dd-page-indicator">{t('deliverables.pageOf', { current: Math.min(pageIndex + 1, pages.length || 1), total: pages.length || 1 })}</div>
            {pages.length > 1 && (
              <div className="dd-timer">
                <div className="dd-timer-text">{t('deliverables.autoRotate')}</div>
              </div>
            )}
          </div>
          <div className="dd-system-status">
            {isDataDegraded && <div className="dd-status-warning">{t('deliverables.degradedWarning')}</div>}
            {isDataPartial && <div className="dd-status-warning">{t('deliverables.partialWarning')}</div>}
            {leadCoverageLoading && t('deliverables.refreshingCoverage')}
            {!leadCoverageLoading && fallbackAssignmentsError && fallbackAssignmentsError}
            {!leadCoverageLoading && !fallbackAssignmentsError && departmentError && departmentError}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default DeliverablesDashboard;
