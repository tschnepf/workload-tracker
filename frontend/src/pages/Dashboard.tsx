/**
 * Dashboard page - Hello World for Chunk 1
 * Will be enhanced with actual dashboard in Chunk 4
 */

import React from 'react';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const Dashboard: React.FC = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-50">
            Workload Tracker Dashboard
          </h1>
          <p className="text-slate-300 mt-2">
            Welcome to the workload management system
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card title="People">
            <p className="text-slate-300 mb-4">
              Manage your team members and their capacity
            </p>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={() => window.location.href = '/people'}
            >
              View People
            </Button>
          </Card>

          <Card title="Projects">
            <p className="text-slate-300 mb-4">
              Track project progress and assignments
            </p>
            <Button variant="secondary" size="sm">
              View Projects
            </Button>
          </Card>

          <Card title="Assignments">
            <p className="text-slate-300 mb-4">
              Monitor workload allocation and utilization
            </p>
            <Button variant="ghost" size="sm">
              View Assignments
            </Button>
          </Card>
        </div>

        {/* System Status */}
        <Card title="System Status">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-slate-300">Backend API: Connected</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-slate-300">Database: Online</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-slate-300">Dark Mode: Active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-slate-300">Naming System: Enabled</span>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;