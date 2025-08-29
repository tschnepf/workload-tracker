/**
 * Department Manager Dashboard - Specialized view for department managers
 * Shows department-specific metrics and team management tools
 */

import React, { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { dashboardApi, departmentsApi, peopleApi } from '@/services/api';
import { DashboardData, Department, Person } from '@/types/models';

const ManagerDashboard: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [departmentPeople, setDepartmentPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeksPeriod, setWeeksPeriod] = useState<number>(1);

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      loadDepartmentData();
      loadDepartmentPeople();
    }
  }, [selectedDepartment, weeksPeriod]);

  const loadDepartments = async () => {
    try {
      const response = await departmentsApi.list();
      const depts = response.results || [];
      setDepartments(depts);
      
      // Auto-select first department if available
      if (depts.length > 0 && !selectedDepartment) {
        setSelectedDepartment(depts[0].id!.toString());
      }
    } catch (err) {
      console.error('Error loading departments:', err);
      setError('Failed to load departments');
    }
  };

  const loadDepartmentData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardApi.getDashboard(weeksPeriod, selectedDepartment);
      setDashboardData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load department data');
    } finally {
      setLoading(false);
    }
  };

  const loadDepartmentPeople = async () => {
    try {
      const response = await peopleApi.list();
      const allPeople = response.results || [];
      const deptPeople = allPeople.filter(person => 
        person.department?.toString() === selectedDepartment
      );
      setDepartmentPeople(deptPeople);
    } catch (err) {
      console.error('Error loading department people:', err);
    }
  };

  const selectedDepartmentInfo = departments.find(d => d.id?.toString() === selectedDepartment);

  if (loading && !dashboardData) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Loading manager dashboard...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">
              Manager Dashboard
            </h1>
            <p className="text-[#969696] mt-2">
              Department-focused management and team insights
              {selectedDepartmentInfo && (
                <span className="block mt-1 text-[#cccccc]">
                  Managing: {selectedDepartmentInfo.name}
                </span>
              )}
            </p>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-6">
            {/* Department Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-[#969696]">Department:</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none min-w-[140px]"
              >
                <option value="">Select Department...</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} {dept.managerName && `(${dept.managerName})`}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Time Period Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-[#969696]">Period:</label>
              <div className="flex gap-1">
                {[1, 2, 4, 8].map((weeks) => (
                  <button
                    key={weeks}
                    onClick={() => setWeeksPeriod(weeks)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      weeksPeriod === weeks
                        ? 'bg-[#007acc] text-white'
                        : 'bg-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#4e4e52]'
                    }`}
                  >
                    {weeks}w
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <Card className="bg-red-500/20 border-red-500/50 p-4">
            <div className="text-red-400">{error}</div>
          </Card>
        )}

        {!selectedDepartment ? (
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-8 text-center">
            <div className="text-[#969696]">
              <h3 className="text-lg mb-2">Select a Department</h3>
              <p>Choose a department to view management insights and team metrics</p>
            </div>
          </Card>
        ) : dashboardData ? (
          <>
            {/* Department Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-[#2d2d30] border-[#3e3e42]">
                <div className="text-[#969696] text-sm">Team Members</div>
                <div className="text-2xl font-bold text-[#cccccc]">
                  {dashboardData.summary.total_people}
                </div>
                <div className="text-xs text-[#969696] mt-1">
                  In {selectedDepartmentInfo?.name}
                </div>
              </Card>
              
              <Card className="bg-[#2d2d30] border-[#3e3e42]">
                <div className="text-[#969696] text-sm">Department Utilization</div>
                <div className="text-2xl font-bold text-blue-400">
                  {dashboardData.summary.avg_utilization}%
                </div>
                <div className="text-xs text-[#969696] mt-1">
                  {weeksPeriod === 1 ? 'Current week' : `${weeksPeriod}-week average`}
                </div>
              </Card>
              
              <Card className="bg-[#2d2d30] border-[#3e3e42]">
                <div className="text-[#969696] text-sm">Active Assignments</div>
                <div className="text-2xl font-bold text-[#cccccc]">
                  {dashboardData.summary.total_assignments}
                </div>
                <div className="text-xs text-[#969696] mt-1">
                  Department projects
                </div>
              </Card>
              
              <Card className="bg-[#2d2d30] border-[#3e3e42]">
                <div className="text-[#969696] text-sm">Needs Attention</div>
                <div className="text-2xl font-bold text-red-400">
                  {dashboardData.summary.overallocated_count}
                </div>
                <div className="text-xs text-[#969696] mt-1">
                  Overallocated people
                </div>
              </Card>
            </div>

            {/* Team Overview */}
            <Card className="bg-[#2d2d30] border-[#3e3e42]">
              <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
                Team Management Overview
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {dashboardData.team_overview.map(person => (
                  <div key={person.id} className="flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-[#cccccc]">{person.name}</div>
                      <div className="text-sm text-[#969696]">
                        {person.role} • {person.allocated_hours}h / {person.capacity}h
                      </div>
                      {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (
                        <div className="text-xs text-amber-400 mt-1">
                          Peak: {person.peak_utilization_percent}%
                          {person.is_peak_overallocated && ' ⚠️'}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <UtilizationBadge percentage={person.utilization_percent} />
                      {person.is_overallocated && (
                        <div className="text-xs text-red-400">
                          Action needed
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {dashboardData.team_overview.length === 0 && (
                  <div className="text-center py-8 text-[#969696]">
                    No team members found in this department
                  </div>
                )}
              </div>
            </Card>

            {/* Manager Actions Panel */}
            <Card className="bg-[#2d2d30] border-[#3e3e42]">
              <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
                Quick Actions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button className="p-4 bg-[#3e3e42]/50 rounded-lg border border-[#3e3e42] hover:bg-[#3e3e42]/70 transition-colors text-left">
                  <div className="text-[#cccccc] font-medium mb-1">👥 Manage Team</div>
                  <div className="text-sm text-[#969696]">Add, edit, or reassign team members</div>
                </button>
                
                <button className="p-4 bg-[#3e3e42]/50 rounded-lg border border-[#3e3e42] hover:bg-[#3e3e42]/70 transition-colors text-left">
                  <div className="text-[#cccccc] font-medium mb-1">📊 View Reports</div>
                  <div className="text-sm text-[#969696]">Department performance analytics</div>
                </button>
                
                <button className="p-4 bg-[#3e3e42]/50 rounded-lg border border-[#3e3e42] hover:bg-[#3e3e42]/70 transition-colors text-left">
                  <div className="text-[#cccccc] font-medium mb-1">⚖️ Balance Workload</div>
                  <div className="text-sm text-[#969696]">Redistribute assignments</div>
                </button>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </Layout>
  );
};

export default ManagerDashboard;