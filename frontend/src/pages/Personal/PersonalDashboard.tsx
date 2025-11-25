import React from 'react';
import Layout from '@/components/layout/Layout';
import UpcomingPreDeliverablesWidget from '@/components/dashboard/UpcomingPreDeliverablesWidget';
import MySummaryCard from '@/components/personal/MySummaryCard';
import MyProjectsCard from '@/components/personal/MyProjectsCard';
import MyDeliverablesCard from '@/components/personal/MyDeliverablesCard';
import MyScheduleStrip from '@/components/personal/MyScheduleStrip';
import PersonalCalendarWidget from '@/components/personal/PersonalCalendarWidget';
import { useAuth } from '@/hooks/useAuth';
import { usePersonalWork } from '@/hooks/usePersonalWork';

const PersonalDashboard: React.FC = () => {
  const auth = useAuth();
  const personId = auth?.person?.id;
  const { data, loading, error, refresh } = usePersonalWork();
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const summary = data?.summary ?? null;
  const alerts = data?.alerts ?? null;
  const projects = data?.projects ?? [];
  const deliverables = data?.deliverables ?? [];
  const schedule = data?.schedule ?? null;

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
              onClick={() => refresh({ force: true })}
              disabled={loading}
              className="px-3 py-1.5 rounded-full border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-60"
              aria-label="Refresh my work data"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
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

        {/* Mobile swipe stack */}
        <div className="md:hidden space-y-4" aria-label="My work widgets">
          <MyProjectsCard className="min-h-[220px]" projects={projects} />
          <MyDeliverablesCard className="min-h-[220px]" deliverables={deliverables} />
          {schedule ? (
            <MyScheduleStrip
              className="min-h-[220px]"
              weekKeys={schedule.weekKeys}
              weeklyCapacity={schedule.weeklyCapacity}
              weekTotals={schedule.weekTotals}
            />
          ) : null}
          <PersonalCalendarWidget className="min-h-[220px]" />
          <UpcomingPreDeliverablesWidget className="min-h-[220px]" />
        </div>

        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-[minmax(240px,auto)]">
          <div className="xl:col-span-1">
            <MyProjectsCard className="h-full" projects={projects} />
          </div>
          <div className="xl:col-span-1">
            <MyDeliverablesCard className="h-full" deliverables={deliverables} />
          </div>
          <div className="xl:col-span-1">
            <UpcomingPreDeliverablesWidget className="h-full" />
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <PersonalCalendarWidget className="h-full" />
          </div>
          {schedule ? (
            <div className="md:col-span-2 xl:col-span-3">
              <MyScheduleStrip
                className="h-full"
                weekKeys={schedule.weekKeys}
                weeklyCapacity={schedule.weeklyCapacity}
                weekTotals={schedule.weekTotals}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
};

export default PersonalDashboard;
