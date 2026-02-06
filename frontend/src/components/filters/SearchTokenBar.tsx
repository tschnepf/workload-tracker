import * as React from 'react';
import type { SearchToken, SearchTokenOp } from '@/hooks/useSearchTokens';

type Props = {
  id: string;
  label: string;
  placeholder?: string;
  tokens: SearchToken[];
  activeTokenId: string | null;
  searchOp: SearchTokenOp;
  searchInput: string;
  onInputChange: (value: string) => void;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTokenSelect: (id: string) => void;
  onTokenRemove: (id: string) => void;
  onSearchOpChange: (op: SearchTokenOp) => void;
  className?: string;
};

const SearchTokenBar: React.FC<Props> = ({
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
}) => {
  const activeToken = activeTokenId ? tokens.find((token) => token.id === activeTokenId) ?? null : null;

  return (
    <div className={className}>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className="flex items-stretch bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center border-r border-[var(--border)] bg-[var(--surface)] px-2">
          <select
            className="bg-transparent text-[11px] uppercase tracking-wide text-[var(--muted)] focus:outline-none"
            value={activeToken?.op ?? searchOp}
            onChange={(e) => onSearchOpChange(e.target.value as SearchTokenOp)}
            aria-label={activeToken ? 'Set operator for selected filter' : 'Set operator for new filter'}
          >
            <option value="or">OR</option>
            <option value="and">AND</option>
            <option value="not">NOT</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1 px-2 py-1 flex-1 min-w-0">
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
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            className="flex-1 min-w-[140px] px-1 py-0.5 text-base lg:text-sm bg-transparent text-[var(--text)] placeholder-[var(--muted)] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

export default SearchTokenBar;
