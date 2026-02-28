import React from 'react';
import Layout from '@/components/layout/Layout';
import RoleCapacityCard from '@/components/analytics/RoleCapacityCard';

const RoleCapacityReport: React.FC = () => (
  <Layout>
    <div className="ux-page-shell p-6 space-y-6">
      <RoleCapacityCard />
    </div>
  </Layout>
);

export default RoleCapacityReport;
