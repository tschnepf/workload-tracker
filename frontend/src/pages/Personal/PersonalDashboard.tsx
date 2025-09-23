import React from 'react';
import Layout from '@/components/layout/Layout';
import UpcomingPreDeliverablesWidget from '@/components/dashboard/UpcomingPreDeliverablesWidget';
import MySummaryCard, { Summary, Alerts } from '@/components/personal/MySummaryCard';
import MyProjectsCard, { ProjectItem } from '@/components/personal/MyProjectsCard';
import MyDeliverablesCard, { DeliverableItem } from '@/components/personal/MyDeliverablesCard';
import MyScheduleStrip from '@/components/personal/MyScheduleStrip';
import QuickActionsCard from '@/components/personal/QuickActionsCard';
import { apiClient, authHeaders } from '@/api/client';
import Button from '@/components/ui/Button';
import { useNavigate } from 'react-router';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { useAuth } from '@/hooks/useAuth';

const PersonalDashboard: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [horizonWeeks, setHorizonWeeks] = React.useState<number>(() => {
    try {
      const raw = localStorage.getItem('personalDashboard.horizonWeeks');
      return raw ? Math.max(1, Math.min(12, parseInt(raw))) : 8;
    } catch { return 8 }
  });
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

  const openAssignmentsMe = () => {
    navigate('/assignments');
  };

  const openCalendarMine = () => {
    navigate('/deliverables/calendar');
  };

  const bulkCompleteDueToday = async () => {
    try {
      const today = new Date();
      const d = today.toISOString().slice(0, 10);
      const res = await apiClient.GET('/deliverables/pre_deliverable_items/' as any, { params: { query: { mine_only: 1, start: d, end: d } }, headers: authHeaders() });
      const items: any[] = ((res as any).data || []).filter((it: any) => !it.isCompleted);
      const ids = items.map(i => i.id);
      if (ids.length === 0) return;
      await apiClient.POST('/deliverables/pre_deliverable_items/bulk_complete/' as any, { body: { ids } as any, headers: authHeaders() });
    } catch (e) {
      // noop; widget reload will reflect later
    }
  };

  if (!personId) {
    return (
      <Layout>
        <div className="p-8 text-center text-[#cccccc]">
          <h1 className="text-3xl font-bold mb-2">My Work</h1>
          <p className="text-[#969696]">Your account is not linked to a Person profile yet. Please contact your administrator.</p>
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
          <h1 className="text-3xl font-bold text-[#cccccc]" tabIndex={-1} id="mywork-heading">My Work</h1>
          <p className="text-[#969696] mt-2">Your assignments, milestones, and schedule</p>
        </header>

        {/* Preferences & Quick Actions */}
        <section className="bg-[#2d2d30] border border-[#3e3e42] rounded p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <label className="text-[#969696]">Horizon Weeks:</label>
              <input
                type="number"
                min={1}
                max={12}
                value={horizonWeeks}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(12, parseInt(e.target.value || '8')));
                  setHorizonWeeks(v);
                  try { localStorage.setItem('personalDashboard.horizonWeeks', String(v)); } catch {}
                }}
                className="w-16 px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openAssignmentsMe}>Open Assignments (me)</Button>
              <Button size="sm" onClick={openCalendarMine}>Open Calendar (mine)</Button>
              <Button size="sm" onClick={bulkCompleteDueToday}>Complete due‑today pre‑items</Button>
            </div>
          </div>
        </section>

        {/* Summary (full width) */}
        {summary && alerts ? (
          <MySummaryCard summary={summary} alerts={alerts} />
        ) : (
          <section aria-busy="true" role="status" className="bg-[#2d2d30] border border-[#3e3e42] rounded p-4">
            <div className="h-5 w-40 bg-[#3e3e42] rounded mb-3" />
            <div className="h-3 w-full bg-[#3e3e42] rounded mb-2" />
            <div className="h-3 w-5/6 bg-[#3e3e42] rounded" />
          </section>
        )}

        {/* Compact widgets grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Pre-Deliverables */}
          <UpcomingPreDeliverablesWidget className="min-h-[220px] h-full" />
          {/* Deliverables */}
          <MyDeliverablesCard className="min-h-[220px] h-full" deliverables={deliverables} />
          {/* Projects */}
          <MyProjectsCard className="min-h-[220px] h-full" projects={projects} />
          {/* Quick Actions */}
          <QuickActionsCard className="min-h-[220px] h-full"
            onOpenAssignments={openAssignmentsMe}
            onOpenCalendar={openCalendarMine}
            onCompleteDueToday={bulkCompleteDueToday}
          />
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
