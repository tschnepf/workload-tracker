import React, { useEffect, useMemo, useRef, useState } from 'react';
import { darkTheme } from '@/theme/tokens';
import { departmentsApi } from '@/services/api';
import type { Department } from '@/types/models';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';

const INPUT_ID = 'global-dept-filter-input';
const DESC_ID = 'global-dept-filter-include-children-help';
const LIVE_ID = 'global-dept-filter-live';

export const GlobalDepartmentFilter: React.FC = () => {
  const { state, setDepartment, clearDepartment, setIncludeChildren } = useDepartmentFilter();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combobox state
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch departments once
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const page = await departmentsApi.list({ page: 1, page_size: 500 });
        if (!active) return;
        setDepartments((page.results || []) as Department[]);
      } catch (e: any) {
        if (!active) return;
        setError('Failed to load departments');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
    setDepartment(dep.id!);
    setOpen(false);
    setQuery('');
    setShowAll(false);
    announce(`Department filter set to ${dep.name}`);
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

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: darkTheme.colors.background.tertiary,
    color: darkTheme.colors.text.primary,
    border: `1px solid ${darkTheme.colors.border.primary}`,
    borderRadius: '6px',
    padding: '6px 8px',
    minWidth: 220,
    outline: 'none',
  };

  const listboxStyle: React.CSSProperties = {
    position: 'absolute',
    // Ensure combobox overlays sticky headers (Assignments header uses z-30)
    zIndex: 60,
    marginTop: 4,
    maxHeight: 280,
    overflowY: 'auto',
    width: '100%',
    backgroundColor: darkTheme.colors.background.tertiary,
    border: `1px solid ${darkTheme.colors.border.primary}`,
    borderRadius: '6px',
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: darkTheme.colors.background.tertiary,
    color: darkTheme.colors.text.secondary,
    border: `1px solid ${darkTheme.colors.border.secondary}`,
    borderRadius: '6px',
    padding: '6px 8px',
  };

  const selectedDeptName = useMemo(() => {
    if (state.selectedDepartmentId == null) return null;
    const dep = departments.find(d => d.id === state.selectedDepartmentId);
    return dep?.name ?? `#${state.selectedDepartmentId}`;
  }, [state.selectedDepartmentId, departments]);

  return (
    <div style={containerStyle} aria-label="Global department filter area">
      {/* Active badge with clear */}
      {state.selectedDepartmentId != null && (
        <div
          style={{
            backgroundColor: darkTheme.colors.background.tertiary,
            color: darkTheme.colors.text.secondary,
            border: `1px solid ${darkTheme.colors.border.secondary}`,
            borderRadius: '999px',
            padding: '2px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>Dept: {selectedDeptName}</span>
          <button
            onClick={handleClear}
            aria-label="Clear department filter"
            style={{
              background: 'transparent',
              color: darkTheme.colors.text.secondary,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Combobox */}
      <div style={{ position: 'relative' }}>
        <input
          id={INPUT_ID}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-dept-filter-listbox"
          aria-autocomplete="list"
          aria-label="Global department filter"
          placeholder={loading ? 'Loading departments…' : 'Search departments'}
          disabled={loading}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          style={inputStyle}
        />
        {open && (
          <div
            ref={listRef}
            id="global-dept-filter-listbox"
            role="listbox"
            style={listboxStyle}
          >
            {error && (
              <div style={{ padding: 8, color: darkTheme.colors.semantic.error }}>Error: {error}</div>
            )}
            {!error && results.length === 0 && (
              <div style={{ padding: 8, color: darkTheme.colors.text.muted }}>No results</div>
            )}
            {!error && results.map((dep, idx) => (
              <div
                key={dep.id}
                role="option"
                aria-selected={idx === highlightIndex}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(dep); }}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  backgroundColor: idx === highlightIndex ? darkTheme.colors.background.elevated : 'transparent',
                  color: darkTheme.colors.text.primary,
                }}
              >
                {dep.name}
              </div>
            ))}
            {!showAll && filtered.length > LIMITED && (
              <div style={{ padding: 8, display: 'flex', justifyContent: 'center' }}>
                <button style={buttonStyle} onMouseDown={(e) => { e.preventDefault(); setShowAll(true); }}>Show more</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Include sub-departments */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          id="global-include-children"
          type="checkbox"
          checked={state.selectedDepartmentId != null && state.includeChildren}
          onChange={(e) => setIncludeChildren(e.target.checked)}
          aria-describedby={DESC_ID}
          disabled={state.selectedDepartmentId == null}
        />
        <label htmlFor="global-include-children" style={{ color: darkTheme.colors.text.secondary }}>Include sub-departments</label>
      </div>
      <span id={DESC_ID} style={{ position: 'absolute', left: -9999 }}>
        When enabled, includes all child departments under the selected department in totals.
      </span>

      {/* Copy link */}
      <button onClick={handleCopyLink} aria-label="Copy link to current filter" style={buttonStyle}>Copy link</button>

      {/* live region */}
      <div id={LIVE_ID} ref={liveRef} aria-live="polite" style={{ position: 'absolute', left: -9999 }} />
    </div>
  );
};

export default GlobalDepartmentFilter;
