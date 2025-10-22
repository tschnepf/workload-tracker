import React from 'react';
import Card from '@/components/ui/Card';
import { typeColors } from '@/components/deliverables/calendar.utils';

interface Props {
  top: number;
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

const DeliverableLegendFloating: React.FC<Props> = ({ top }) => {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try { return localStorage.getItem('assignGrid:legendCollapsed') === '1'; } catch { return false; }
  });

  const toggle = () => {
    setCollapsed(v => { const n = !v; try { localStorage.setItem('assignGrid:legendCollapsed', n ? '1' : '0'); } catch {} return n; });
  };

  return (
    <div className="hidden xl:block fixed right-4 z-30" style={{ top }}>
      <Card className="relative bg-[var(--card)] border-[var(--border)] shadow-lg min-w-[200px]">
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show legend' : 'Hide legend'}
          className="absolute left-2 top-1 w-5 h-5 rounded text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surfaceHover)] flex items-center justify-center text-xs"
        >
          {collapsed ? '+' : '−'}
        </button>
        <div className="px-3 py-1 pl-7 border-b border-[var(--border)]">
          <div className="text-[var(--text)] text-sm font-semibold leading-none">Deliverable Types</div>
        </div>
        {!collapsed && (
          <div className="p-3 text-xs space-y-2">
            {rows.map(([label, key]) => (
              <div key={key} className="flex items-center gap-2 text-[var(--text)]">
                <span className="inline-block w-3 h-3 rounded" style={{ background: (typeColors as any)[key] }} />
                {label}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default DeliverableLegendFloating;
