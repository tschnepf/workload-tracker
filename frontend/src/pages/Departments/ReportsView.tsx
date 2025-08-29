/**
 * Department Reports - Comprehensive analytics and reporting
 * Provides detailed department performance metrics and insights
 */

import React, { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { dashboardApi, departmentsApi, peopleApi, assignmentsApi } from '@/services/api';
import { DashboardData, Department, Person, Assignment } from '@/types/models';

interface DepartmentReport {
  department: Department;
  metrics: {
    teamSize: number;
    avgUtilization: number;
    peakUtilization: number;
    totalAssignments: number;
    overallocatedCount: number;
    availableHours: number;
    utilizationTrend: 'increasing' | 'decreasing' | 'stable';
  };
  people: Person[];
  dashboardData?: DashboardData;
}

const ReportsView: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<number>(4); // weeks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedTimeframe]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load departments and people
      const [deptResponse, peopleResponse] = await Promise.all([
        departmentsApi.list(),
        peopleApi.list()
      ]);
      
      const allDepartments = deptResponse.results || [];
      const allPeople = peopleResponse.results || [];
      
      setDepartments(allDepartments);

      // Generate reports for each department
      const departmentReports = await Promise.all(
        allDepartments.map(async (dept) => {
          const deptPeople = allPeople.filter(p => p.department === dept.id);
          
          let dashboardData: DashboardData | undefined;
          try {
            dashboardData = await dashboardApi.getDashboard(selectedTimeframe, dept.id?.toString());
          } catch (err) {
            console.error(`Error loading dashboard data for department ${dept.name}:`, err);
          }

          // Calculate basic metrics
          const totalCapacity = deptPeople.reduce((sum, p) => sum + (p.weeklyCapacity || 36), 0);
          const avgUtilization = dashboardData?.summary.avg_utilization || 0;
          const availableHours = totalCapacity - (totalCapacity * avgUtilization / 100);

          const report: DepartmentReport = {
            department: dept,
            metrics: {
              teamSize: deptPeople.length,
              avgUtilization,
              peakUtilization: dashboardData?.summary.peak_utilization || 0,
              totalAssignments: dashboardData?.summary.total_assignments || 0,
              overallocatedCount: dashboardData?.summary.overallocated_count || 0,
              availableHours: Math.max(0, availableHours),
              utilizationTrend: 'stable' // TODO: Calculate trend from historical data
            },
            people: deptPeople,
            dashboardData
          };
          
          return report;
        })
      );

      setReports(departmentReports);
    } catch (err: any) {
      setError(err.message || 'Failed to load department reports');
    } finally {
      setLoading(false);
    }
  };

  const getUtilizationColor = (percentage: number): string => {
    if (percentage < 70) return 'text-emerald-400';
    if (percentage <= 85) return 'text-blue-400';
    if (percentage <= 100) return 'text-amber-400';
    return 'text-red-400';
  };

  const getDepartmentHealthScore = (report: DepartmentReport): { score: number; status: string } => {
    const { metrics } = report;
    let score = 100;
    
    // Penalize for overallocation
    if (metrics.overallocatedCount > 0) {
      score -= (metrics.overallocatedCount / metrics.teamSize) * 30;
    }
    
    // Optimal utilization range is 70-85%
    if (metrics.avgUtilization < 70) {
      score -= (70 - metrics.avgUtilization) * 0.5;
    } else if (metrics.avgUtilization > 85) {
      score -= (metrics.avgUtilization - 85) * 1.5;
    }
    
    // Small teams are riskier
    if (metrics.teamSize < 3) {
      score -= 10;
    }
    
    score = Math.max(0, Math.min(100, score));
    
    let status = 'Excellent';
    if (score < 60) status = 'Needs Attention';
    else if (score < 75) status = 'Fair';
    else if (score < 90) status = 'Good';
    
    return { score: Math.round(score), status };
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Generating department reports...</div>
        </div>
      </Layout>
    );
  }

  const totalPeople = reports.reduce((sum, r) => sum + r.metrics.teamSize, 0);
  const avgUtilization = reports.length > 0 
    ? reports.reduce((sum, r) => sum + r.metrics.avgUtilization, 0) / reports.length 
    : 0;
  const totalAvailableHours = reports.reduce((sum, r) => sum + r.metrics.availableHours, 0);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">
              Department Reports
            </h1>
            <p className="text-[#969696] mt-2">
              Performance analytics and resource insights
            </p>
          </div>
          
          {/* Timeframe Selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-[#969696]">Timeframe:</label>
            <div className="flex gap-1">
              {[1, 2, 4, 8, 12].map((weeks) => (
                <button
                  key={weeks}
                  onClick={() => setSelectedTimeframe(weeks)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    selectedTimeframe === weeks
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

        {error && (
          <Card className="bg-red-500/20 border-red-500/50 p-4">
            <div className="text-red-400">Error: {error}</div>
          </Card>
        )}

        {/* Company-Wide Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Total Departments</div>
            <div className="text-2xl font-bold text-[#cccccc]">{reports.length}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Total People</div>
            <div className="text-2xl font-bold text-[#cccccc]">{totalPeople}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Avg Utilization</div>
            <div className={`text-2xl font-bold ${getUtilizationColor(avgUtilization)}`}>
              {avgUtilization.toFixed(1)}%
            </div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Available Capacity</div>
            <div className="text-2xl font-bold text-emerald-400">
              {Math.round(totalAvailableHours)}h
            </div>
          </Card>
        </div>

        {/* Department Reports Table */}
        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
              Department Performance Overview
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#3e3e42]">
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Department</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Team Size</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Utilization</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Peak</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Assignments</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Available</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => {
                    const health = getDepartmentHealthScore(report);
                    return (
                      <tr key={report.department.id} className="border-b border-[#3e3e42]/50">
                        <td className="py-3">
                          <div>
                            <div className="font-medium text-[#cccccc]">{report.department.name}</div>
                            <div className="text-xs text-[#969696]">
                              {report.department.managerName || 'No manager'}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-[#cccccc]">
                          {report.metrics.teamSize}
                        </td>
                        <td className="py-3">
                          <UtilizationBadge percentage={report.metrics.avgUtilization} />
                        </td>
                        <td className="py-3">
                          <span className={getUtilizationColor(report.metrics.peakUtilization)}>
                            {report.metrics.peakUtilization.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 text-[#cccccc]">
                          {report.metrics.totalAssignments}
                        </td>
                        <td className="py-3 text-emerald-400">
                          {Math.round(report.metrics.availableHours)}h
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${
                              health.score >= 90 ? 'text-emerald-400' :
                              health.score >= 75 ? 'text-blue-400' :
                              health.score >= 60 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                              {health.score}
                            </span>
                            <span className="text-xs text-[#969696]">{health.status}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Department Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Utilization Distribution */}
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
                Department Utilization Distribution
              </h3>
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.department.id} className="flex items-center justify-between">
                    <span className="text-sm text-[#cccccc]">{report.department.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-[#3e3e42] rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${
                            report.metrics.avgUtilization < 70 ? 'bg-emerald-400' :
                            report.metrics.avgUtilization <= 85 ? 'bg-blue-400' :
                            report.metrics.avgUtilization <= 100 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(100, report.metrics.avgUtilization)}%` }}
                        />
                      </div>
                      <span className="text-sm text-[#969696] w-12 text-right">
                        {report.metrics.avgUtilization.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Resource Availability */}
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
                Available Resources
              </h3>
              <div className="space-y-3">
                {reports
                  .filter(r => r.metrics.availableHours > 0)
                  .sort((a, b) => b.metrics.availableHours - a.metrics.availableHours)
                  .map((report) => (
                    <div key={report.department.id} className="flex items-center justify-between">
                      <span className="text-sm text-[#cccccc]">{report.department.name}</span>
                      <div className="text-right">
                        <div className="text-sm text-emerald-400 font-medium">
                          {Math.round(report.metrics.availableHours)}h available
                        </div>
                        <div className="text-xs text-[#969696]">
                          {report.metrics.teamSize} people
                        </div>
                      </div>
                    </div>
                  ))}
                {reports.filter(r => r.metrics.availableHours > 0).length === 0 && (
                  <div className="text-center text-[#969696] py-4">
                    No departments have available capacity
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default ReportsView;