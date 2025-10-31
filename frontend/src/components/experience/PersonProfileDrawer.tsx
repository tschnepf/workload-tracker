import React from 'react';
import { usePersonExperienceProfile } from '@/hooks/useExperience';

export function PersonProfileDrawer({ personId, start, end, onClose }: { personId: number; start?: string; end?: string; onClose?: () => void; }) {
  const { loading, error, data } = usePersonExperienceProfile({ personId, start, end });
  if (loading) return null;
  if (error) return null;
  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-xl overflow-auto">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="font-semibold">Person Experience</div>
        <button onClick={onClose} className="text-sm text-gray-500">Close</button>
      </div>
      <div className="p-4 space-y-4">
        <section>
          <div className="font-semibold mb-2">By Client</div>
          <ul className="list-disc pl-5 text-sm">
            {data?.byClient.map(c => (
              <li key={c.client}>{c.client}: {c.weeks} weeks, {c.hours.toFixed(1)} h</li>
            ))}
          </ul>
        </section>
        <section>
          <div className="font-semibold mb-2">By Project</div>
          <ul className="list-disc pl-5 text-sm">
            {data?.byProject.map(p => (
              <li key={p.projectId}>{p.projectName}: {p.weeks} weeks, {p.hours.toFixed(1)} h</li>
            ))}
          </ul>
        </section>
        <div className="text-xs text-gray-500">Events: {data?.eventsCount ?? 0}</div>
      </div>
    </div>
  );
}

