import React, { useEffect, useRef } from 'react';

export type QaPersonOption = { id: number; name: string; roleName?: string | null; department?: number | null };

interface QaAssignmentEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSelect: (person: QaPersonOption) => void;
  onUnassign?: () => void;
  showUnassign?: boolean;
  results: QaPersonOption[];
  searching: boolean;
  saving?: boolean;
  error?: string | null;
}

const QaAssignmentEditor: React.FC<QaAssignmentEditorProps> = ({
  value,
  onChange,
  onClose,
  onSelect,
  onUnassign,
  showUnassign = false,
  results,
  searching,
  saving,
  error,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const didAutoSelectRef = useRef(false);

  useEffect(() => {
    if (!inputRef.current) return;
    if (!value || didAutoSelectRef.current) return;
    requestAnimationFrame(() => {
      try { inputRef.current?.select(); } catch {}
    });
    didAutoSelectRef.current = true;
  }, [value]);

  const hasQuery = value.trim().length >= 2;
  const showDropdown = searching || hasQuery || showUnassign;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (value) {
            requestAnimationFrame(() => {
              try { inputRef.current?.select(); } catch {}
            });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Search QA (min 2 chars)"
        className="w-full bg-transparent border-none p-0 m-0 text-xs text-[var(--text)] placeholder-[var(--muted)] outline-none focus:outline-none focus:ring-0"
      />
      {showDropdown ? (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg max-h-40 overflow-auto">
          {showUnassign ? (
            <button
              type="button"
              className="w-full text-left px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surfaceHover)]"
              onClick={onUnassign}
              disabled={!onUnassign}
            >
              Unassign
            </button>
          ) : null}
          {(() => {
            if (!hasQuery) return null;
            if (searching) {
              return <div className="px-2 py-1 text-[11px] text-[var(--muted)]">Searching…</div>;
            }
            if (results.length === 0) {
              return <div className="px-2 py-1 text-[11px] text-[var(--muted)]">No matches</div>;
            }
            return (
              <div className="py-1">
                {results.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="w-full text-left px-2 py-1 text-[11px] hover:bg-[var(--surfaceHover)]"
                    onClick={() => onSelect(person)}
                  >
                    <div className="text-[var(--text)]">{person.name}</div>
                    <div className="text-[10px] text-[var(--muted)]">{person.roleName || 'Role not set'}</div>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      ) : null}
      {value.trim().length < 2 ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">Type at least 2 characters to search</div>
      ) : null}
      {saving ? (
        <div className="mt-1 text-[10px] text-[var(--muted)]">Saving…</div>
      ) : null}
      {error ? (
        <div className="mt-1 text-[10px] text-red-400">{error}</div>
      ) : null}
    </div>
  );
};

export default QaAssignmentEditor;
