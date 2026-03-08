import React from 'react';
import WorkPlanningSearchBar from '@/features/work-planning/search/WorkPlanningSearchBar';
import type { WorkPlanningSearchOp, WorkPlanningSearchToken } from '@/features/work-planning/search/useWorkPlanningSearchTokens';

interface Props {
  myProjectsOnly: boolean;
  onToggleMyProjectsOnly: () => void;
  disableMyProjectsOnly?: boolean;
  statusOptions: readonly string[];
  selectedStatusFilters: Set<string>;
  onToggleStatus: (status: string) => void;
  searchTokens: WorkPlanningSearchToken[];
  searchInput: string;
  searchOp: WorkPlanningSearchOp;
  activeTokenId: string | null;
  onSearchInput: (value: string) => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSearchOpChange: (op: WorkPlanningSearchOp) => void;
  onSelectToken: (id: string | null) => void;
  onRemoveToken: (id: string) => void;
  formatFilterStatus: (status: string) => string;
  filterMetaLoading?: boolean;
  filterMetaError?: string | null;
  onRetryFilterMeta?: () => void;
  rightSlot?: React.ReactNode;
  compact?: boolean;
}

const FiltersBar: React.FC<Props> = ({
  myProjectsOnly,
  onToggleMyProjectsOnly,
  disableMyProjectsOnly = false,
  statusOptions,
  selectedStatusFilters,
  onToggleStatus,
  searchTokens,
  searchInput,
  searchOp,
  activeTokenId,
  onSearchInput,
  onSearchKeyDown,
  onSearchOpChange,
  onSelectToken,
  onRemoveToken,
  formatFilterStatus,
  filterMetaLoading,
  filterMetaError,
  onRetryFilterMeta,
  rightSlot,
  compact = false,
}) => {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className={`rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/10 ${compact ? 'p-2' : 'p-3'}`}>
        <div className={`${compact ? 'text-[10px]' : 'text-xs'} uppercase tracking-wide text-[var(--muted)] mb-2`}>Scope</div>
        <button
          type="button"
          onClick={onToggleMyProjectsOnly}
          disabled={disableMyProjectsOnly}
          className={`${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded border transition-colors ${
            myProjectsOnly
              ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
              : 'bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]'
          } disabled:opacity-60 disabled:cursor-not-allowed`}
          aria-pressed={myProjectsOnly}
          aria-label="Toggle my projects filter"
        >
          My Projects
        </button>
      </div>
      <div>
        <label className={`${compact ? 'sr-only' : 'text-xs text-[var(--muted)] mb-1 block'}`}>Filter by Status:</label>
        <div className={`flex flex-wrap ${compact ? 'gap-0.5' : 'gap-1'}`}>
          {statusOptions.map((status) => {
            const isActive = selectedStatusFilters.has(status);
            return (
              <button
                key={status}
                onClick={() => onToggleStatus(status)}
                className={`${compact ? 'px-1.5 py-0 text-[11px] leading-5' : 'px-2 py-0.5 text-xs'} rounded border transition-colors ${
                  isActive
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--cardHover)]'
                }`}
                aria-label={`Filter projects by ${formatFilterStatus(status).toLowerCase()}`}
                aria-pressed={isActive}
              >
                {formatFilterStatus(status)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        <div className="flex-1 min-w-0">
          <WorkPlanningSearchBar
            id="projects-search"
            label="Search projects"
            tokens={searchTokens}
            activeTokenId={activeTokenId}
            searchOp={searchOp}
            searchInput={searchInput}
            onInputChange={onSearchInput}
            onInputKeyDown={onSearchKeyDown}
            onTokenSelect={onSelectToken}
            onTokenRemove={onRemoveToken}
            onSearchOpChange={onSearchOpChange}
            placeholder={searchTokens.length ? 'Add another filter...' : 'Search projects by client, name, or number (Enter)'}
            compact={compact}
            tokenLayout="wrap"
          />
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>

      {(filterMetaLoading || filterMetaError) && (
        <div className={`${compact ? 'p-2' : 'p-3'} border-b ${filterMetaError ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[var(--card)] border-[var(--border)]'}`}>
          <div className={`${compact ? 'text-xs' : 'text-sm'} ${filterMetaError ? 'text-amber-400' : 'text-[var(--muted)]'}`}>
            {filterMetaError ? (
              <div className="flex items-center gap-2">
                <span>Filter data unavailable; special filters temporarily disabled.</span>
                <button
                  onClick={onRetryFilterMeta}
                  className="px-2 py-1 text-xs rounded border bg-transparent border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                  disabled={!!filterMetaLoading}
                >
                  Retry
                </button>
              </div>
            ) : (
              <span>Loading filter metadata...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FiltersBar;
