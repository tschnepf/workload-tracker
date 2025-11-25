import React from 'react';
import GlobalDepartmentFilter from '@/components/filters/GlobalDepartmentFilter';

export interface HeaderBarProps {
  headerRef: React.RefObject<HTMLDivElement>;
  title: string;
  weeksCount: number;
  isSnapshotMode: boolean;
  weeksHorizon: number;
  setWeeksHorizon: (n: number) => void;
  projectViewHref: string;
  peopleCount: number;
  assignmentsCount: number;
  asyncJobId: string | null;
  asyncProgress: number;
  asyncMessage?: string;
  loading: boolean;
  loadingAssignmentsInProgress: boolean;
  onExpandAllAndRefresh: () => void | Promise<void>;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
  statusFilterOptions: readonly string[];
  selectedStatusFilters: Set<string>;
  formatFilterStatus: (s: string) => string;
  toggleStatusFilter: (s: string) => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  headerRef,
  title,
  weeksCount,
  isSnapshotMode,
  weeksHorizon,
  setWeeksHorizon,
  projectViewHref,
  peopleCount,
  assignmentsCount,
  asyncJobId,
  asyncProgress,
  asyncMessage,
  loading,
  loadingAssignmentsInProgress,
  onExpandAllAndRefresh,
  onCollapseAll,
  onRefreshAll,
  statusFilterOptions,
  selectedStatusFilters,
  formatFilterStatus,
  toggleStatusFilter,
}) => {
  return (
    <div ref={headerRef} className="sticky top-0 bg-[var(--bg)] border-b border-[var(--border)] z-30 px-6 py-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{title}</h1>
          <div className="flex items-center gap-3">
            <p className="text-[var(--muted)] text-sm">Manage team workload allocation across {weeksCount} weeks</p>
            <span
              title={isSnapshotMode ? 'Rendering from server grid snapshot' : 'Server snapshot unavailable; using legacy client aggregation'}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
                isSnapshotMode
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-[var(--surface)] text-[var(--muted)] border-[var(--borderSubtle)]'
              }`}
            >
              {isSnapshotMode ? 'Snapshot Mode' : 'Legacy Mode'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>Weeks</span>
            {[8, 12, 16, 20].map((n) => (
              <button
                key={n}
                onClick={() => setWeeksHorizon(n)}
                className={`px-2 py-0.5 rounded border ${
                  weeksHorizon === n
                    ? 'border-[var(--primary)] text-[var(--text)] bg-[var(--surfaceHover)]'
                    : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {n}
              </button>
            ))}
            <a
              href={projectViewHref}
              className="ml-2 px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              Project View
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-[var(--muted)]">
            {peopleCount} people • {assignmentsCount} assignments
          </div>
          {asyncJobId && (
            <div className="flex items-center gap-2 text-xs text-[var(--text)]">
              <span className="inline-block w-3 h-3 border-2 border-[var(--muted)] border-t-transparent rounded-full animate-spin" />
              <span>Generating snapshot... {asyncProgress}%</span>
              {asyncMessage && <span className="text-[var(--muted)]">({asyncMessage})</span>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-none min-w-[220px]">
            <GlobalDepartmentFilter
              showCopyLink={false}
              rightActions={(
                <>
                  <button
                    className={`px-2 py-0.5 rounded border border-[var(--border)] text-xs transition-colors ${
                      loadingAssignmentsInProgress
                        ? 'text-[var(--muted)] cursor-wait'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    title="Expand all people and refresh their assignments"
                    onClick={onExpandAllAndRefresh}
                    disabled={loadingAssignmentsInProgress}
                  >
                    {loadingAssignmentsInProgress ? 'Expanding...' : 'Expand All'}
                  </button>
                  <button
                    className="px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
                    title="Collapse all people"
                    onClick={onCollapseAll}
                  >
                    Collapse All
                  </button>
                  <button
                    className={`px-2 py-0.5 rounded border text-xs transition-colors ${
                      loading || loadingAssignmentsInProgress
                        ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] cursor-wait'
                        : 'bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    title="Refresh assignments for all people"
                    onClick={onRefreshAll}
                    disabled={loading || loadingAssignmentsInProgress}
                  >
                    {loadingAssignmentsInProgress ? 'Refreshing...' : 'Refresh All'}
                  </button>
                </>
              )}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {statusFilterOptions.map((status) => {
            const isActive =
              status === 'Show All'
                ? selectedStatusFilters.size === 0
                : selectedStatusFilters.has(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatusFilter(status)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  isActive
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
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
  );
};

export default HeaderBar;
