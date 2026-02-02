import React from 'react';

interface Props {
  statusOptions: readonly string[];
  selectedStatusFilters: Set<string>;
  onToggleStatus: (status: string) => void;
  searchTokens: Array<{ id: string; term: string; op: 'or' | 'and' | 'not' }>;
  searchInput: string;
  searchOp: 'or' | 'and' | 'not';
  activeTokenId: string | null;
  onSearchInput: (value: string) => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSearchOpChange: (op: 'or' | 'and' | 'not') => void;
  onSelectToken: (id: string | null) => void;
  onRemoveToken: (id: string) => void;
  formatFilterStatus: (status: string) => string;
  filterMetaLoading?: boolean;
  filterMetaError?: string | null;
  onRetryFilterMeta?: () => void;
  rightSlot?: React.ReactNode;
}

const FiltersBar: React.FC<Props> = ({
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
}) => {
  const activeToken = activeTokenId ? (searchTokens.find((token) => token.id === activeTokenId) || null) : null;

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

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <label className="sr-only" htmlFor="projects-search">Search projects</label>
          <div className="flex items-stretch bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center border-r border-[var(--border)] bg-[var(--surface)] px-2">
              <select
                className="bg-transparent text-[11px] uppercase tracking-wide text-[var(--muted)] focus:outline-none"
                value={activeToken?.op ?? searchOp}
                onChange={(e) => onSearchOpChange(e.target.value as 'or' | 'and' | 'not')}
                aria-label={activeToken ? 'Set operator for selected filter' : 'Set operator for new filter'}
              >
                <option value="or">OR</option>
                <option value="and">AND</option>
                <option value="not">NOT</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1 px-2 py-1 flex-1 min-w-0">
              {searchTokens.map((token) => {
                const isActive = token.id === activeTokenId;
                return (
                  <div
                    key={token.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectToken(token.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectToken(token.id);
                      }
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
                      isActive
                        ? 'border-[var(--primary)] bg-[var(--surfaceHover)] text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    title={`${token.op.toUpperCase()} ${token.term}`}
                  >
                    <span className="text-[10px] uppercase tracking-wide">{token.op}</span>
                    <span className="max-w-[140px] truncate text-[var(--text)]">{token.term}</span>
                    <button
                      type="button"
                      className="ml-0.5 text-[var(--muted)] hover:text-[var(--text)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveToken(token.id);
                      }}
                      aria-label={`Remove ${token.term}`}
                    >
                      x
                    </button>
                  </div>
                );
              })}
              <input
                id="projects-search"
                type="text"
                value={searchInput}
                onChange={(e) => {
                  onSearchInput(e.target.value);
                  onSelectToken(null);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchTokens.length ? 'Add another filter...' : 'Search projects by client, name, or number (Enter)'}
                className="flex-1 min-w-[160px] px-1 py-0.5 text-sm bg-transparent text-[var(--text)] placeholder-[var(--muted)] focus:outline-none"
              />
            </div>
          </div>
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
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
              <span>Loading filter metadata...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FiltersBar;
