import React from 'react';
import { usePeopleAutocomplete } from '@/hooks/usePeople';

type PersonOption = {
  id: number;
  name: string;
  department?: number | null;
};

type Props = {
  label: string;
  deptId: number | null | undefined;
  onSelect: (person: PersonOption) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
};

const PlaceholderPersonSwap: React.FC<Props> = ({ label, deptId, onSelect, className, disabled }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const canOpen = !disabled;
  const { people, loading } = usePeopleAutocomplete(query, deptId ? { department: deptId } : undefined);
  const peopleOptions = React.useMemo(
    () => (people || [])
      .filter((person) => person?.id != null)
      .map((person) => ({ ...person, id: person.id as number })),
    [people]
  );

  React.useEffect(() => {
    if (!open) return;
    const focusTimer = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (boxRef.current && target && !boxRef.current.contains(target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  const handleSelect = async (person: PersonOption) => {
    setSaving(true);
    try {
      await onSelect(person);
    } finally {
      setSaving(false);
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="relative inline-block" ref={boxRef}>
      <button
        type="button"
        className={className || 'text-xs text-[var(--text)]'}
        disabled={!canOpen}
        onClick={(e) => {
          e.stopPropagation();
          if (!canOpen) return;
          setOpen((v) => !v);
        }}
        title={canOpen ? 'Replace placeholder with a person' : 'Replace placeholder with a person'}
      >
        {label}
      </button>
      {open && canOpen && (
        <div className="absolute z-50 mt-1 w-64 rounded border border-[var(--border)] bg-[var(--card)] shadow-lg p-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
            ref={inputRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
                setQuery('');
              }
            }}
          />
          <div className="mt-2 max-h-48 overflow-auto">
            {query.trim().length < 2 && (
              <div className="text-[11px] text-[var(--muted)] px-1">Type at least 2 characters.</div>
            )}
            {query.trim().length >= 2 && loading && (
              <div className="text-[11px] text-[var(--muted)] px-1">Searching…</div>
            )}
            {query.trim().length >= 2 && !loading && peopleOptions.length === 0 && (
              <div className="text-[11px] text-[var(--muted)] px-1">No matches.</div>
            )}
            {query.trim().length >= 2 && peopleOptions.map((person) => (
              <button
                key={person.id}
                type="button"
                className="w-full text-left px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--cardHover)]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(person);
                }}
                disabled={saving}
              >
                {person.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaceholderPersonSwap;
