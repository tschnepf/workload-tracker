/**
 * Skills Dashboard - Team skills analysis and gap reporting
 * Provides comprehensive overview of team skills coverage and gaps
 */

import React, { useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Person, Department, SkillTag, PersonSkill } from '@/types/models';
import { peopleApi, departmentsApi, skillTagsApi, personSkillsApi } from '@/services/api';

interface SkillCoverage {
  skillName: string;
  totalPeople: number;
  strengths: number;
  development: number;
  learning: number;
  expertCount: number;
  advancedCount: number;
  intermediateCount: number;
  beginnerCount: number;
  coverage: 'excellent' | 'good' | 'limited' | 'gap';
}

interface DepartmentSkills {
  departmentId: number;
  departmentName: string;
  peopleCount: number;
  skillsCoverage: SkillCoverage[];
  topSkills: string[];
  skillGaps: string[];
}

const SkillsDashboard: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [skillTags, setSkillTags] = useState<SkillTag[]>([]);
  const [peopleSkills, setPeopleSkills] = useState<PersonSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDepartment, setSelectedDepartment] = useState<string>(''); // Empty = all departments
  const [viewMode, setViewMode] = useState<'coverage' | 'gaps' | 'departments'>('coverage');

  useAuthenticatedEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [peopleResponse, departmentsResponse, skillTagsResponse, peopleSkillsResponse] = await Promise.all([
        peopleApi.list(),
        departmentsApi.list(),
        skillTagsApi.list(),
        personSkillsApi.list()
      ]);
      
      setPeople(peopleResponse.results || []);
      setDepartments(departmentsResponse.results || []);
      setSkillTags(skillTagsResponse.results || []);
      setPeopleSkills(peopleSkillsResponse.results || []);
      
    } catch (err: any) {
      setError(err.message || 'Failed to load skills data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate skills coverage across the team
  const calculateSkillsCoverage = (): SkillCoverage[] => {
    const coverageMap = new Map<string, SkillCoverage>();
    
    // Initialize all skill tags
    skillTags.forEach(skill => {
      coverageMap.set(skill.name, {
        skillName: skill.name,
        totalPeople: 0,
        strengths: 0,
        development: 0,
        learning: 0,
        expertCount: 0,
        advancedCount: 0,
        intermediateCount: 0,
        beginnerCount: 0,
        coverage: 'gap'
      });
    });
    
    // Filter people by selected department
    const filteredPeople = selectedDepartment 
      ? people.filter(person => person.department?.toString() === selectedDepartment)
      : people;
    
    // Count skills across filtered people
    peopleSkills.forEach(personSkill => {
      const person = people.find(p => p.id === personSkill.person);
      if (!person) return;
      
      // Skip if department filter doesn't match
      if (selectedDepartment && person.department?.toString() !== selectedDepartment) return;
      
      const skillName = personSkill.skillTagName || 'Unknown';
      const coverage = coverageMap.get(skillName);
      
      if (coverage) {
        coverage.totalPeople++;
        
        // Count by skill type
        if (personSkill.skillType === 'strength') coverage.strengths++;
        else if (personSkill.skillType === 'development') coverage.development++;
        else if (personSkill.skillType === 'learning') coverage.learning++;
        
        // Count by proficiency level
        if (personSkill.proficiencyLevel === 'expert') coverage.expertCount++;
        else if (personSkill.proficiencyLevel === 'advanced') coverage.advancedCount++;
        else if (personSkill.proficiencyLevel === 'intermediate') coverage.intermediateCount++;
        else if (personSkill.proficiencyLevel === 'beginner') coverage.beginnerCount++;
      }
    });
    
    // Determine coverage level for each skill
    const totalPeopleCount = filteredPeople.length;
    
    coverageMap.forEach(coverage => {
      const strengthsRatio = totalPeopleCount > 0 ? coverage.strengths / totalPeopleCount : 0;
      const expertsAndAdvanced = coverage.expertCount + coverage.advancedCount;
      
      if (expertsAndAdvanced >= 3 && strengthsRatio >= 0.3) {
        coverage.coverage = 'excellent';
      } else if (expertsAndAdvanced >= 2 && strengthsRatio >= 0.2) {
        coverage.coverage = 'good';
      } else if (coverage.totalPeople > 0) {
        coverage.coverage = 'limited';
      } else {
        coverage.coverage = 'gap';
      }
    });
    
    return Array.from(coverageMap.values())
      .filter(coverage => coverage.totalPeople > 0 || coverage.coverage === 'gap')
      .sort((a, b) => {
        // Sort by coverage quality, then by total people
        const coverageOrder = { excellent: 0, good: 1, limited: 2, gap: 3 };
        const aOrder = coverageOrder[a.coverage];
        const bOrder = coverageOrder[b.coverage];
        
        if (aOrder !== bOrder) return aOrder - bOrder;
        return b.totalPeople - a.totalPeople;
      });
  };

  // Calculate department-specific skills analysis
  const calculateDepartmentSkills = (): DepartmentSkills[] => {
    return departments.map(dept => {
      const deptPeople = people.filter(person => person.department === dept.id);
      const deptPeopleIds = deptPeople.map(p => p.id);
      const deptSkills = peopleSkills.filter(skill => deptPeopleIds.includes(skill.person));
      
      // Calculate top skills for this department
      const skillCounts = new Map<string, number>();
      deptSkills.forEach(skill => {
        if (skill.skillType === 'strength') {
          const count = skillCounts.get(skill.skillTagName || '') || 0;
          skillCounts.set(skill.skillTagName || '', count + 1);
        }
      });
      
      const topSkills = Array.from(skillCounts.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([skill]) => skill);
      
      // Find skills gaps (skills present in other departments but not here)
      const allOtherSkills = new Set<string>();
      peopleSkills.forEach(skill => {
        if (!deptPeopleIds.includes(skill.person) && skill.skillType === 'strength') {
          allOtherSkills.add(skill.skillTagName || '');
        }
      });
      
      const deptSkillNames = new Set(deptSkills.map(s => s.skillTagName || ''));
      const skillGaps = Array.from(allOtherSkills)
        .filter(skill => !deptSkillNames.has(skill))
        .slice(0, 3);
      
      return {
        departmentId: dept.id!,
        departmentName: dept.name,
        peopleCount: deptPeople.length,
        skillsCoverage: [], // Can be calculated if needed
        topSkills,
        skillGaps
      };
    }).filter(dept => dept.peopleCount > 0);
  };

  // Get coverage statistics
  const getCoverageStats = () => {
    const coverage = calculateSkillsCoverage();
    const total = coverage.length;
    const excellent = coverage.filter(c => c.coverage === 'excellent').length;
    const good = coverage.filter(c => c.coverage === 'good').length;
    const limited = coverage.filter(c => c.coverage === 'limited').length;
    const gaps = coverage.filter(c => c.coverage === 'gap').length;
    
    return { total, excellent, good, limited, gaps };
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Loading skills analysis...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Card className="bg-red-500/20 border-red-500/30 p-6">
          <div className="text-red-400 font-medium mb-2">Error Loading Skills Data</div>
          <div className="text-red-300 text-sm">{error}</div>
          <Button onClick={loadAllData} className="mt-4 bg-red-500 hover:bg-red-400">
            Retry
          </Button>
        </Card>
      </Layout>
    );
  }

  const skillsCoverage = calculateSkillsCoverage();
  const departmentSkills = calculateDepartmentSkills();
  const stats = getCoverageStats();

  return (
    <Layout>
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#cccccc]">Skills Dashboard</h1>
            <p className="text-[#969696] mt-2">
              Team skills analysis, coverage, and gap identification
              {selectedDepartment && (
                <span className="block mt-1">
                  Filtered by: {departments.find(d => d.id?.toString() === selectedDepartment)?.name}
                </span>
              )}
            </p>
          </div>
          
          {/* Department Filter */}
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'coverage', label: 'Skills Coverage' },
            { key: 'gaps', label: 'Skills Gaps' },
            { key: 'departments', label: 'By Department' }
          ].map(({ key, label }) => (
            <Button
              key={key}
              onClick={() => setViewMode(key as any)}
              variant={viewMode === key ? 'primary' : 'ghost'}
              size="sm"
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
            <div className="text-[#969696] text-sm">Total Skills</div>
            <div className="text-2xl font-bold text-[#cccccc]">{stats.total}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
            <div className="text-[#969696] text-sm">Excellent Coverage</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.excellent}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
            <div className="text-[#969696] text-sm">Good Coverage</div>
            <div className="text-2xl font-bold text-blue-400">{stats.good}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
            <div className="text-[#969696] text-sm">Limited Coverage</div>
            <div className="text-2xl font-bold text-amber-400">{stats.limited}</div>
          </Card>
          
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
            <div className="text-[#969696] text-sm">Skills Gaps</div>
            <div className="text-2xl font-bold text-red-400">{stats.gaps}</div>
          </Card>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'coverage' && (
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Skills Coverage Analysis</h3>
            <div className="space-y-4">
              {skillsCoverage.map((skill) => (
                <div key={skill.skillName} className="border-b border-[#3e3e42] pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-[#cccccc]">{skill.skillName}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        skill.coverage === 'excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                        skill.coverage === 'good' ? 'bg-blue-500/20 text-blue-400' :
                        skill.coverage === 'limited' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {skill.coverage}
                      </span>
                    </div>
                    <div className="text-sm text-[#969696]">
                      {skill.totalPeople} people
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-[#969696]">Strengths</div>
                      <div className="text-emerald-400 font-medium">{skill.strengths}</div>
                    </div>
                    <div>
                      <div className="text-[#969696]">Learning</div>
                      <div className="text-blue-400 font-medium">{skill.learning}</div>
                    </div>
                    <div>
                      <div className="text-[#969696]">Expert/Advanced</div>
                      <div className="text-purple-400 font-medium">{skill.expertCount + skill.advancedCount}</div>
                    </div>
                    <div>
                      <div className="text-[#969696]">Intermediate/Beginner</div>
                      <div className="text-[#cccccc] font-medium">{skill.intermediateCount + skill.beginnerCount}</div>
                    </div>
                  </div>
                </div>
              ))}
              
              {skillsCoverage.length === 0 && (
                <div className="text-center py-8 text-[#969696]">
                  No skills data available for the selected filters
                </div>
              )}
            </div>
          </Card>
        )}

        {viewMode === 'gaps' && (
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
            <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Skills Gaps & Recommendations</h3>
            <div className="space-y-4">
              {skillsCoverage
                .filter(skill => skill.coverage === 'gap' || skill.coverage === 'limited')
                .map((skill) => (
                  <div key={skill.skillName} className="p-4 bg-amber-500/10 border border-amber-500/30 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-amber-400">{skill.skillName}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        skill.coverage === 'gap' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {skill.coverage === 'gap' ? 'No Coverage' : 'Limited Coverage'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-amber-300 mb-2">
                      {skill.coverage === 'gap' 
                        ? 'No team members have this skill as a strength. Consider hiring or training.'
                        : `Only ${skill.strengths} team member(s) have this as a strength. Consider expanding coverage.`
                      }
                    </div>
                    
                    {skill.development > 0 && (
                      <div className="text-xs text-blue-400">
                        💡 {skill.development} team member(s) are currently developing this skill
                      </div>
                    )}
                  </div>
                ))
              }
              
              {skillsCoverage.filter(s => s.coverage === 'gap' || s.coverage === 'limited').length === 0 && (
                <div className="text-center py-8 text-emerald-400">
                  🎉 Great job! No critical skills gaps detected in your team.
                </div>
              )}
            </div>
          </Card>
        )}

        {viewMode === 'departments' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {departmentSkills.map((dept) => (
              <Card key={dept.departmentId} className="bg-[#2d2d30] border-[#3e3e42] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[#cccccc]">{dept.departmentName}</h3>
                  <span className="text-sm text-[#969696]">{dept.peopleCount} people</span>
                </div>
                
                <div className="space-y-4">
                  {/* Top Skills */}
                  <div>
                    <div className="text-sm font-medium text-[#cccccc] mb-2">🌟 Top Skills</div>
                    <div className="flex flex-wrap gap-1">
                      {dept.topSkills.slice(0, 5).map(skill => (
                        <span key={skill} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                          {skill}
                        </span>
                      ))}
                      {dept.topSkills.length === 0 && (
                        <span className="text-xs text-[#969696]">No skills data available</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Skills Gaps */}
                  {dept.skillGaps.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-[#cccccc] mb-2">⚠️ Potential Gaps</div>
                      <div className="flex flex-wrap gap-1">
                        {dept.skillGaps.map(skill => (
                          <span key={skill} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                            {skill}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-[#969696] mt-1">
                        Skills present in other departments but not here
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
        
      </div>
    </Layout>
  );
};

export default SkillsDashboard;

