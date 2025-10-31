import React from 'react';
import { useClientExperienceData } from '@/hooks/useExperience';

export function ClientExperienceCard({ client, departmentId, includeChildren, start, end }: { client?: string; departmentId?: number | null; includeChildren?: boolean; start?: string; end?: string; }) {
  const { loading, error, data } = useClientExperienceData({ client, departmentId: departmentId ?? undefined, includeChildren, start, end });
  if (loading) return <div>Loading…</div>;
  if (error) return <div>Failed to load</div>;
  const rows = data?.results ?? [];
  return (
    <div className="card">
      <div className="card-header">Experience by Client{client ? `: ${client}` : ''}</div>
      <div className="card-body">
        <table className="table-auto w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Person</th>
              <th className="text-right p-2">Weeks</th>
              <th className="text-right p-2">Hours</th>
              <th className="text-right p-2">Projects</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.personId} className="border-t">
                <td className="p-2">{p.personName}</td>
                <td className="p-2 text-right">{p.totals.weeks}</td>
                <td className="p-2 text-right">{p.totals.hours.toFixed(2)}</td>
                <td className="p-2 text-right">{p.totals.projectsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

