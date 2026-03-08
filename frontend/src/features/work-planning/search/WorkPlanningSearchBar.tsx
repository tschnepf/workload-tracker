import * as React from 'react';
import type { WorkPlanningSearchOp, WorkPlanningSearchToken } from '@/features/work-planning/search/useWorkPlanningSearchTokens';

type Props = {
  id: string;
  label: string;
  placeholder?: string;
  tokens: WorkPlanningSearchToken[];
  activeTokenId: string | null;
  searchOp: WorkPlanningSearchOp;
  searchInput: string;
  onInputChange: (value: string) => void;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTokenSelect: (id: string | null) => void;
  onTokenRemove: (id: string) => void;
  onSearchOpChange: (op: WorkPlanningSearchOp) => void;
  className?: string;
  compact?: boolean;
  tokenLayout?: 'scroll' | 'wrap';
  hint?: React.ReactNode;
  tooltip?: React.ReactNode;
};

const WorkPlanningSearchBar: React.FC<Props> = ({
  id,
  label,
  placeholder,
  tokens,
  activeTokenId,
  searchOp,
  searchInput,
  onInputChange,
  onInputKeyDown,
  onTokenSelect,
  onTokenRemove,
  onSearchOpChange,
  className,
  compact = false,
  tokenLayout = 'scroll',
  hint,
  tooltip,
}) => {
  const activeToken = activeTokenId ? tokens.find((token) => token.id === activeTokenId) ?? null : null;

  return (
    <div className={className}>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className={`flex items-stretch bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden ${compact ? '' : 'h-10'}`}>
        <div className={`flex items-center border-r border-[var(--border)] bg-[var(--surface)] ${compact ? 'px-1.5' : 'px-2'}`}>
          <select
            className={`bg-transparent uppercase tracking-wide text-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)] ${compact ? 'text-[10px]' : 'text-[11px]'}`}
            value={activeToken?.op ?? searchOp}
            onChange={(e) => onSearchOpChange(e.target.value as WorkPlanningSearchOp)}
            aria-label={activeToken ? 'Set operator for selected filter' : 'Set operator for new filter'}
          >
            <option value="or">OR</option>
            <option value="and">AND</option>
            <option value="not">NOT</option>
          </select>
        </div>
        <div
          className={tokenLayout === 'wrap'
            ? `flex flex-wrap items-center gap-1 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} flex-1 min-w-0`
            : `flex items-center gap-1 ${compact ? 'px-1.5 py-0.5' : 'px-2'} flex-1 min-w-0 overflow-x-auto whitespace-nowrap scrollbar-theme`
          }
        >
          {tokens.map((token) => {
            const isActive = token.id === activeTokenId;
            return (
              <div
                key={token.id}
                role="button"
                tabIndex={0}
                onClick={() => onTokenSelect(token.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTokenSelect(token.id);
                  }
                }}
                className={`inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0' : 'px-2 py-0.5'} rounded-full border text-[11px] ${tokenLayout === 'scroll' ? 'shrink-0' : ''} ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--surfaceHover)] text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]`}
                title={`${token.op.toUpperCase()} ${token.term}`}
              >
                <span className="text-[10px] uppercase tracking-wide">{token.op}</span>
                <span className="max-w-[140px] truncate text-[var(--text)]">{token.term}</span>
                <button
                  type="button"
                  className="ml-0.5 text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTokenRemove(token.id);
                  }}
                  aria-label={`Remove ${token.term}`}
                >
                  x
                </button>
              </div>
            );
          })}
          <input
            id={id}
            type="text"
            value={searchInput}
            onChange={(e) => {
              onInputChange(e.target.value);
              onTokenSelect(null);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            className={`flex-1 ${compact ? 'min-w-[120px]' : 'min-w-[140px]'} px-1 ${compact ? 'py-0.5 text-xs' : 'text-base lg:text-sm'} bg-transparent text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)]`}
          />
        </div>
      </div>
      {tooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-[340px] max-w-[95vw] rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[10px] text-[var(--muted)] shadow-lg group-hover:block group-focus-within:block"
        >
          {tooltip}
        </div>
      ) : null}
      {hint ? <div className="mt-0.5 text-[10px] text-amber-500">{hint}</div> : null}
    </div>
  );
};

export default WorkPlanningSearchBar;
