/**
 * Dashboard page - Team utilization overview
 * Chunk 4: Real dashboard with team metrics and VSCode dark theme
 */

import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import UtilizationBadge from '../components/ui/UtilizationBadge';
import { dashboardApi } from '../services/api';
import { DashboardData } from '../types/models';

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardApi.getDashboard();
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Loading dashboard...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="space-y-4">
          <div className="text-red-400">Error: {error}</div>
          <button
            onClick={loadDashboard}
            className="bg-[#007acc] hover:bg-[#1e90ff] text-white px-4 py-2 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-[#969696]">No dashboard data available</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[#cccccc]">
            Team Dashboard
          </h1>
          <p className="text-[#969696] mt-2">
            Overview of team utilization and workload allocation
          </p>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Total Team Members</div>
            <div className="text-2xl font-bold text-[#cccccc]">{data.summary.total_people}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Average Utilization</div>
            <div className="text-2xl font-bold text-blue-400">{data.summary.avg_utilization}%</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Active Assignments</div>
            <div className="text-2xl font-bold text-[#cccccc]">{data.summary.total_assignments}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Overallocated</div>
            <div className="text-2xl font-bold text-red-400">{data.summary.overallocated_count}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Team Overview */}
          <Card className="lg:col-span-2 bg-[#2d2d30] border-[#3e3e42]">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Team Overview</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {data.team_overview.map(person => (
                <div key={person.id} className="flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-[#cccccc]">{person.name}</div>
                    <div className="text-sm text-[#969696]">{person.role} • {person.allocated_hours}h / {person.capacity}h</div>
                  </div>
                  <UtilizationBadge percentage={person.utilization_percent} />
                </div>
              ))}
            </div>
          </Card>

          {/* Available People */}
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Available People</h3>
            <div className="space-y-3">
              {data.available_people.length === 0 ? (
                <div className="text-[#969696] text-sm">All team members are at capacity</div>
              ) : (
                data.available_people.map(person => (
                  <div key={person.id} className="text-sm">
                    <div className="text-[#cccccc] font-medium">{person.name}</div>
                    <div className="text-emerald-400">{person.available_hours}h available</div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Utilization Distribution */}
        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Utilization Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{data.utilization_distribution.underutilized}</div>
              <div className="text-sm text-[#969696]">Underutilized (&lt;70%)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{data.utilization_distribution.optimal}</div>
              <div className="text-sm text-[#969696]">Optimal (70-85%)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{data.utilization_distribution.high}</div>
              <div className="text-sm text-[#969696]">High (85-100%)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{data.utilization_distribution.overallocated}</div>
              <div className="text-sm text-[#969696]">Overallocated (&gt;100%)</div>
            </div>
          </div>
        </Card>

        {/* Recent Assignments */}
        {data.recent_assignments.length > 0 && (
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Recent Assignments</h3>
            <div className="space-y-2">
              {data.recent_assignments.map((assignment, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-[#3e3e42]/30 rounded">
                  <div>
                    <span className="text-[#cccccc] font-medium">{assignment.person}</span>
                    <span className="text-[#969696]"> assigned to </span>
                    <span className="text-[#cccccc]">{assignment.project}</span>
                  </div>
                  <div className="text-[#969696] text-sm">
                    {new Date(assignment.created).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;