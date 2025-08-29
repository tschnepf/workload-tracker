/**
 * Dashboard page - Team utilization overview
 * Chunk 4: Real dashboard with team metrics and VSCode dark theme
 */

import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import UtilizationBadge from '../components/ui/UtilizationBadge';
import SkillsFilter from '../components/skills/SkillsFilter';
import { dashboardApi, departmentsApi, personSkillsApi } from '../services/api';
import { DashboardData, Department, PersonSkill } from '../types/models';

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeksPeriod, setWeeksPeriod] = useState<number>(1);
  
  // Department filtering state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(''); // Empty string = 'All Departments'
  
  // Skills filtering state
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [peopleSkills, setPeopleSkills] = useState<PersonSkill[]>([]);

  useEffect(() => {
    loadDashboard();
    loadDepartments();
    loadPeopleSkills();
  }, [weeksPeriod, selectedDepartment]);
  
  const loadDepartments = async () => {
    try {
      const response = await departmentsApi.list();
      setDepartments(response.results || []);
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadPeopleSkills = async () => {
    try {
      const response = await personSkillsApi.list();
      setPeopleSkills(response.results || []);
    } catch (err) {
      console.error('Error loading people skills:', err);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardApi.getDashboard(weeksPeriod, selectedDepartment || undefined);
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleWeeksPeriodChange = (newWeeks: number) => {
    if (newWeeks >= 1 && newWeeks <= 12) {
      setWeeksPeriod(newWeeks);
    }
  };

  // Filter people based on selected skills
  const filterPeopleBySkills = (people: any[]) => {
    if (selectedSkills.length === 0) return people;

    return people.filter(person => {
      const personSkills = peopleSkills
        .filter(skill => skill.person === person.id && skill.skillType === 'strength')
        .map(skill => skill.skillTagName?.toLowerCase() || '');

      return selectedSkills.some(selectedSkill =>
        personSkills.some(personSkill =>
          personSkill.includes(selectedSkill.toLowerCase()) ||
          selectedSkill.toLowerCase().includes(personSkill)
        )
      );
    });
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">
              Team Dashboard
            </h1>
            <p className="text-[#969696] mt-2">
              Overview of team utilization and workload allocation
              {weeksPeriod === 1 ? ' (current week)' : ` (${weeksPeriod} week average)`}
              {selectedDepartment && (
                <span className="block mt-1">
                  Filtered by: {departments.find(d => d.id?.toString() === selectedDepartment)?.name || 'Unknown Department'}
                </span>
              )}
            </p>
          </div>
          
          {/* Department and Time Period Selectors */}
          <div className="flex items-center gap-6">
            {/* Department Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-[#969696]">Department:</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none min-w-[140px]"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Time Period Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-[#969696]">Time Period:</label>
              <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="12"
                value={weeksPeriod}
                onChange={(e) => handleWeeksPeriodChange(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <span className="text-sm text-[#969696]">
                {weeksPeriod === 1 ? 'week' : 'weeks'}
              </span>
            </div>
            
              {/* Quick Select Buttons */}
              <div className="flex gap-1 ml-2">
                {[1, 2, 4, 8, 12].map((weeks) => (
                  <button
                    key={weeks}
                    onClick={() => handleWeeksPeriodChange(weeks)}
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

        {/* Skills Filter */}
        {selectedSkills.length > 0 || (data && data.team_overview && data.team_overview.length > 0) ? (
          <div className="flex items-center gap-4">
            <label className="text-sm text-[#969696] flex-shrink-0">Filter by Skills:</label>
            <SkillsFilter
              selectedSkills={selectedSkills}
              onSkillsChange={setSelectedSkills}
              placeholder="Add skills filter..."
              className="flex-grow max-w-md"
            />
            {selectedSkills.length > 0 && (
              <div className="text-xs text-blue-400 flex-shrink-0">
                Showing {filterPeopleBySkills(data?.team_overview || []).length} of {data?.team_overview?.length || 0} people
              </div>
            )}
          </div>
        ) : null}

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Total Team Members</div>
            <div className="text-2xl font-bold text-[#cccccc]">{data.summary.total_people}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Average Utilization</div>
            <div className="text-2xl font-bold text-blue-400">{data.summary.avg_utilization}%</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <div className="text-[#969696] text-sm">Peak Utilization</div>
            <div className="text-2xl font-bold text-amber-400">{data.summary.peak_utilization}%</div>
            {data.summary.peak_person && (
              <div className="text-xs text-[#969696] mt-1">{data.summary.peak_person}</div>
            )}
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
              {filterPeopleBySkills(data.team_overview).map(person => (
                <div key={person.id} className="flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-[#cccccc]">{person.name}</div>
                    <div className="text-sm text-[#969696]">{person.role} • {person.allocated_hours}h / {person.capacity}h</div>
                    {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (
                      <div className="text-xs text-amber-400 mt-1">
                        Peak: {person.peak_utilization_percent}%
                        {person.is_peak_overallocated && ' ⚠️'}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <UtilizationBadge percentage={person.utilization_percent} />
                    {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (
                      <div className={`text-xs px-2 py-1 rounded border ${
                        person.is_peak_overallocated 
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : person.peak_utilization_percent > 85
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      }`}>
                        Peak: {person.peak_utilization_percent}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Available People */}
          <Card className="bg-[#2d2d30] border-[#3e3e42]">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Available People</h3>
            <div className="space-y-3">
              {filterPeopleBySkills(data.available_people).length === 0 ? (
                <div className="text-[#969696] text-sm">
                  {selectedSkills.length > 0 
                    ? `No available people found with skills: ${selectedSkills.join(', ')}`
                    : 'All team members are at capacity'}
                </div>
              ) : (
                filterPeopleBySkills(data.available_people).map(person => (
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