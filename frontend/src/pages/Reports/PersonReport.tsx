import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import PageState from '@/components/ui/PageState';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import {
  useCreatePersonReportCheckin,
  useCreatePersonReportGoal,
  usePersonReportBootstrap,
  usePersonReportCheckins,
  usePersonReportGoals,
  usePersonReportPeople,
  usePersonReportProfile,
  useUpdatePersonReportGoal,
} from '@/hooks/usePersonReport';

const DEFAULT_MONTHS = 6;
const WEEKS_PER_MONTH = 4;
const WEEKS_PER_YEAR = 52;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_LABELS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clampMonths(value: number): number {
  return Math.max(1, Math.min(24, value));
}

function subtractMonthsIso(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const copy = new Date(d.getTime());
  const day = copy.getDate();
  copy.setMonth(copy.getMonth() - Math.max(1, months));
  if (copy.getDate() !== day) copy.setDate(0);
  return copy.toISOString().slice(0, 10);
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function formatActiveWorkDuration(activeWeeks: number): string {
  const weeks = Math.max(0, Math.floor(activeWeeks || 0));
  if (weeks < WEEKS_PER_MONTH * 2) {
    return pluralize(weeks, 'week');
  }
  if (weeks < WEEKS_PER_YEAR) {
    const months = Math.floor(weeks / WEEKS_PER_MONTH);
    const remainingWeeks = weeks % WEEKS_PER_MONTH;
    if (remainingWeeks === 0) return pluralize(months, 'month');
    return `${pluralize(months, 'month')} ${pluralize(remainingWeeks, 'week')}`;
  }
  const years = Math.floor(weeks / WEEKS_PER_YEAR);
  const remainingWeeks = weeks % WEEKS_PER_YEAR;
  const months = Math.floor(remainingWeeks / WEEKS_PER_MONTH);
  if (months === 0) return pluralize(years, 'year');
  return `${pluralize(years, 'year')} ${pluralize(months, 'month')}`;
}

function parseIsoDate(isoDate: string | null | undefined): Date | null {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(isoDate: string | null | undefined): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return '—';
  return `${MONTH_LABELS[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

function isCurrentDate(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false;
  if (isoDate.trim().toLowerCase() === 'now') return true;
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return false;
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((localToday.getTime() - parsed.getTime()) / MS_PER_DAY);
  return diffDays >= 0 && diffDays <= 14;
}

function formatEndDate(lastWeek: string | null | undefined): string {
  if (isCurrentDate(lastWeek)) return 'Current';
  return formatDisplayDate(lastWeek);
}

const PersonReportPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state: verticalState } = useVerticalFilter();

  const initialParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialMonths = clampMonths(parsePositiveInt(initialParams.get('months')) ?? DEFAULT_MONTHS);
  const initialDepartment = parsePositiveInt(initialParams.get('dept'));
  const initialPerson = parsePositiveInt(initialParams.get('person'));
  const initialIncludeInactive = initialParams.get('includeInactive') === '1';

  const [months, setMonths] = React.useState<number>(initialMonths);
  const [selectedDepartmentId, setSelectedDepartmentId] = React.useState<number | null>(initialDepartment);
  const [selectedPersonId, setSelectedPersonId] = React.useState<number | null>(initialPerson);
  const [includeInactive, setIncludeInactive] = React.useState<boolean>(initialIncludeInactive);
  const [peopleSearch, setPeopleSearch] = React.useState<string>('');

  const [newFreeformGoalTitle, setNewFreeformGoalTitle] = React.useState('');
  const [newFreeformGoalDescription, setNewFreeformGoalDescription] = React.useState('');
  const [newSkillGoalId, setNewSkillGoalId] = React.useState<number | null>(null);

  const [checkinSummary, setCheckinSummary] = React.useState('');
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [checkinEnd, setCheckinEnd] = React.useState(todayIso);
  const [checkinStart, setCheckinStart] = React.useState(subtractMonthsIso(todayIso, months));

  const bootstrapQuery = usePersonReportBootstrap({
    vertical: verticalState.selectedVerticalId ?? undefined,
    includeInactive,
  });

  const peopleQuery = usePersonReportPeople({
    departmentId: selectedDepartmentId,
    search: peopleSearch,
    includeInactive,
  });

  const profileQuery = usePersonReportProfile({
    personId: selectedPersonId,
    months,
  });

  const goalsQuery = usePersonReportGoals(selectedPersonId);
  const checkinsQuery = usePersonReportCheckins(selectedPersonId);

  const createGoalMutation = useCreatePersonReportGoal(selectedPersonId);
  const updateGoalMutation = useUpdatePersonReportGoal(selectedPersonId);
  const createCheckinMutation = useCreatePersonReportCheckin(selectedPersonId);

  React.useEffect(() => {
    const departments = bootstrapQuery.data?.departments || [];
    if (!departments.length) return;
    if (selectedDepartmentId && departments.some((d) => d.id === selectedDepartmentId)) return;
    setSelectedDepartmentId(departments[0].id);
  }, [bootstrapQuery.data?.departments, selectedDepartmentId]);

  React.useEffect(() => {
    const people = peopleQuery.data?.people || [];
    if (!selectedDepartmentId || !people.length) {
      setSelectedPersonId(null);
      return;
    }
    if (selectedPersonId && people.some((p) => p.id === selectedPersonId)) return;
    setSelectedPersonId(people[0].id);
  }, [peopleQuery.data?.people, selectedDepartmentId, selectedPersonId]);

  React.useEffect(() => {
    setCheckinStart(subtractMonthsIso(checkinEnd, months));
  }, [checkinEnd, months]);

  React.useEffect(() => {
    const next = new URLSearchParams(location.search);
    if (selectedDepartmentId) next.set('dept', String(selectedDepartmentId));
    else next.delete('dept');
    if (selectedPersonId) next.set('person', String(selectedPersonId));
    else next.delete('person');
    next.set('months', String(months));
    next.set('includeInactive', includeInactive ? '1' : '0');

    const nextSearch = next.toString();
    const current = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextSearch !== current) {
      navigate({ search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
    }
  }, [location.search, navigate, selectedDepartmentId, selectedPersonId, months, includeInactive]);

  const departments = React.useMemo(() => bootstrapQuery.data?.departments || [], [bootstrapQuery.data?.departments]);
  const people = React.useMemo(() => peopleQuery.data?.people || [], [peopleQuery.data?.people]);
  const goals = React.useMemo(() => goalsQuery.data?.goals || [], [goalsQuery.data?.goals]);
  const checkins = React.useMemo(() => checkinsQuery.data?.checkins || [], [checkinsQuery.data?.checkins]);

  const selectedPerson = React.useMemo(
    () => people.find((p) => p.id === selectedPersonId) || null,
    [people, selectedPersonId],
  );

  const createFreeformGoal = async () => {
    if (!selectedPersonId || !newFreeformGoalTitle.trim()) return;
    await createGoalMutation.mutateAsync({
      personId: selectedPersonId,
      goalType: 'freeform',
      title: newFreeformGoalTitle.trim(),
      description: newFreeformGoalDescription.trim() || undefined,
      status: 'active',
    });
    setNewFreeformGoalTitle('');
    setNewFreeformGoalDescription('');
  };

  const createSkillGoal = async () => {
    if (!selectedPersonId || !newSkillGoalId) return;
    await createGoalMutation.mutateAsync({
      personId: selectedPersonId,
      goalType: 'skill',
      skillTagId: newSkillGoalId,
      status: 'active',
    });
    setNewSkillGoalId(null);
  };

  const createCheckin = async () => {
    if (!selectedPersonId) return;
    await createCheckinMutation.mutateAsync({
      personId: selectedPersonId,
      periodStart: checkinStart,
      periodEnd: checkinEnd,
      summary: checkinSummary.trim() || undefined,
    });
    setCheckinSummary('');
  };

  const pageLoading = bootstrapQuery.isLoading;
  const pageError = bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : null;

  if (pageLoading && !bootstrapQuery.data) {
    return (
      <Layout>
        <PageState isLoading loadingState={<div className="p-6 text-[var(--muted)]">Loading person report...</div>} />
      </Layout>
    );
  }

  if (pageError && !bootstrapQuery.data) {
    return (
      <Layout>
        <PageState error={pageError} onRetry={() => void bootstrapQuery.refetch()} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="ux-page-shell space-y-4">
        <div className="ux-page-hero flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Person Report</h1>
            <p className="text-[var(--muted)]">Department-first reporting with goals and periodic check-ins.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--muted)]" htmlFor="person-report-months">Months</label>
            <input
              id="person-report-months"
              type="number"
              min={1}
              max={24}
              step={1}
              value={months}
              onChange={(e) => setMonths(clampMonths(Number(e.target.value || DEFAULT_MONTHS)))}
              className="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
            />
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Include inactive
            </label>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[240px_300px_minmax(0,1fr)]">
          <Card className="ux-panel p-3">
            <div className="mb-2 text-sm font-semibold text-[var(--text)]">Departments</div>
            <div className="max-h-[65svh] overflow-auto space-y-1">
              {departments.map((dept) => (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => {
                    setSelectedDepartmentId(dept.id);
                    setSelectedPersonId(null);
                    setPeopleSearch('');
                  }}
                  className={`w-full rounded border px-2 py-2 text-left text-sm transition-colors ${
                    selectedDepartmentId === dept.id
                      ? 'border-[var(--primary)] bg-[var(--surfaceHover)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surfaceHover)] hover:text-[var(--text)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{dept.name}</span>
                    <span className="rounded bg-[var(--surfaceHover)] px-1.5 py-0.5 text-xs">{dept.peopleCount}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="ux-panel p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[var(--text)]">People</div>
              <div className="text-xs text-[var(--muted)]">{peopleQuery.data?.count || 0}</div>
            </div>
            <input
              className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
              placeholder="Search person"
              value={peopleSearch}
              onChange={(e) => setPeopleSearch(e.target.value)}
            />
            <div className="max-h-[62svh] overflow-auto space-y-1">
              {peopleQuery.isLoading && <div className="text-sm text-[var(--muted)]">Loading people…</div>}
              {!peopleQuery.isLoading && people.length === 0 && <div className="text-sm text-[var(--muted)]">No people found.</div>}
              {!peopleQuery.isLoading && people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedPersonId(person.id)}
                  className={`w-full rounded border px-2 py-2 text-left text-sm transition-colors ${
                    selectedPersonId === person.id
                      ? 'border-[var(--primary)] bg-[var(--surfaceHover)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surfaceHover)] hover:text-[var(--text)]'
                  }`}
                >
                  <div className="font-medium">{person.name}</div>
                  <div className="text-xs opacity-80">{person.roleName || 'No role'} · {person.isActive ? 'Active' : 'Inactive'}</div>
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            {!selectedPersonId && (
              <Card className="ux-panel p-6 text-[var(--muted)]">Select a person to see report details.</Card>
            )}

            {selectedPersonId && (
              <>
                <Card className="ux-panel p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xl font-semibold text-[var(--text)]">{profileQuery.data?.person.name || selectedPerson?.name || 'Person'}</div>
                      <div className="text-sm text-[var(--muted)]">
                        {profileQuery.data?.window.start} to {profileQuery.data?.window.end}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--muted)]">{profileQuery.data?.person.departmentName || 'No department'}</div>
                  </div>

                  {profileQuery.isLoading && <div className="text-sm text-[var(--muted)]">Loading profile…</div>}
                  {!profileQuery.isLoading && profileQuery.data && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <Stat title="Projects" value={profileQuery.data.summary.projectsWorked} />
                        <Stat title="Total Hours" value={profileQuery.data.summary.totalHours.toFixed(1)} />
                        <Stat title="Avg Weekly" value={profileQuery.data.summary.avgWeeklyHours.toFixed(1)} />
                        <Stat title="Active Weeks" value={profileQuery.data.summary.activeWeeks} />
                        <Stat title="Events" value={profileQuery.data.summary.eventsCount} />
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <div>
                          <div className="mb-2 text-sm font-semibold text-[var(--text)]">Top Clients</div>
                          <div className="space-y-1">
                            {profileQuery.data.topClients.slice(0, 5).map((row) => (
                              <div key={row.client} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm">
                                <span>{row.client}</span>
                                <span className="text-[var(--muted)]">{row.totalHours.toFixed(1)}h</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-sm font-semibold text-[var(--text)]">Role Mix</div>
                          <div className="space-y-1">
                            {profileQuery.data.roleMix.slice(0, 5).map((row) => (
                              <div key={String(row.roleId)} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm">
                                <span>{row.roleName || `Role ${row.roleId ?? 'N/A'}`}</span>
                                <span className="text-[var(--muted)]">{row.totalHours.toFixed(1)}h</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 text-sm font-semibold text-[var(--text)]">Projects</div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                                <th className="py-1 pr-3">Project</th>
                                <th className="py-1 pr-3">Client</th>
                                <th className="py-1 pr-3">Time Assigned</th>
                                <th className="py-1 pr-3">Start</th>
                                <th className="py-1 pr-3">End</th>
                                <th className="py-1 pr-3">Total</th>
                                <th className="py-1 pr-3">Avg/Wk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {profileQuery.data.projects.map((row) => (
                                <tr key={`${row.projectId}-${row.projectName}`} className="border-b border-[var(--border)]">
                                  <td className="py-1 pr-3">{row.projectName}</td>
                                  <td className="py-1 pr-3">{row.client}</td>
                                  <td className="py-1 pr-3">{formatActiveWorkDuration(row.activeWeeks)}</td>
                                  <td className="py-1 pr-3">{formatDisplayDate(row.startDate || row.firstWeek)}</td>
                                  <td className="py-1 pr-3">{formatEndDate(row.lastWeek)}</td>
                                  <td className="py-1 pr-3">{row.totalHours.toFixed(1)}</td>
                                  <td className="py-1 pr-3">{row.avgWeeklyHours.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </Card>

                <Card className="ux-panel p-4">
                  <div className="mb-2 text-sm font-semibold text-[var(--text)]">Skills</div>
                  {profileQuery.data && (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <SkillBucket title="Strengths" items={profileQuery.data.skills.strengths.map((s) => s.skillTagName)} />
                      <SkillBucket title="In Progress" items={profileQuery.data.skills.inProgress.map((s) => s.skillTagName)} />
                      <SkillBucket title="Goals" items={profileQuery.data.skills.goals.map((s) => s.skillTagName)} />
                      <SkillBucket title="Developed In Window" items={profileQuery.data.skills.developedInWindow.map((s) => s.skillTagName)} />
                    </div>
                  )}
                </Card>

                <Card className="ux-panel p-4">
                  <div className="mb-2 text-sm font-semibold text-[var(--text)]">Goals</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="text-xs font-semibold text-[var(--muted)]">Add Freeform Goal</div>
                      <input
                        className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                        placeholder="Goal title"
                        value={newFreeformGoalTitle}
                        onChange={(e) => setNewFreeformGoalTitle(e.target.value)}
                      />
                      <textarea
                        className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                        placeholder="Description (optional)"
                        rows={2}
                        value={newFreeformGoalDescription}
                        onChange={(e) => setNewFreeformGoalDescription(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => void createFreeformGoal()}
                        disabled={!selectedPersonId || createGoalMutation.isPending || !newFreeformGoalTitle.trim()}
                        className="rounded border border-[var(--primary)] bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-60"
                      >
                        {createGoalMutation.isPending ? 'Saving…' : 'Add Freeform Goal'}
                      </button>
                    </div>
                    <div className="space-y-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="text-xs font-semibold text-[var(--muted)]">Add Skill Goal</div>
                      <select
                        className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                        value={newSkillGoalId ?? ''}
                        onChange={(e) => setNewSkillGoalId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Select a skill</option>
                        {(bootstrapQuery.data?.skillTags || []).map((tag) => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void createSkillGoal()}
                        disabled={!selectedPersonId || createGoalMutation.isPending || !newSkillGoalId}
                        className="rounded border border-[var(--primary)] bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-60"
                      >
                        {createGoalMutation.isPending ? 'Saving…' : 'Add Skill Goal'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {goalsQuery.isLoading && <div className="text-sm text-[var(--muted)]">Loading goals…</div>}
                    {!goalsQuery.isLoading && goals.length === 0 && <div className="text-sm text-[var(--muted)]">No goals yet.</div>}
                    {goals.map((goal) => (
                      <div key={goal.id} className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-medium text-[var(--text)]">{goal.title}</div>
                          <div className="text-xs text-[var(--muted)]">{goal.goalType === 'skill' ? 'Skill-linked' : 'Freeform'} {goal.targetDate ? `· Target ${goal.targetDate}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={goal.status}
                            onChange={(e) => {
                              void updateGoalMutation.mutateAsync({
                                goalId: goal.id,
                                patch: { status: e.target.value as any },
                              });
                            }}
                            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
                          >
                            <option value="active">Active</option>
                            <option value="achieved">Achieved</option>
                            <option value="not_achieved">Not Achieved</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="ux-panel p-4">
                  <div className="mb-2 text-sm font-semibold text-[var(--text)]">Check-ins</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-[var(--muted)]" htmlFor="checkin-start">Period Start</label>
                      <input
                        id="checkin-start"
                        type="date"
                        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                        value={checkinStart}
                        onChange={(e) => setCheckinStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--muted)]" htmlFor="checkin-end">Period End</label>
                      <input
                        id="checkin-end"
                        type="date"
                        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                        value={checkinEnd}
                        onChange={(e) => setCheckinEnd(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void createCheckin()}
                        disabled={!selectedPersonId || createCheckinMutation.isPending}
                        className="rounded border border-[var(--primary)] bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-60"
                      >
                        {createCheckinMutation.isPending ? 'Saving…' : 'Create Check-in Snapshot'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                    placeholder="Check-in summary"
                    rows={2}
                    value={checkinSummary}
                    onChange={(e) => setCheckinSummary(e.target.value)}
                  />

                  <div className="mt-3 space-y-2">
                    {checkinsQuery.isLoading && <div className="text-sm text-[var(--muted)]">Loading check-ins…</div>}
                    {!checkinsQuery.isLoading && checkins.length === 0 && <div className="text-sm text-[var(--muted)]">No check-ins yet.</div>}
                    {checkins.map((checkin) => (
                      <div key={checkin.id} className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-[var(--text)]">{checkin.periodStart} to {checkin.periodEnd}</div>
                          <div className="text-xs text-[var(--muted)]">{checkin.checkinDate}</div>
                        </div>
                        {checkin.summary ? <div className="mt-1 text-sm text-[var(--muted)]">{checkin.summary}</div> : null}
                        <div className="mt-2 space-y-1">
                          {checkin.goalSnapshots.map((snapshot) => (
                            <div key={snapshot.id} className="rounded border border-[var(--border)]/70 bg-[var(--card)] px-2 py-1 text-xs">
                              {snapshot.titleSnapshot} · {snapshot.outcome.replace('_', ' ')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

const Stat: React.FC<{ title: string; value: React.ReactNode }> = ({ title, value }) => (
  <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
    <div className="text-xs text-[var(--muted)]">{title}</div>
    <div className="text-lg font-semibold text-[var(--text)]">{value}</div>
  </div>
);

const SkillBucket: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
    <div className="mb-1 text-xs font-semibold text-[var(--muted)]">{title}</div>
    {items.length === 0 ? (
      <div className="text-xs text-[var(--muted)]">None</div>
    ) : (
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 16).map((item) => (
          <span key={`${title}-${item}`} className="rounded bg-[var(--surfaceHover)] px-1.5 py-0.5 text-xs">
            {item}
          </span>
        ))}
      </div>
    )}
  </div>
);

export default PersonReportPage;
