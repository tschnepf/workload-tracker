import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Skills Dashboard - Team skills analysis and gap reporting
 * Provides comprehensive overview of team skills coverage and gaps
 */
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { peopleApi, departmentsApi, skillTagsApi, personSkillsApi } from '@/services/api';
const SkillsDashboard = () => {
    const [people, setPeople] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [skillTags, setSkillTags] = useState([]);
    const [peopleSkills, setPeopleSkills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedDepartment, setSelectedDepartment] = useState(''); // Empty = all departments
    const [viewMode, setViewMode] = useState('coverage');
    useEffect(() => {
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
        }
        catch (err) {
            setError(err.message || 'Failed to load skills data');
        }
        finally {
            setLoading(false);
        }
    };
    // Calculate skills coverage across the team
    const calculateSkillsCoverage = () => {
        const coverageMap = new Map();
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
            if (!person)
                return;
            // Skip if department filter doesn't match
            if (selectedDepartment && person.department?.toString() !== selectedDepartment)
                return;
            const skillName = personSkill.skillTagName || 'Unknown';
            const coverage = coverageMap.get(skillName);
            if (coverage) {
                coverage.totalPeople++;
                // Count by skill type
                if (personSkill.skillType === 'strength')
                    coverage.strengths++;
                else if (personSkill.skillType === 'development')
                    coverage.development++;
                else if (personSkill.skillType === 'learning')
                    coverage.learning++;
                // Count by proficiency level
                if (personSkill.proficiencyLevel === 'expert')
                    coverage.expertCount++;
                else if (personSkill.proficiencyLevel === 'advanced')
                    coverage.advancedCount++;
                else if (personSkill.proficiencyLevel === 'intermediate')
                    coverage.intermediateCount++;
                else if (personSkill.proficiencyLevel === 'beginner')
                    coverage.beginnerCount++;
            }
        });
        // Determine coverage level for each skill
        const totalPeopleCount = filteredPeople.length;
        coverageMap.forEach(coverage => {
            const strengthsRatio = totalPeopleCount > 0 ? coverage.strengths / totalPeopleCount : 0;
            const expertsAndAdvanced = coverage.expertCount + coverage.advancedCount;
            if (expertsAndAdvanced >= 3 && strengthsRatio >= 0.3) {
                coverage.coverage = 'excellent';
            }
            else if (expertsAndAdvanced >= 2 && strengthsRatio >= 0.2) {
                coverage.coverage = 'good';
            }
            else if (coverage.totalPeople > 0) {
                coverage.coverage = 'limited';
            }
            else {
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
            if (aOrder !== bOrder)
                return aOrder - bOrder;
            return b.totalPeople - a.totalPeople;
        });
    };
    // Calculate department-specific skills analysis
    const calculateDepartmentSkills = () => {
        return departments.map(dept => {
            const deptPeople = people.filter(person => person.department === dept.id);
            const deptPeopleIds = deptPeople.map(p => p.id);
            const deptSkills = peopleSkills.filter(skill => deptPeopleIds.includes(skill.person));
            // Calculate top skills for this department
            const skillCounts = new Map();
            deptSkills.forEach(skill => {
                if (skill.skillType === 'strength') {
                    const count = skillCounts.get(skill.skillTagName || '') || 0;
                    skillCounts.set(skill.skillTagName || '', count + 1);
                }
            });
            const topSkills = Array.from(skillCounts.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([skill]) => skill);
            // Find skills gaps (skills present in other departments but not here)
            const allOtherSkills = new Set();
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
                departmentId: dept.id,
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
        return (_jsx(Layout, { children: _jsx("div", { className: "flex items-center justify-center h-64", children: _jsx("div", { className: "text-[#969696]", children: "Loading skills analysis..." }) }) }));
    }
    if (error) {
        return (_jsx(Layout, { children: _jsxs(Card, { className: "bg-red-500/20 border-red-500/30 p-6", children: [_jsx("div", { className: "text-red-400 font-medium mb-2", children: "Error Loading Skills Data" }), _jsx("div", { className: "text-red-300 text-sm", children: error }), _jsx(Button, { onClick: loadAllData, className: "mt-4 bg-red-500 hover:bg-red-400", children: "Retry" })] }) }));
    }
    const skillsCoverage = calculateSkillsCoverage();
    const departmentSkills = calculateDepartmentSkills();
    const stats = getCoverageStats();
    return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: "Skills Dashboard" }), _jsxs("p", { className: "text-[#969696] mt-2", children: ["Team skills analysis, coverage, and gap identification", selectedDepartment && (_jsxs("span", { className: "block mt-1", children: ["Filtered by: ", departments.find(d => d.id?.toString() === selectedDepartment)?.name] }))] })] }), _jsx("div", { className: "flex items-center gap-4 mt-4 sm:mt-0", children: _jsxs("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "px-3 py-2 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none", children: [_jsx("option", { value: "", children: "All Departments" }), departments.map(dept => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] }) })] }), _jsx("div", { className: "flex gap-2", children: [
                        { key: 'coverage', label: 'Skills Coverage' },
                        { key: 'gaps', label: 'Skills Gaps' },
                        { key: 'departments', label: 'By Department' }
                    ].map(({ key, label }) => (_jsx(Button, { onClick: () => setViewMode(key), variant: viewMode === key ? 'primary' : 'ghost', size: "sm", children: label }, key))) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4", children: [_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-4", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Total Skills" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: stats.total })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-4", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Excellent Coverage" }), _jsx("div", { className: "text-2xl font-bold text-emerald-400", children: stats.excellent })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-4", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Good Coverage" }), _jsx("div", { className: "text-2xl font-bold text-blue-400", children: stats.good })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-4", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Limited Coverage" }), _jsx("div", { className: "text-2xl font-bold text-amber-400", children: stats.limited })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-4", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Skills Gaps" }), _jsx("div", { className: "text-2xl font-bold text-red-400", children: stats.gaps })] })] }), viewMode === 'coverage' && (_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Skills Coverage Analysis" }), _jsxs("div", { className: "space-y-4", children: [skillsCoverage.map((skill) => (_jsxs("div", { className: "border-b border-[#3e3e42] pb-4 last:border-b-0", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "font-medium text-[#cccccc]", children: skill.skillName }), _jsx("span", { className: `px-2 py-1 rounded text-xs font-medium ${skill.coverage === 'excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                skill.coverage === 'good' ? 'bg-blue-500/20 text-blue-400' :
                                                                    skill.coverage === 'limited' ? 'bg-amber-500/20 text-amber-400' :
                                                                        'bg-red-500/20 text-red-400'}`, children: skill.coverage })] }), _jsxs("div", { className: "text-sm text-[#969696]", children: [skill.totalPeople, " people"] })] }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#969696]", children: "Strengths" }), _jsx("div", { className: "text-emerald-400 font-medium", children: skill.strengths })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696]", children: "Learning" }), _jsx("div", { className: "text-blue-400 font-medium", children: skill.learning })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696]", children: "Expert/Advanced" }), _jsx("div", { className: "text-purple-400 font-medium", children: skill.expertCount + skill.advancedCount })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696]", children: "Intermediate/Beginner" }), _jsx("div", { className: "text-[#cccccc] font-medium", children: skill.intermediateCount + skill.beginnerCount })] })] })] }, skill.skillName))), skillsCoverage.length === 0 && (_jsx("div", { className: "text-center py-8 text-[#969696]", children: "No skills data available for the selected filters" }))] })] })), viewMode === 'gaps' && (_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Skills Gaps & Recommendations" }), _jsxs("div", { className: "space-y-4", children: [skillsCoverage
                                    .filter(skill => skill.coverage === 'gap' || skill.coverage === 'limited')
                                    .map((skill) => (_jsxs("div", { className: "p-4 bg-amber-500/10 border border-amber-500/30 rounded", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "font-medium text-amber-400", children: skill.skillName }), _jsx("span", { className: `px-2 py-1 rounded text-xs font-medium ${skill.coverage === 'gap' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`, children: skill.coverage === 'gap' ? 'No Coverage' : 'Limited Coverage' })] }), _jsx("div", { className: "text-sm text-amber-300 mb-2", children: skill.coverage === 'gap'
                                                ? 'No team members have this skill as a strength. Consider hiring or training.'
                                                : `Only ${skill.strengths} team member(s) have this as a strength. Consider expanding coverage.` }), skill.development > 0 && (_jsxs("div", { className: "text-xs text-blue-400", children: ["\uD83D\uDCA1 ", skill.development, " team member(s) are currently developing this skill"] }))] }, skill.skillName))), skillsCoverage.filter(s => s.coverage === 'gap' || s.coverage === 'limited').length === 0 && (_jsx("div", { className: "text-center py-8 text-emerald-400", children: "\uD83C\uDF89 Great job! No critical skills gaps detected in your team." }))] })] })), viewMode === 'departments' && (_jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: departmentSkills.map((dept) => (_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc]", children: dept.departmentName }), _jsxs("span", { className: "text-sm text-[#969696]", children: [dept.peopleCount, " people"] })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium text-[#cccccc] mb-2", children: "\uD83C\uDF1F Top Skills" }), _jsxs("div", { className: "flex flex-wrap gap-1", children: [dept.topSkills.slice(0, 5).map(skill => (_jsx("span", { className: "px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs", children: skill }, skill))), dept.topSkills.length === 0 && (_jsx("span", { className: "text-xs text-[#969696]", children: "No skills data available" }))] })] }), dept.skillGaps.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium text-[#cccccc] mb-2", children: "\u26A0\uFE0F Potential Gaps" }), _jsx("div", { className: "flex flex-wrap gap-1", children: dept.skillGaps.map(skill => (_jsx("span", { className: "px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs", children: skill }, skill))) }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Skills present in other departments but not here" })] }))] })] }, dept.departmentId))) }))] }) }));
};
export default SkillsDashboard;
