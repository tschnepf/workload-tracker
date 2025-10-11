import React from 'react';

interface Props {
  statusOptions: readonly string[];
  selectedStatusFilters: Set<string>;
  onToggleStatus: (status: string) => void;
  searchTerm: string;
  onSearchTerm: (term: string) => void;
  formatFilterStatus: (status: string) => string;
  filterMetaLoading?: boolean;
  filterMetaError?: string | null;
  onRetryFilterMeta?: () => void;
}

const FiltersBar: React.FC<Props> = ({
  statusOptions,
  selectedStatusFilters,
  onToggleStatus,
  searchTerm,
  onSearchTerm,
  formatFilterStatus,
  filterMetaLoading,
  filterMetaError,
  onRetryFilterMeta,
}) => {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-[var(--muted)] mb-1 block">Filter by Status:</label>
        <div className="flex flex-wrap gap-1">
          {statusOptions.map((status) => {
            const isActive = selectedStatusFilters.has(status);
            return (
              <button
                key={status}
                onClick={() => onToggleStatus(status)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
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

      <div>
        <input
          type="text"
          placeholder="Search projects"
          value={searchTerm}
          onChange={(e) => onSearchTerm(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {(filterMetaLoading || filterMetaError) && (
        <div className={`p-3 border-b ${filterMetaError ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[var(--card)] border-[var(--border)]'}`}>
          <div className={`text-sm ${filterMetaError ? 'text-amber-400' : 'text-[var(--muted)]'}`}>
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
              <span>Loading filter metadata…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FiltersBar;
