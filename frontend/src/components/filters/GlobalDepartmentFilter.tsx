import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// Tokenized: use CSS variables (themes.css) instead of fixed dark theme
import type { Department } from '@/types/models';
import { useDepartmentFilter, type DepartmentFilterOp } from '@/hooks/useDepartmentFilter';
import { useDepartments } from '@/hooks/useDepartments';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import Select from '@/components/ui/Select';

const INPUT_ID = 'global-dept-filter-input';
const LIVE_ID = 'global-dept-filter-live';

type Props = {
  rightActions?: React.ReactNode;
  showCopyLink?: boolean;
  expand?: boolean;
  departmentsOverride?: Department[];
};

export const GlobalDepartmentFilter: React.FC<Props> = ({ rightActions, showCopyLink = false, expand = true, departmentsOverride }) => {
  const { state, addDepartmentFilter, removeDepartmentFilter, clearDepartment } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();

  const { departments: fetchedDepartments, isLoading: loading, error } = useDepartments({
    enabled: !departmentsOverride,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });
  const departments = departmentsOverride ?? fetchedDepartments;

  // Combobox state
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [selectedOp, setSelectedOp] = useState<DepartmentFilterOp>('and');
  const liveRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);

  // Departments are loaded via React Query hook

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 100);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => {
    const base = departments;
    if (!debouncedQuery) return base;
    return base.filter((d) => d.name?.toLowerCase().includes(debouncedQuery));
  }, [departments, debouncedQuery]);

  const LIMITED = 50;
  const results = showAll ? filtered : filtered.slice(0, LIMITED);

  useEffect(() => {
    // reset highlight when list changes
    setHighlightIndex(0);
  }, [debouncedQuery, showAll, open]);

  // Announce updates to screen readers
  function announce(msg: string) {
    const node = liveRef.current;
    if (!node) return;
    node.textContent = '';
    // slight delay ensures live region change is detected
    setTimeout(() => { node.textContent = msg; }, 30);
  }

  function handleSelect(dep: Department) {
    addDepartmentFilter(dep.id!, selectedOp);
    setOpen(false);
    setQuery('');
    setShowAll(false);
    announce(`Added ${selectedOp.toUpperCase()} ${dep.name}`);
  }

  function handleClear() {
    clearDepartment();
    setQuery('');
    setShowAll(false);
    announce('Department filter cleared');
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      announce('Link copied to clipboard');
    } catch {
      // Fallback: select URL in address bar is not possible programmatically across browsers, announce failure
      announce('Unable to copy link; please copy from address bar');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    const total = results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1 < total ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 >= 0 ? i - 1 : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightIndex(total - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 10, total - 1));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 10, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const dep = results[highlightIndex];
      if (dep) handleSelect(dep);
    } else if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        setOpen(false);
      }
    }
  }

  useEffect(() => {
    // Close popover on outside click
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (inputRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const listboxStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    maxHeight: 280,
    overflowY: 'auto',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
  };
  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (departments || []).forEach((d) => {
      if (d.id != null) map.set(d.id, d.name || `#${d.id}`);
    });
    return map;
  }, [departments]);

  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect({ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 220) });
    } else {
      setDropdownRect(null);
    }
  }, [open, query, state.selectedDepartmentId, showAll]);

  return (
    <div
      className={`flex items-center gap-2 ${expand ? 'min-w-0 flex-1' : 'flex-none'} flex-wrap`}
      aria-label="Global department filter area"
      style={{ position: 'relative' }}
    >
      {/* Active filters */}
      {state.filters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {state.filters.map((filter) => {
            const name = departmentNameById.get(filter.departmentId) || `#${filter.departmentId}`;
            return (
              <div
                key={`${filter.op}-${filter.departmentId}`}
                className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] sm:text-sm"
              >
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">{filter.op}</span>
                <span className="max-w-[160px] truncate">{name}</span>
                <button
                  onClick={() => removeDepartmentFilter(filter.departmentId)}
                  aria-label={`Remove ${filter.op.toUpperCase()} ${name}`}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus:outline-none"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            onClick={handleClear}
            aria-label="Clear department filters"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Combobox */}
      <div className="flex min-w-0 items-center gap-2">
        <Select
          aria-label="Department filter operation"
          value={selectedOp}
          onChange={(e) => setSelectedOp((e.target as HTMLSelectElement).value as DepartmentFilterOp)}
          size="sm"
          className="w-[78px] sm:w-[86px]"
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
          <option value="not">NOT</option>
        </Select>
        <div className={`relative ${expand ? 'min-w-[180px] flex-1 max-w-[320px]' : 'w-[140px] max-w-[200px] shrink-0 sm:w-[220px] sm:max-w-[260px]'}`}>
        <input
          id={INPUT_ID}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-dept-filter-listbox"
          aria-autocomplete="list"
          aria-label="Global department filter"
          placeholder={loading ? 'Loading…' : 'Dept. Filter'}
          disabled={loading}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`relative z-50 h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-0 ${expand ? '' : 'min-w-[100px]'}`}
        />
        {open && dropdownRect &&
          createPortal(
            <div
              ref={listRef}
              id="global-dept-filter-listbox"
              role="listbox"
              style={{ ...listboxStyle, left: dropdownRect.left, top: dropdownRect.top, width: dropdownRect.width }}
            >
              {error && (
                <div style={{ padding: 8, color: 'var(--color-state-danger)' }}>Error: {error}</div>
              )}
              {!error && results.length === 0 && (
                <div style={{ padding: 8, color: 'var(--color-text-secondary)' }}>No results</div>
              )}
              {!error && results.map((dep, idx) => (
                <div
                  key={dep.id}
                  role="option"
                  aria-selected={idx === highlightIndex}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(dep); }}
                  className={`px-2 py-1 cursor-pointer text-[var(--color-text-primary)] ${idx === highlightIndex ? 'bg-[var(--color-surface-overlay)]' : ''}`}
                >
                  {dep.name}
                </div>
              ))}
              {!showAll && filtered.length > LIMITED && (
                <div className="p-2 flex justify-center">
                  <button
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                    onMouseDown={(e) => { e.preventDefault(); setShowAll(true); }}
                  >
                    Show more
                  </button>
                </div>
              )}
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Include sub-departments removed per request */}

      {/* Right-side actions */}
      {rightActions ? (
        <div className="flex items-center gap-2">
          {rightActions}
        </div>
      ) : (
        showCopyLink && (
          <button
            onClick={handleCopyLink}
            aria-label="Copy link to current filter"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
          >
            Copy link
          </button>
        )
      )}

      {/* live region */}
      <div id={LIVE_ID} ref={liveRef} aria-live="polite" style={{ position: 'absolute', left: -9999 }} />
    </div>
  );
};

export default GlobalDepartmentFilter;
