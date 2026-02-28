import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  weeksValue: number;
  onWeeksChange: (next: number) => void;
  statusOptions: readonly string[];
  selectedStatuses: Set<string>;
  formatStatus: (status: string) => string;
  onToggleStatus: (status: string) => void;
  buttonLabel?: string;
  buttonTitle?: string;
  className?: string;
  align?: 'left' | 'right';
  minWeeks?: number;
  maxWeeks?: number;
  defaultWeeks?: number;
}

const clampWeeks = (value: number, minWeeks: number, maxWeeks: number) => {
  if (!Number.isFinite(value)) return minWeeks;
  return Math.max(minWeeks, Math.min(maxWeeks, value));
};

const AssignmentsFilterMenu: React.FC<Props> = ({
  weeksValue,
  onWeeksChange,
  statusOptions,
  selectedStatuses,
  formatStatus,
  onToggleStatus,
  buttonLabel = 'Filter',
  buttonTitle = 'Open filters',
  className,
  align = 'right',
  minWeeks = 1,
  maxWeeks = 52,
  defaultWeeks = 20,
}) => {
  const [open, setOpen] = useState(false);
  const [weeksInput, setWeeksInput] = useState(String(weeksValue));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });
  const MENU_MAX_WIDTH = 320;

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(MENU_MAX_WIDTH, Math.max(220, window.innerWidth - 24));
    const preferredLeft = align === 'left' ? rect.left : rect.right - width;
    const left = Math.min(
      Math.max(12, preferredLeft),
      Math.max(12, window.innerWidth - width - 12)
    );
    setMenuPos({ top: rect.bottom + 4, left, width });
  }, [align]);

  useEffect(() => {
    setWeeksInput(String(weeksValue));
  }, [weeksValue]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  const commitWeeks = useCallback(() => {
    if (!weeksInput.trim()) {
      setWeeksInput(String(weeksValue));
      return;
    }
    const parsed = Number.parseInt(weeksInput, 10);
    if (Number.isNaN(parsed)) {
      setWeeksInput(String(weeksValue));
      return;
    }
    const clamped = clampWeeks(parsed, minWeeks, maxWeeks);
    setWeeksInput(String(clamped));
    if (clamped !== weeksValue) onWeeksChange(clamped);
  }, [weeksInput, weeksValue, minWeeks, maxWeeks, onWeeksChange]);

  const showAllActive = selectedStatuses.size === 0 || selectedStatuses.has('Show All');
  const selectedStatusCount = Array.from(selectedStatuses).filter((status) => status !== 'Show All').length;
  const activeCount = selectedStatusCount + (weeksValue !== defaultWeeks ? 1 : 0);
  const buttonText = activeCount > 0 ? `${buttonLabel} (${activeCount})` : buttonLabel;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className || ''}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Toggle filter menu"
        title={buttonTitle}
        className="h-10 px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        {buttonText}
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[1200] rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg p-2"
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          role="dialog"
          aria-label="Assignment filters"
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Weeks</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={minWeeks}
                  max={maxWeeks}
                  value={weeksInput}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === '') {
                      setWeeksInput('');
                      return;
                    }
                    if (!/^\d+$/.test(next)) return;
                    setWeeksInput(next);
                  }}
                  onBlur={commitWeeks}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitWeeks();
                    }
                  }}
                  aria-label="Weeks horizon"
                  className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
                <span className="text-xs text-[var(--muted)]">weeks</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Status</div>
              <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 scrollbar-theme">
                {statusOptions.map((status) => {
                  const isActive = status === 'Show All' ? showAllActive : selectedStatuses.has(status);
                  const label = formatStatus(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => onToggleStatus(status)}
                      className={`w-full text-left px-2 py-1 rounded border text-xs transition-colors ${
                        isActive
                          ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                      }`}
                      aria-pressed={isActive}
                      aria-label={`Filter status ${label}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};

export default AssignmentsFilterMenu;
