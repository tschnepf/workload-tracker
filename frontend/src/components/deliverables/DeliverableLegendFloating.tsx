import React from 'react';
import { createPortal } from 'react-dom';
import { typeColors } from '@/components/deliverables/calendar.utils';

interface Props {
  buttonLabel?: string;
  buttonTitle?: string;
  className?: string;
  align?: 'left' | 'right';
}

const rows: Array<[string, string]> = [
  ['Bulletin', 'bulletin'],
  ['CD', 'cd'],
  ['DD', 'dd'],
  ['IFC', 'ifc'],
  ['IFP', 'ifp'],
  ['Masterplan', 'masterplan'],
  ['SD', 'sd'],
  ['Milestone', 'milestone'],
  ['Pre-Deliverable', 'pre_deliverable'],
];

const DeliverableLegendFloating: React.FC<Props> = ({ buttonLabel = 'Deliverable Types', buttonTitle = 'Deliverable Types', className, align = 'right' }) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = React.useState<{ top: number; left: number } | null>(null);
  const PANEL_WIDTH = 220;

  const updatePanelPosition = React.useCallback(() => {
    if (!buttonRef.current || typeof window === 'undefined') return;
    const rect = buttonRef.current.getBoundingClientRect();
    const margin = 8;
    const rawLeft = align === 'left' ? rect.left : rect.right - PANEL_WIDTH;
    const maxLeft = Math.max(margin, window.innerWidth - PANEL_WIDTH - margin);
    const left = Math.min(Math.max(rawLeft, margin), maxLeft);
    const top = rect.bottom + 6;
    setPanelPos({ top, left });
  }, [align]);

  React.useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onViewportChange = () => updatePanelPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      if (panelRef.current?.contains(event.target as Node)) return;
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

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className || ''}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle deliverable types legend"
        aria-expanded={open}
        title={buttonTitle}
        className="h-10 px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        {buttonLabel}
      </button>
      {open && panelPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[1400] min-w-[220px] rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg p-2"
              style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
              role="dialog"
              aria-label="Deliverable Types legend"
            >
              <div className="text-[var(--text)] text-xs font-semibold pb-1 border-b border-[var(--border)]">Deliverable Types</div>
              <div className="pt-1 text-xs space-y-1">
                {rows.map(([label, key]) => (
                  <div key={key} className="flex items-center gap-2 text-[var(--text)]">
                    <span className="inline-block w-3 h-3 rounded" style={{ background: (typeColors as any)[key] }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default DeliverableLegendFloating;
