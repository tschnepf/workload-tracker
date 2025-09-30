import React from 'react';
import Layout from '@/components/layout/Layout';
import UpcomingPreDeliverablesWidget from '@/components/dashboard/UpcomingPreDeliverablesWidget';
import MySummaryCard, { Summary, Alerts } from '@/components/personal/MySummaryCard';
import MyProjectsCard, { ProjectItem } from '@/components/personal/MyProjectsCard';
import MyDeliverablesCard, { DeliverableItem } from '@/components/personal/MyDeliverablesCard';
import MyScheduleStrip from '@/components/personal/MyScheduleStrip';
import PersonalCalendarWidget from '@/components/personal/PersonalCalendarWidget';
import { apiClient, authHeaders } from '@/api/client';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { useAuth } from '@/hooks/useAuth';

const PersonalDashboard: React.FC = () => {
  const auth = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [alerts, setAlerts] = React.useState<Alerts | null>(null);
  const [projects, setProjects] = React.useState<ProjectItem[]>([]);
  const [deliverables, setDeliverables] = React.useState<DeliverableItem[]>([]);
  const [schedule, setSchedule] = React.useState<{ weekKeys: string[]; weeklyCapacity: number; weekTotals: Record<string, number> } | null>(null);
  const personId = auth?.person?.id;

  React.useEffect(() => {
    let cancelled = false;
    const startTs = performance.now();
    async function load() {
      if (!personId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.GET('/personal/work/' as any, { headers: authHeaders() });
        const data = (res as any).data as any;
        if (!data) throw new Error('No data');
        if (cancelled) return;
        setSummary(data.summary);
        setAlerts(data.alerts);
        setProjects(data.projects || []);
        setDeliverables(data.deliverables || []);
        setSchedule(data.schedule || null);
        try {
          const dur = performance.now() - startTs;
          trackPerformanceEvent('personal_dashboard_mount_ms', Math.round(dur), 'ms', { ok: true });
        } catch {}
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load personal work');
        try {
          const dur = performance.now() - startTs;
          trackPerformanceEvent('personal_dashboard_mount_ms', Math.round(dur), 'ms', { ok: false });
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true };
  }, [personId]);

  // Quick actions removed from My Work per request

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
    const el = document.getElementById('mywork-heading');
    if (el) try { (el as HTMLElement).focus(); } catch {}
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-[var(--text)]" tabIndex={-1} id="mywork-heading">My Work</h1>
          <p className="text-[var(--muted)] mt-2">Your assignments, milestones, and schedule</p>
        </header>

        {/* Preferences & Quick Actions removed */}

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

        {/* Compact widgets grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* My Calendar (personal) — 2 columns wide under summary */}
          <PersonalCalendarWidget className="min-h-[220px] h-full md:col-span-2 xl:col-span-2" />
          {/* Projects (top-right) */}
          <MyProjectsCard className="min-h-[220px] h-full" projects={projects} />
          {/* Move these down below the calendar row */}
          <UpcomingPreDeliverablesWidget className="min-h-[220px] h-full" />
          <MyDeliverablesCard className="min-h-[220px] h-full" deliverables={deliverables} />
        </div>

        {/* Schedule (full width) */}
        {schedule ? (
          <MyScheduleStrip weekKeys={schedule.weekKeys} weeklyCapacity={schedule.weeklyCapacity} weekTotals={schedule.weekTotals} />
        ) : null}
      </div>
    </Layout>
  );
};

export default PersonalDashboard;
