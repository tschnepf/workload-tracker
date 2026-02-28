/**
 * Skills Dashboard - Team skills analysis and gap reporting
 * Provides comprehensive overview of team skills coverage and gaps
 */

import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PageState from '@/components/ui/PageState';
import { Person, Department, SkillTag, PersonSkill } from '@/types/models';
import { peopleApi, skillTagsApi, personSkillsApi } from '@/services/api';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useDepartments } from '@/hooks/useDepartments';
import { getFlag } from '@/lib/flags';
import { useUiSkillsPageSnapshot } from '@/hooks/useUiPageSnapshots';
import { confirmAction } from '@/lib/confirmAction';

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
  const { state: verticalState } = useVerticalFilter();
  const snapshotsEnabled = getFlag('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', true);
  const [snapshotFallbackEnabled, setSnapshotFallbackEnabled] = useState(false);
  const skillsSnapshot = useUiSkillsPageSnapshot({
    enabled: snapshotsEnabled && !snapshotFallbackEnabled,
    include: ['departments', 'people', 'skill_tags', 'person_skills'],
    vertical: verticalState.selectedVerticalId ?? undefined,
  });
  const useLegacyData = !snapshotsEnabled || snapshotFallbackEnabled;
  const { departments: legacyDepartments } = useDepartments({
    enabled: useLegacyData,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });
  const [people, setPeople] = useState<Person[]>([]);
  const [snapshotDepartments, setSnapshotDepartments] = useState<Department[]>([]);
  const [skillTags, setSkillTags] = useState<SkillTag[]>([]);
  // Manage Skill Tags (add/remove)
  const [newSkillName, setNewSkillName] = useState<string>("");
  const [newSkillCategory, setNewSkillCategory] = useState<string>("");
  const [savingSkill, setSavingSkill] = useState<boolean>(false);
  const [peopleSkills, setPeopleSkills] = useState<PersonSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const departments = snapshotDepartments.length ? snapshotDepartments : legacyDepartments;

  const [selectedDepartment, setSelectedDepartment] = useState<string>(''); // Empty = all departments
  const [viewMode, setViewMode] = useState<'coverage' | 'gaps' | 'departments'>('coverage');

  useAuthenticatedEffect(() => {
    if (!useLegacyData) return;
    loadAllData();
  }, [verticalState.selectedVerticalId, useLegacyData]);

  useEffect(() => {
    if (!snapshotsEnabled) return;
    if (!skillsSnapshot.isError) return;
    setSnapshotFallbackEnabled(true);
  }, [skillsSnapshot.isError, snapshotsEnabled]);

  useEffect(() => {
    if (!snapshotsEnabled || snapshotFallbackEnabled) return;
    if (!skillsSnapshot.data) return;
    setPeople(skillsSnapshot.data.people?.results || []);
    setSkillTags(skillsSnapshot.data.skillTags?.results || []);
    setPeopleSkills(skillsSnapshot.data.personSkills?.results || []);
    setSnapshotDepartments(skillsSnapshot.data.departments || []);
    setError(null);
    setLoading(false);
  }, [skillsSnapshot.data, snapshotsEnabled, snapshotFallbackEnabled]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [peopleResponse, skillTagsResponse, peopleSkillsResponse] = await Promise.all([
        peopleApi.list({ vertical: verticalState.selectedVerticalId ?? undefined }),
        skillTagsApi.list(),
        personSkillsApi.list()
      ]);
      
      setPeople(peopleResponse.results || []);
      setSkillTags(skillTagsResponse.results || []);
      setPeopleSkills(peopleSkillsResponse.results || []);
      
    } catch (err: any) {
      setError(err.message || 'Failed to load skills data');
    } finally {
      setLoading(false);
    }
  };

  const effectiveLoading = useLegacyData
    ? loading
    : (skillsSnapshot.isLoading && !skillsSnapshot.data);
  const effectiveError = useLegacyData
    ? error
    : (skillsSnapshot.error ? (skillsSnapshot.error as any).message || 'Failed to load skills data' : null);

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

  if (effectiveLoading) {
    return (
      <Layout>
        <PageState
          isLoading
          loadingState={(
            <div className="flex items-center justify-center h-64">
              <div className="text-[var(--muted)]">Loading skills analysis...</div>
            </div>
          )}
        />
      </Layout>
    );
  }

  if (effectiveError) {
    return (
      <Layout>
        <PageState
          error={effectiveError}
          onRetry={() => {
            if (useLegacyData) {
              void loadAllData();
            } else {
              void skillsSnapshot.refetch();
            }
          }}
        />
      </Layout>
    );
  }

  const skillsCoverage = calculateSkillsCoverage();
  const departmentSkills = calculateDepartmentSkills();
  
  async function handleAddSkillTag() {
    const name = newSkillName.trim();
    if (!name) return;
    try {
      setSavingSkill(true);
      const created = await skillTagsApi.create({ name, category: newSkillCategory.trim() || undefined } as any);
      setSkillTags(prev => {
        const next = [...prev, created];
        // keep list sorted by name to match API ordering
        return next.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      });
      setNewSkillName("");
      setNewSkillCategory("");
    } catch (e: any) {
      setError(e?.message || 'Failed to create skill');
    } finally {
      setSavingSkill(false);
    }
  }

  async function handleDeleteSkillTag(id: number) {
    try {
      const confirmed = await confirmAction({
        title: 'Delete Skill',
        message: 'Delete this skill? This cannot be undone.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!confirmed) return;
      await skillTagsApi.delete(id);
      setSkillTags(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Failed to delete skill');
    }
  }
  const stats = getCoverageStats();

  return (
    <Layout>
      <div className="ux-page-shell space-y-6">
        
        {/* Header */}
        <div className="ux-page-hero flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Skills Dashboard</h1>
            <p className="text-[var(--muted)] mt-2">
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

        {/* Manage Skill Tags */}
        <Card className="ux-panel p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-[var(--muted)] mb-1">New Skill Name</label>
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                  placeholder="e.g., Revit Families"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-[var(--muted)] mb-1">Category (optional)</label>
                <input
                  type="text"
                  value={newSkillCategory}
                  onChange={(e) => setNewSkillCategory(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                  placeholder="e.g., BIM"
                />
              </div>
              <div>
                <Button onClick={handleAddSkillTag} disabled={!newSkillName.trim() || savingSkill}>
                  {savingSkill ? 'Adding…' : 'Add Skill'}
                </Button>
              </div>
            </div>

            {/* Existing skills list (compact) */}
            <div className="max-h-40 overflow-auto border border-[var(--border)] rounded">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--border)]">
                {skillTags.map(tag => (
                  <div key={tag.id} className="flex items-center justify-between bg-[var(--card)] px-3 py-1.5">
                    <div className="text-sm text-[var(--text)] truncate">
                      <span className="font-medium">{tag.name}</span>
                      {tag.category ? <span className="text-[var(--muted)] ml-2">({tag.category})</span> : null}
                    </div>
                    <button
                      className="text-xs px-2 py-0.5 border border-[var(--border)] rounded text-[var(--muted)] hover:text-red-400 hover:border-red-500/50"
                      onClick={() => tag.id && handleDeleteSkillTag(tag.id)}
                      aria-label={`Delete skill ${tag.name}`}
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {skillTags.length === 0 && (
                  <div className="col-span-full text-center text-[var(--muted)] py-2 bg-[var(--card)]">No skills defined yet</div>
                )}
              </div>
            </div>
          </div>
        </Card>

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
          <Card className="ux-panel p-4">
            <div className="text-[var(--muted)] text-sm">Total Skills</div>
            <div className="text-2xl font-bold text-[var(--text)]">{stats.total}</div>
          </Card>
          
          <Card className="ux-panel p-4">
            <div className="text-[var(--muted)] text-sm">Excellent Coverage</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.excellent}</div>
          </Card>
          
          <Card className="ux-panel p-4">
            <div className="text-[var(--muted)] text-sm">Good Coverage</div>
            <div className="text-2xl font-bold text-blue-400">{stats.good}</div>
          </Card>
          
          <Card className="ux-panel p-4">
            <div className="text-[var(--muted)] text-sm">Limited Coverage</div>
            <div className="text-2xl font-bold text-amber-400">{stats.limited}</div>
          </Card>
          
          <Card className="ux-panel p-4">
            <div className="text-[var(--muted)] text-sm">Skills Gaps</div>
            <div className="text-2xl font-bold text-red-400">{stats.gaps}</div>
          </Card>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'coverage' && (
          <Card className="ux-panel p-6">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Skills Coverage Analysis</h3>
            <div className="space-y-4">
              {skillsCoverage.map((skill) => (
                <div key={skill.skillName} className="border-b border-[var(--border)] pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-[var(--text)]">{skill.skillName}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        skill.coverage === 'excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                        skill.coverage === 'good' ? 'bg-blue-500/20 text-blue-400' :
                        skill.coverage === 'limited' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {skill.coverage}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      {skill.totalPeople} people
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-[var(--muted)]">Strengths</div>
                      <div className="text-emerald-400 font-medium">{skill.strengths}</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">Learning</div>
                      <div className="text-blue-400 font-medium">{skill.learning}</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">Expert/Advanced</div>
                      <div className="text-purple-400 font-medium">{skill.expertCount + skill.advancedCount}</div>
                    </div>
                    <div>
                      <div className="text-[var(--muted)]">Intermediate/Beginner</div>
                      <div className="text-[var(--text)] font-medium">{skill.intermediateCount + skill.beginnerCount}</div>
                    </div>
                  </div>
                </div>
              ))}
              
              {skillsCoverage.length === 0 && (
                <div className="text-center py-8 text-[var(--muted)]">
                  No skills data available for the selected filters
                </div>
              )}
            </div>
          </Card>
        )}

        {viewMode === 'gaps' && (
          <Card className="ux-panel p-6">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Skills Gaps & Recommendations</h3>
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
              <Card key={dept.departmentId} className="ux-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--text)]">{dept.departmentName}</h3>
                  <span className="text-sm text-[var(--muted)]">{dept.peopleCount} people</span>
                </div>
                
                <div className="space-y-4">
                  {/* Top Skills */}
                  <div>
                    <div className="text-sm font-medium text-[var(--text)] mb-2">🌟 Top Skills</div>
                    <div className="flex flex-wrap gap-1">
                      {dept.topSkills.slice(0, 5).map(skill => (
                        <span key={skill} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                          {skill}
                        </span>
                      ))}
                      {dept.topSkills.length === 0 && (
                        <span className="text-xs text-[var(--muted)]">No skills data available</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Skills Gaps */}
                  {dept.skillGaps.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-[var(--text)] mb-2">⚠️ Potential Gaps</div>
                      <div className="flex flex-wrap gap-1">
                        {dept.skillGaps.map(skill => (
                          <span key={skill} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                            {skill}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-1">
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
