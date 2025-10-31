import React from 'react';
import { useDebounce } from '@/utils/useDebounce';
import { usePeopleAutocomplete } from '@/hooks/usePeople';
import { usePersonExperienceProfile, usePersonProjectTimeline } from '@/hooks/useExperience';

function addMonths(d: Date, months: number) {
  const copy = new Date(d.getTime());
  const day = copy.getDate();
  copy.setMonth(copy.getMonth() - months);
  if (copy.getDate() !== day) copy.setDate(0);
  return copy;
}

function addYears(d: Date, years: number) {
  const copy = new Date(d.getTime());
  copy.setFullYear(copy.getFullYear() - years);
  return copy;
}

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DEFAULT_MONTHS = 6;

export default function PersonExperienceReport() {
  const [search, setSearch] = React.useState('');
  const debounced = useDebounce(search, 200);
  const { people, loading: loadingPeople } = usePeopleAutocomplete(debounced);
  const [selectedPersonId, setSelectedPersonId] = React.useState<number | null>(null);

  // Interval controls
  const [intervalType, setIntervalType] = React.useState<'months' | 'years'>('months');
  const [intervalCount, setIntervalCount] = React.useState<number>(DEFAULT_MONTHS);
  const now = React.useMemo(() => new Date(), []);
  const startDate = React.useMemo(() => {
    return intervalType === 'months' ? addMonths(now, intervalCount) : addYears(now, intervalCount);
  }, [now, intervalType, intervalCount]);
  const start = fmtDate(startDate);
  const end = fmtDate(now);

  const { loading, error, data } = usePersonExperienceProfile({ personId: selectedPersonId || 0, start, end });

  const avgScaleMax = 40;

  return (
    <div className="p-4 space-y-4">
      <div className="text-xl font-semibold">Person Experience Report</div>

      <section className="bg-[#111314] border border-[#2a2d2f] rounded p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm mb-1">Search Person</label>
            <input
              className="w-full rounded bg-[#0c0e0f] border border-[#2a2d2f] px-2 py-1"
              placeholder="Type at least 2 characters"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {debounced.trim().length >= 2 && (
              <div className="mt-2 max-h-48 overflow-auto border border-[#2a2d2f] rounded">
                {loadingPeople && <div className="px-2 py-1 text-sm text-[#9aa0a6]">Searching...</div>}
                {!loadingPeople && people.length === 0 && (
                  <div className="px-2 py-1 text-sm text-[#9aa0a6]">No matches</div>
                )}
                {!loadingPeople && people.map(p => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-2 py-1 hover:bg-[#1a1d1f] ${selectedPersonId === p.id ? 'bg-[#1a1d1f]' : ''}`}
                    onClick={() => { setSelectedPersonId(p.id); }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm mb-1">Interval Type</label>
            <select
              className="w-full rounded bg-[#0c0e0f] border border-[#2a2d2f] px-2 py-1"
              value={intervalType}
              onChange={e => setIntervalType(e.target.value as any)}
            >
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Interval Count</label>
            <input
              type="number"
              min={1}
              className="w-full rounded bg-[#0c0e0f] border border-[#2a2d2f] px-2 py-1"
              value={intervalCount}
              onChange={e => setIntervalCount(Math.max(1, Number(e.target.value || 1)))}
            />
            <div className="mt-1 text-xs text-[#9aa0a6]">Window: {start} to {end}</div>
          </div>
        </div>
      </section>

      {selectedPersonId == null && (
        <div className="text-[#9aa0a6]">Select a person to see project experience.</div>
      )}

      {selectedPersonId != null && (
        <section className="bg-[#111314] border border-[#2a2d2f] rounded p-3">
          <div className="text-sm text-[#9aa0a6] mb-2">Showing {intervalType === 'months' ? `${intervalCount} month` : `${intervalCount} year`}{intervalCount > 1 ? 's' : ''} ending {end}</div>
          {loading && <div className="text-[#9aa0a6]">Loading...</div>}
          {error && <div className="text-red-400">{String(error)}</div>}
          {!loading && !error && (
            <div className="space-y-3">
              {(data?.byProject || []).length === 0 && (
                <div className="text-[#9aa0a6]">No projects in this window.</div>
              )}
              {(data?.byProject || []).map(prj => {
                const avg = prj.weeks > 0 ? prj.hours / prj.weeks : 0;
                const barPct = Math.max(0, Math.min(100, (avg / avgScaleMax) * 100));
                const phases = Object.values(prj.phases || {}).sort((a: any, b: any) => (b.weeks - a.weeks));
                const roleMap = (data as any)?.roleNamesById || {};
                const roles = Object.values(prj.roles || {}).sort((a: any, b: any) => (b.weeks - a.weeks));
                return (
                  <div key={prj.projectId} className="border border-[#2a2d2f] rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{prj.projectName}</div>
                      <div className="text-xs text-[#9aa0a6]">{prj.client}</div>
                    </div>
                    <div className="mt-1 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <div className="text-[#9aa0a6]">Weeks</div>
                        <div>{prj.weeks}</div>
                      </div>
                      <div>
                        <div className="text-[#9aa0a6]">Total Hours</div>
                        <div>{prj.hours.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-[#9aa0a6]">Avg Weekly Hours</div>
                        <div className="flex items-center gap-2">
                          <div className="w-36 h-2 bg-[#1a1d1f] rounded">
                            <div className="h-2 bg-[#3b82f6] rounded" style={{ width: `${barPct}%` }} />
                          </div>
                          <div className="text-xs">{avg.toFixed(1)} h</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9aa0a6]">Role(s)</div>
                        <div className="flex flex-wrap gap-1">
                          {roles.slice(0,3).map((r: any) => {
                            const label = roleMap?.[r.roleId] || `Role ${r.roleId}`;
                            return <span key={r.roleId} className="px-2 py-0.5 rounded bg-[#1a1d1f] text-xs">{label} - {r.weeks}w</span>
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-[#9aa0a6] text-sm mb-1">Phases</div>
                      <div className="flex flex-wrap gap-1">
                        {phases.slice(0,6).map((ph: any) => (
                          <span key={ph.phase} className="px-2 py-0.5 rounded bg-[#1a1d1f] text-xs">{ph.phase} - {ph.weeks}w</span>
                        ))}
                      </div>
                    </div>
                    <ProjectHoursSparkline personId={selectedPersonId!} projectId={prj.projectId} start={start} end={end} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ProjectHoursSparkline({ personId, projectId, start, end }: { personId: number; projectId: number; start: string; end: string; }) {
  const { data, loading, error } = usePersonProjectTimeline({ personId, projectId, start, end });
  const width = 220; const height = 36; const pad = 4;
  const weeks = React.useMemo(() => Object.keys(data?.weeklyHours || {}).sort(), [data]);
  const values = weeks.map(w => (data?.weeklyHours as any)?.[w] || 0);
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => {
    const x = pad + (i * (width - 2*pad)) / Math.max(1, values.length - 1);
    const y = height - pad - ((v / max) * (height - 2*pad));
    return `${x},${y}`;
  }).join(' ');
  if (loading) return <div className="mt-2 text-xs text-[#9aa0a6]">Loading series...</div>;
  if (error) return null;
  if (!values.length) return null;
  return (
    <div className="mt-2">
      <div className="text-[#9aa0a6] text-xs mb-1">Weekly hours</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />
      </svg>
    </div>
  );
}

