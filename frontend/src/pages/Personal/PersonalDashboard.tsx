import React from 'react';
import Layout from '@/components/layout/Layout';
import UpcomingPreDeliverablesWidget from '@/components/dashboard/UpcomingPreDeliverablesWidget';
import MySummaryCard from '@/components/personal/MySummaryCard';
import MyProjectsCard from '@/components/personal/MyProjectsCard';
import MyLeadProjectsGridCard from '@/components/personal/MyLeadProjectsGridCard';
import MyDeliverablesCard from '@/components/personal/MyDeliverablesCard';
import MyScheduleStrip from '@/components/personal/MyScheduleStrip';
import PersonalCalendarWidget from '@/components/personal/PersonalCalendarWidget';
import { useAuth } from '@/hooks/useAuth';
import { usePersonalWork } from '@/hooks/usePersonalWork';
import { usePersonalLeadProjectGrid } from '@/hooks/usePersonalLeadProjectGrid';
import { emitGridRefresh } from '@/lib/gridRefreshBus';
import Card from '@/components/ui/Card';
import DashboardSurface from '@/components/dashboard/layout/DashboardSurface';
import type { DashboardCardDefinition } from '@/components/dashboard/layout/dashboardLayoutTypes';
import { MY_WORK_DEFAULT_LAYOUT } from './personalDashboardDefaults';

const PersonalDashboard: React.FC = () => {
  const auth = useAuth();
  const personId = auth?.person?.id;
  const { data, loading, isFetching, error, refresh } = usePersonalWork();
  const [leadWeeks, setLeadWeeks] = React.useState(12);
  const leadProjectGrid = usePersonalLeadProjectGrid(leadWeeks);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const summary = data?.summary ?? null;
  const alerts = data?.alerts ?? null;
  const projects = data?.projects ?? [];
  const deliverables = data?.deliverables ?? [];
  const schedule = data?.schedule ?? null;

  React.useEffect(() => {
    if (headingRef.current) {
      try {
        headingRef.current.focus({ preventScroll: true });
      } catch {}
    }
  }, [personId]);

  React.useEffect(() => {
    if (!loading && data && headingRef.current) {
      try {
        headingRef.current.focus({ preventScroll: true });
      } catch {}
    }
  }, [loading, data]);

  if (!personId) {
    return (
      <Layout>
        <div className="p-8 text-center text-[var(--text)]">
          <h1 className="text-3xl font-bold mb-2">My Work</h1>
          <p className="text-[var(--muted)]">Your account is not linked to a Person profile yet. Please contact your administrator.</p>
        </div>
      </Layout>
    );
  }

  const renderMobileSkeletons = () => (
    <div className="md:hidden space-y-4" aria-label="Mobile fallback skeletons">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div key={`skeleton-${idx}`} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 space-y-3">
          <div className="h-4 w-32 bg-[var(--surface)] rounded" />
          <div className="h-3 w-full bg-[var(--surface)] rounded" />
          <div className="h-3 w-3/4 bg-[var(--surface)] rounded" />
        </div>
      ))}
    </div>
  );

  const handleRefresh = React.useCallback(async () => {
    await Promise.all([
      refresh({ force: true }),
      leadProjectGrid.refresh({ force: true }),
    ]);
    emitGridRefresh({ reason: 'personal-calendar-refresh' });
  }, [refresh, leadProjectGrid.refresh]);

  const personalCards = React.useMemo<DashboardCardDefinition[]>(() => [
    {
      id: 'my-projects',
      title: 'My Projects',
      render: () => <MyProjectsCard className="h-full min-h-0" projects={projects} />,
      renderPreview: () => <span>{projects.length} projects</span>,
    },
    {
      id: 'my-deliverables',
      title: 'My Deliverables',
      render: () => <MyDeliverablesCard className="h-full min-h-0" deliverables={deliverables} />,
      renderPreview: () => <span>{deliverables.length} deliverables</span>,
    },
    {
      id: 'upcoming-pre-deliverables',
      title: 'Upcoming Pre-Deliverables',
      render: () => <UpcomingPreDeliverablesWidget className="h-full min-h-0" />,
      renderPreview: () => <span>Pre-deliverable queue</span>,
    },
    {
      id: 'lead-project-assignments',
      title: 'Lead Project Assignments',
      render: () => (
        <MyLeadProjectsGridCard
          className="h-full min-h-0"
          payload={leadProjectGrid.data}
          loading={leadProjectGrid.loading}
          error={leadProjectGrid.error}
          weeks={leadWeeks}
          onWeeksChange={setLeadWeeks}
          onRetry={() => { void leadProjectGrid.refresh({ force: true }); }}
        />
      ),
      renderPreview: () => <span>Lead projects and weekly hours</span>,
    },
    {
      id: 'my-calendar',
      title: 'My Calendar',
      render: () => <PersonalCalendarWidget className="h-full min-h-0" />,
      renderPreview: () => <span>Deliverables calendar</span>,
    },
    {
      id: 'my-schedule',
      title: 'My Schedule',
      render: () => (
        schedule ? (
          <MyScheduleStrip
            className="h-full min-h-0"
            weekKeys={schedule.weekKeys}
            weeklyCapacity={schedule.weeklyCapacity}
            weekTotals={schedule.weekTotals}
          />
        ) : (
          <Card className="h-full min-h-0 p-4">
            <div className="text-sm text-[var(--muted)]">Schedule data is unavailable.</div>
          </Card>
        )
      ),
      renderPreview: () => (
        <span>{schedule ? `${schedule.weekKeys.length} weeks loaded` : 'No schedule data'}</span>
      ),
    },
  ], [
    projects,
    deliverables,
    leadProjectGrid.data,
    leadProjectGrid.error,
    leadProjectGrid.loading,
    leadProjectGrid.refresh,
    leadWeeks,
    schedule,
  ]);

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1
              className="text-3xl font-bold text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-sm"
              tabIndex={-1}
              id="mywork-heading"
              ref={headingRef}
            >
              My Work
            </h1>
            <p className="text-[var(--muted)] mt-2">Your assignments, milestones, and schedule</p>
          </div>
          <div className="flex items-center gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => { void handleRefresh(); }}
              disabled={isFetching || leadProjectGrid.isFetching}
              className="px-3 py-1.5 rounded-full border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-60"
              aria-label="Refresh my work data"
            >
              {(isFetching || leadProjectGrid.isFetching) ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-4 text-sm text-red-100 space-y-4">
            <div className="flex justify-between items-center gap-4">
              <span>{error}</span>
              <button type="button" className="text-xs underline" onClick={() => refresh({ force: true })}>
                Retry
              </button>
            </div>
            {renderMobileSkeletons()}
          </div>
        ) : null}

        {/* Summary (full width) */}
        {summary && alerts ? (
          <MySummaryCard summary={summary} alerts={alerts} />
        ) : (
          <section aria-busy="true" role="status" className="bg-[var(--card)] border border-[var(--border)] rounded p-4">
            <div className="h-5 w-40 bg-[var(--surface)] rounded mb-3" />
            <div className="h-3 w-full bg-[var(--surface)] rounded mb-2" />
            <div className="h-3 w-5/6 bg-[var(--surface)] rounded" />
          </section>
        )}

        {loading && !data ? (
          <div className="text-sm text-[var(--muted)]">Loading assignments…</div>
        ) : null}

        <DashboardSurface
          surfaceId="my-work-dashboard"
          cards={personalCards}
          defaultLayout={MY_WORK_DEFAULT_LAYOUT}
          ariaLabel="My work widgets"
        />
      </div>
    </Layout>
  );
};

export default PersonalDashboard;
