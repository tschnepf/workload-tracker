/**
 * Department Reports - Comprehensive analytics and reporting
 * Provides detailed department performance metrics and insights
 */

import React, { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import AssignedHoursBreakdownCard from '@/components/analytics/AssignedHoursBreakdownCard';
import AssignedHoursTimelineCard from '@/components/analytics/AssignedHoursTimelineCard';
import AssignedHoursByClientCard from '@/components/analytics/AssignedHoursByClientCard';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { resolveUtilizationLevel, defaultUtilizationScheme } from '@/util/utilization';
import { dashboardApi, departmentsApi, peopleApi, personSkillsApi } from '@/services/api';
import { DashboardData, Department, Person, PersonSkill } from '@/types/models';

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
  skills: {
    totalSkills: number;
    topSkills: Array<{ name: string; count: number }>;
    uniqueSkills: number;
    skillGaps: string[];
  };
}

// Helper: map percent → scheme level → text color classes
const getUtilizationColor = (percentage: number): string => {
  const level = resolveUtilizationLevel({ percent: Number(percentage) || 0, scheme: defaultUtilizationScheme });
  switch (level) {
    case 'blue':
      return 'text-blue-400';
    case 'green':
      return 'text-emerald-400';
    case 'orange':
      return 'text-amber-400';
    case 'red':
      return 'text-red-400';
    default:
      return 'text-blue-400';
  }
};

const ReportsView: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<number>(4); // weeks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peopleSkills, setPeopleSkills] = useState<PersonSkill[]>([]);

  useAuthenticatedEffect(() => {
    loadData();
  }, [selectedTimeframe]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load departments, people, and skills
      const [deptResponse, peopleResponse, skillsResponse] = await Promise.all([
        departmentsApi.list(),
        peopleApi.list(),
        personSkillsApi.list()
      ]);
      
      const allDepartments = deptResponse.results || [];
      const allPeople = peopleResponse.results || [];
      const allSkills = skillsResponse.results || [];
      
      setDepartments(allDepartments);
      setPeopleSkills(allSkills);

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

          // Calculate skills analysis
          const deptPeopleIds = deptPeople.map(p => p.id);
          const deptSkills = allSkills.filter(skill => deptPeopleIds.includes(skill.person));
          
          // Count skills by type and name
          const skillCounts = new Map<string, number>();
          const strengthSkills = deptSkills.filter(skill => skill.skillType === 'strength');
          
          strengthSkills.forEach(skill => {
            const skillName = skill.skillTagName || 'Unknown';
            skillCounts.set(skillName, (skillCounts.get(skillName) || 0) + 1);
          });
          
          // Get top skills sorted by count
          const topSkills = Array.from(skillCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
          
          // Find skill gaps (skills present in other departments but not here)
          const allOtherDeptSkills = allSkills
            .filter(skill => !deptPeopleIds.includes(skill.person) && skill.skillType === 'strength')
            .map(skill => skill.skillTagName || '')
            .filter(name => !skillCounts.has(name));
          
          const skillGaps = [...new Set(allOtherDeptSkills)].slice(0, 3);

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
            dashboardData,
            skills: {
              totalSkills: deptSkills.length,
              topSkills,
              uniqueSkills: skillCounts.size,
              skillGaps
            }
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

  // Peak utilization display now uses the unified UtilizationBadge for consistency

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
            <label className="text-sm text-[var(--muted)]">Timeframe:</label>
            <div className="flex gap-1">
              {[1, 2, 4, 8, 12].map((weeks) => (
                <button
                  key={weeks}
                  onClick={() => setSelectedTimeframe(weeks)}
                  className={`px-3 py-1 text-sm rounded border transition-colors focus-visible:ring-2 ring-[var(--focus)] ring-offset-1 ring-offset-[var(--card)] ${
                    selectedTimeframe === weeks
                      ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                      : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
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

        {/* Assigned Hours Breakdown */}
        <div className="flex flex-wrap gap-4">
          <AssignedHoursBreakdownCard />
          <AssignedHoursByClientCard />
        </div>

        {/* Assigned Hours Timeline */}
        <div className="mt-4">
          <AssignedHoursTimelineCard />
        </div>

        {/* Person Experience (link) */}
        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="p-6 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-[#cccccc] mb-1">Person Experience Report</div>
              <div className="text-[#969696] text-sm">Search by person and see projects, roles, phases, avg hours, and a weekly sparkline over an adjustable window.</div>
            </div>
            <a
              href="/reports/person-experience"
              className="px-3 py-2 rounded bg-[var(--primary)] text-white text-sm border border-[var(--primary)] hover:opacity-90"
            >
              Open Report
            </a>
          </div>
        </Card>

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
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Skills</th>
                    <th className="text-left text-sm font-medium text-[#969696] pb-3">Top Skills</th>
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
                          <UtilizationBadge percentage={report.metrics.peakUtilization} />
                        </td>
                        <td className="py-3 text-[#cccccc]">
                          {report.metrics.totalAssignments}
                        </td>
                        <td className="py-3 text-emerald-400">
                          {Math.round(report.metrics.availableHours)}h
                        </td>
                        <td className="py-3">
                          <div className="text-sm">
                            <div className="text-[#cccccc]">{report.skills.uniqueSkills} unique</div>
                            <div className="text-[#969696] text-xs">
                              {report.skills.skillGaps.length > 0 && `${report.skills.skillGaps.length} gaps`}
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {report.skills.topSkills.slice(0, 3).map((skill, idx) => (
                              <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                                {skill.name} ({skill.count})
                              </span>
                            ))}
                            {report.skills.topSkills.length > 3 && (
                              <span className="text-xs text-[#969696]">
                                +{report.skills.topSkills.length - 3} more
                              </span>
                            )}
                          </div>
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
          {/* New: Role Capacity vs Assigned quick access */}
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-2">Role Capacity vs Assigned</h3>
              <p className="text-[var(--muted)] text-sm mb-3">Compare weekly capacity and assigned hours per department project role over 4/8/12/16/20 weeks. Respects hire dates and active status.</p>
              <a href="/reports/role-capacity" className="inline-flex items-center gap-2 px-3 py-1 rounded border bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]">
                Open Report
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </a>
            </div>
          </Card>
          {/* Utilization Distribution */}
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-4">
                Department Utilization Distribution
              </h3>
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.department.id} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text)]">{report.department.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${
                            report.metrics.avgUtilization < 70 ? 'bg-emerald-400' :
                            report.metrics.avgUtilization <= 85 ? 'bg-blue-400' :
                            report.metrics.avgUtilization <= 100 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(100, report.metrics.avgUtilization)}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--muted)] w-12 text-right">
                        {report.metrics.avgUtilization.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Resource Availability */}
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-4">
                Available Resources
              </h3>
              <div className="space-y-3">
                {reports
                  .filter(r => r.metrics.availableHours > 0)
                  .sort((a, b) => b.metrics.availableHours - a.metrics.availableHours)
                  .map((report) => (
                    <div key={report.department.id} className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text)]">{report.department.name}</span>
                      <div className="text-right">
                        <div className="text-sm text-emerald-400 font-medium">
                          {Math.round(report.metrics.availableHours)}h available
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {report.metrics.teamSize} people
                        </div>
                      </div>
                    </div>
                  ))}
                {reports.filter(r => r.metrics.availableHours > 0).length === 0 && (
                  <div className="text-center text-[var(--muted)] py-4">
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
