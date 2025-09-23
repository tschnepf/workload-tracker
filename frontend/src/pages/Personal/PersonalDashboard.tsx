import React from 'react';
import Layout from '@/components/layout/Layout';
import UpcomingPreDeliverablesWidget from '@/components/dashboard/UpcomingPreDeliverablesWidget';
import { useAuth } from '@/hooks/useAuth';

const PersonalDashboard: React.FC = () => {
  const auth = useAuth();
  const personId = auth?.person?.id;

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

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-[#cccccc]">My Work</h1>
          <p className="text-[#969696] mt-2">Your assignments, milestones, and schedule</p>
        </header>

        {/* Pre-Deliverables (live data via existing endpoint) */}
        <UpcomingPreDeliverablesWidget />

        {/* Skeleton sections (replace with real widgets in Phase 4) */}
        <section aria-busy="true" className="bg-[#2d2d30] border border-[#3e3e42] rounded p-4">
          <div className="h-5 w-40 bg-[#3e3e42] rounded mb-3" />
          <div className="h-3 w-full bg-[#3e3e42] rounded mb-2" />
          <div className="h-3 w-5/6 bg-[#3e3e42] rounded" />
        </section>

        <section aria-busy="true" className="bg-[#2d2d30] border border-[#3e3e42] rounded p-4">
          <div className="h-5 w-48 bg-[#3e3e42] rounded mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="h-20 bg-[#3e3e42] rounded" />
            <div className="h-20 bg-[#3e3e42] rounded" />
          </div>
        </section>

        <section aria-busy="true" className="bg-[#2d2d30] border border-[#3e3e42] rounded p-4">
          <div className="h-5 w-56 bg-[#3e3e42] rounded mb-3" />
          <div className="flex gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-6 h-6 bg-[#3e3e42] rounded" />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default PersonalDashboard;
