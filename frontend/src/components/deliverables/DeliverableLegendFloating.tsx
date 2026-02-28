import React from 'react';
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
  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
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
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle deliverable types legend"
        aria-expanded={open}
        title={buttonTitle}
        className="h-10 px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        {buttonLabel}
      </button>
      {open ? (
        <div
          className={`absolute top-full ${align === 'left' ? 'left-0' : 'right-0'} mt-1 z-40 min-w-[220px] rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg p-2`}
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
        </div>
      ) : null}
    </div>
  );
};

export default DeliverableLegendFloating;
