import React from 'react';
import { useProjectStaffingTimeline } from '@/hooks/useExperience';

export function ProjectStaffingTimelineCard({ projectId, start, end }: { projectId: number; start?: string; end?: string; }) {
  const { loading, error, data } = useProjectStaffingTimeline({ projectId, start, end });
  if (loading) return <div>Loading…</div>;
  if (error) return <div>Failed to load</div>;
  const roleAgg = data?.roleAggregates ?? [];
  const people = data?.people ?? [];
  return (
    <div className="card">
      <div className="card-header">Project Staffing</div>
      <div className="card-body space-y-3">
        <div>
          <div className="font-semibold mb-1">Role Aggregates</div>
          <ul className="list-disc pl-5">
            {roleAgg.map(r => (
              <li key={String(r.roleId)}>{String(r.roleId)} — {r.peopleCount} people, {r.weeks} weeks, {r.hours.toFixed(2)} h</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-1">People</div>
          {people.map(p => (
            <div key={p.personId} className="border-t py-2">
              <div className="font-medium">{p.personName}</div>
              <div className="text-xs text-gray-600">Roles: {p.roles.map(r => `${r.roleId ?? 'n/a'} (${r.weeks}w, ${r.hours.toFixed(1)}h)`).join(', ')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

