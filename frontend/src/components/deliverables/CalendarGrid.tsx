import React from 'react';
import { useProjectQuickViewPopover } from '@/components/projects/quickview';
import { useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { fmtDate, typeColors, classify, buildEventLabel, buildPreLabel, startOfWeekSunday } from './calendar.utils';
import { formatDateWithWeekday } from '@/utils/dates';

// Presentational pill for a single deliverable
type PillProps = {
  ev: any;
  pid: number | null;
  dim: boolean;
  onHover: (pid: number) => void;
  onClear: () => void;
  onKey: (pid: number | null, e: React.KeyboardEvent<HTMLDivElement>) => void;
};

const DeliverablePill: React.FC<PillProps> = ({ ev, pid, dim, onHover, onClear, onKey }) => {
  const color = typeColors[classify(ev)] || typeColors.milestone;
  const label = buildEventLabel(ev);
  const when = formatDateWithWeekday((ev as any)?.date as string | undefined);
  const { open } = useProjectQuickViewPopover();
  const queryClient = useQueryClient();
  const prefetchTimerRef = React.useRef<number | null>(null);
  // Prevent re-triggering hover when focus is programmatically restored to the pill
  // after closing the popover (common a11y pattern). We set this flag on mouse down/click
  // and skip the next focus-induced hover.
  const ignoreNextFocusRef = React.useRef(false);
  return (
    <div
      key={`deliverable-${ev.id}-${ev.date}`}
      title={when ? `${when} — ${label}` : label}
      role="button"
      tabIndex={0}
      onMouseDown={() => { ignoreNextFocusRef.current = true; }}
      onMouseEnter={() => {
        if (pid != null) {
          onHover(pid);
          // light prefetch for faster popover open
          if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
          prefetchTimerRef.current = window.setTimeout(() => {
            queryClient.ensureQueryData({ queryKey: ['projects', pid], queryFn: () => projectsApi.get(pid) });
          }, 120);
        }
      }}
      onFocus={() => {
        if (ignoreNextFocusRef.current) { ignoreNextFocusRef.current = false; return; }
        if (pid != null) onHover(pid);
      }}
      onBlur={onClear}
      onMouseLeave={onClear}
      onKeyDown={(e) => onKey(pid, e)}
      onClick={(e) => {
        if (pid != null) {
          ignoreNextFocusRef.current = true; // ensure focus restore does not re-hover
          e.stopPropagation?.();
          open(pid, e.currentTarget as HTMLElement, { placement: 'center' });
        }
      }}
      className={`text-xs text-white rounded px-2 py-1 truncate ${dim ? 'opacity-5 transition-opacity duration-300' : ''}`}
      style={{ background: color }}
    >
      {label}
    </div>
  );
};

// Presentational card for a grouped pre-deliverable block (single or multi)
type PreGroupProps = {
  arr: any[];        // items in the group (same project)
  dayKey: string;    // YYYY-MM-DD of the day cell
  pid: number | null;
  dim: boolean;
  onHover: (pid: number) => void;
  onClear: () => void;
  onKey: (pid: number | null, e: React.KeyboardEvent<HTMLDivElement>) => void;
};

const PreDeliverableGroupCard: React.FC<PreGroupProps> = ({ arr, dayKey, pid, dim, onHover, onClear, onKey }) => {
  const first = arr[0] as any;
  const projectName = (first.projectName || '').trim();
  const projectClient = (first.projectClient || '').trim();
  const color = typeColors['pre_deliverable'];
  const many = arr.length > 1;
  const header = [projectClient, projectName].filter(Boolean).join(' ').trim() || projectName || 'Project';
  const bulletItems = arr.map((it: any) => (it.preDeliverableType || it.title || '').trim()).filter(Boolean);
  const titleCore = many
    ? `${header}\n- ${bulletItems.join('\n- ')}`
    : `${projectClient ? projectClient + ' ' : ''}${projectName} ${bulletItems[0] || ''}`.trim();
  const when = formatDateWithWeekday((first as any)?.date || dayKey);
  const titleAttr = when ? `${when}\n${titleCore}` : titleCore;
  const keyBase = `pre-group-${first.project ?? projectName}-${first?.date || dayKey}`;
  return (
    <div
      key={keyBase}
      title={titleAttr}
      role="button"
      tabIndex={0}
      onMouseEnter={() => { if (pid != null) onHover(pid); }}
      onFocus={() => { if (pid != null) onHover(pid); }}
      onBlur={onClear}
      onMouseLeave={onClear}
      onKeyDown={(e) => onKey(pid, e)}
      className={`text-xs text-white rounded px-2 py-1 border ${dim ? 'opacity-5 transition-opacity duration-300' : ''}`}
      style={{ background: color, border: '1px solid var(--borderOverlay)' }}
    >
      {many ? (
        <div>
          <div className="font-medium truncate">{header}</div>
          <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
            {bulletItems.map((t: string, i: number) => (
              <li key={`${keyBase}-${i}`} className="leading-tight">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="truncate">{titleAttr}</div>
      )}
    </div>
  );
};

type Props = {
  items: any[];
  anchor: Date;
  weeksCount: number;
  showPre: boolean;
  className?: string;
};

const CalendarGrid: React.FC<Props> = ({ items, anchor, weeksCount, showPre, className }) => {
  // Project-scoped hover highlight state
  const [hoveredProjectId, setHoveredProjectId] = React.useState<number | null>(null);

  // Clear highlight on data/view changes to avoid a stuck dim state
  React.useEffect(() => { setHoveredProjectId(null); }, [items, anchor, showPre]);

  const handleKeyDown = (projectId: number | null, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (projectId == null) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setHoveredProjectId(projectId); }
    if (e.key === 'Escape') { setHoveredProjectId(null); }
  };

  const isDimmed = (projectId: number | null): boolean => (
    hoveredProjectId !== null && projectId !== hoveredProjectId
  );

  const getDeliverableProjectId = (ev: any): number | null => {
    const pid = ev?.project;
    return Number.isFinite(pid) ? Number(pid) : null;
  };
  const weeks: Date[][] = React.useMemo(() => {
    const out: Date[][] = [];
    const baseSunday = startOfWeekSunday(anchor);
    for (let w = 0; w < weeksCount; w++) {
      const row: Date[] = [];
      const base = new Date(baseSunday);
      base.setDate(base.getDate() + 7 * w);
      for (let d = 0; d < 7; d++) {
        const day = new Date(base);
        day.setDate(base.getDate() + d);
        row.push(day);
      }
      out.push(row);
    }
    return out;
  }, [anchor, weeksCount]);

  const dateMap = React.useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items || []) {
      const dt = (it as any).date as string | null;
      if (!dt) continue;
      const isPre = (it as any).itemType === 'pre_deliverable';
      if (isPre) {
        // When pre items are hidden, still show the hovered project's pre‑deliverables temporarily
        const pid = Number.isFinite((it as any).project) ? Number((it as any).project) : null;
        const allowed = showPre || (hoveredProjectId !== null && pid !== null && pid === hoveredProjectId);
        if (!allowed) continue;
      }
      if (!m.has(dt)) m.set(dt, []);
      m.get(dt)!.push(it);
    }
    return m;
  }, [items, showPre, hoveredProjectId]);

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());

  // Ensure all day cells share the height of the tallest cell across the entire grid
  const cellRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [uniformMinHeight, setUniformMinHeight] = React.useState<number | null>(null);

  // Measure tallest cell whenever inputs that can affect sizes change
  React.useLayoutEffect(() => {
    const els = cellRefs.current.filter((el): el is HTMLDivElement => !!el);
    if (els.length === 0) return;
    // Reset any previous min-heights before measuring to get natural sizes
    els.forEach((el) => { el.style.minHeight = '0px'; });
    // Allow layout to flush
    // Establish a sensible baseline so rows can comfortably fit ~5 simple deliverable pills
    const BASELINE_CARDS = 10;      // target number of deliverable pills (increase to reduce jumpiness)
    const CARD_EST_PX = 24;         // approximate height of one pill (text-xs + py-1)
    const GAP_PX = 4;               // space-y-1 gap between items
    const BASELINE_MIN_PX = BASELINE_CARDS * CARD_EST_PX + (BASELINE_CARDS - 1) * GAP_PX; // ~272px
    let max = BASELINE_MIN_PX;
    for (const el of els) {
      const h = el.getBoundingClientRect().height;
      if (h > max) max = h;
    }
    setUniformMinHeight(Math.ceil(max));
  }, [items, weeksCount, anchor, showPre]);

  // Re-measure on window resize (container width changes can reflow text)
  React.useEffect(() => {
    const onResize = () => {
      const els = cellRefs.current.filter((el): el is HTMLDivElement => !!el);
      if (els.length === 0) return;
      els.forEach((el) => { el.style.minHeight = '0px'; });
      let max = 0;
      for (const el of els) {
        const h = el.getBoundingClientRect().height;
        if (h > max) max = h;
      }
      setUniformMinHeight(Math.ceil(max));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={className} onMouseLeave={() => setHoveredProjectId(null)}>
      <div className="min-w-[600px] border border-[#3e3e42] rounded">
        {/* Weeks */}
        <div>
          {weeks.map((row, i) => (
            <div key={i} className="grid grid-cols-7 border-t border-[var(--border)]">
              {row.map((d, j) => {
                const key = fmtDate(d);
                // subtle month shading palette
                const anchorIdx = anchor.getFullYear() * 12 + anchor.getMonth();
                const cellIdx = d.getFullYear() * 12 + d.getMonth();
                let monthOffset = cellIdx - anchorIdx;
                if (monthOffset < 0) monthOffset = 0;
                const shadeIdx = Math.abs(monthOffset % 5);
                const monthBg = `var(--shade${shadeIdx})`;
                const dayItems = (dateMap.get(key) || []).sort((a, b) => (('projectName' in a ? a.projectName||'' : '')).localeCompare(('projectName' in b ? b.projectName||'' : '')));
                return (
                  <div
                    key={j}
                    ref={(el) => { cellRefs.current[i * 7 + j] = el; }}
                    className="border-r border-[var(--border)] last:border-r-0 p-2 align-top"
                    style={{ position: 'relative', background: monthBg, minHeight: uniformMinHeight ?? undefined }}
                  >
                    {isToday(d) && (
                      <div
                        className="absolute inset-0 rounded-sm pointer-events-none"
                        style={{ background: 'var(--surfaceOverlay)', boxShadow: '0 0 0 1px var(--border)' }}
                      />
                    )}
                    <div className="relative z-10 text-xs text-[#94a3b8] mb-1 flex items-center gap-1">
                      {(() => {
                        const monthAbbr = d.toLocaleString(undefined, { month: 'short' });
                        const text = `${monthAbbr} ${d.getDate()}`;
                        return (
                          <span className={`inline-block px-1 rounded ${isToday(d) ? 'bg-[var(--primary)] text-white' : ''}`}>{text}</span>
                        );
                      })()}
                    </div>
                    <div className="relative z-10 space-y-1">
					{(() => {
						const deliverables = dayItems.filter((it) => (it as any).itemType  !==  'pre_deliverable');
						const preItems = dayItems.filter((it) => (it as any).itemType === 'pre_deliverable');

						const deliverableNodes = deliverables.map((ev: any) => (
						  <DeliverablePill
							key={`deliverable-${ev.id}-${ev.date}`}
							ev={ev}
							pid={getDeliverableProjectId(ev)}
							dim={isDimmed(getDeliverableProjectId(ev))}
							onHover={(pid) => setHoveredProjectId(pid)}
							onClear={() => setHoveredProjectId(null)}
							onKey={(pid, e) => handleKeyDown(pid, e)}
						  />
						));

						const preByProject = new Map<number | string, any[]>();
						for (const it of preItems) {
						  const pid = (it as any).project ?? `p:${(it as any).projectName ?? ''}`;
						  if (!preByProject.has(pid)) preByProject.set(pid, []);
						  preByProject.get(pid)!.push(it);
						}

						const preGroupNodes = Array.from(preByProject.values())
						  .sort((a, b) => ((a[0]?.projectName || '') as string).localeCompare((b[0]?.projectName || '') as string))
						  .map((arr) => {
							const first = arr[0] as any;
							const pid = Number.isFinite((first as any).project) ? Number((first as any).project) : null;
							return (
							  <PreDeliverableGroupCard
							key={`pg-${first.project ?? first.projectName}-${first?.date || key}`}
								arr={arr}
								dayKey={key}
								pid={pid}
								dim={isDimmed(pid)}
								onHover={(p) => setHoveredProjectId(p)}
								onClear={() => setHoveredProjectId(null)}
								onKey={(p, e) => handleKeyDown(p, e)}
							  />
							);
						  });

                    return [...deliverableNodes, ...preGroupNodes];
                    					})()}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarGrid;
