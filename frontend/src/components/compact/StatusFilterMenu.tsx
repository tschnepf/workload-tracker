import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  statusOptions: readonly string[];
  selectedStatuses: Set<string>;
  formatStatus: (status: string) => string;
  onToggleStatus: (status: string) => void;
  buttonLabel?: string;
  buttonTitle?: string;
  align?: 'left' | 'right';
  className?: string;
}

const StatusFilterMenu: React.FC<Props> = ({
  statusOptions,
  selectedStatuses,
  formatStatus,
  onToggleStatus,
  buttonLabel = 'Filter',
  buttonTitle = 'Open filters',
  align = 'right',
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });
  const MENU_MAX_WIDTH = 320;

  const updateMenuPosition = React.useCallback(() => {
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

  React.useEffect(() => {
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

  React.useEffect(() => {
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

  const showAllActive = selectedStatuses.size === 0 || selectedStatuses.has('Show All');
  const selectedCount = Array.from(selectedStatuses).filter((status) => status !== 'Show All').length;
  const buttonText = selectedCount > 0 ? `${buttonLabel} (${selectedCount})` : buttonLabel;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className || ''}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Toggle status filter menu"
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
          aria-label="Project status filters"
        >
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-1">Status</div>
          <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1 scrollbar-theme">
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
        </div>,
        document.body
      ) : null}
    </div>
  );
};

export default StatusFilterMenu;
