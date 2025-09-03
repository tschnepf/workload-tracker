import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Department Reports - Comprehensive analytics and reporting
 * Provides detailed department performance metrics and insights
 */
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { dashboardApi, departmentsApi, peopleApi, personSkillsApi } from '@/services/api';
const ReportsView = () => {
    const [departments, setDepartments] = useState([]);
    const [reports, setReports] = useState([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState(4); // weeks
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [peopleSkills, setPeopleSkills] = useState([]);
    useEffect(() => {
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
            const departmentReports = await Promise.all(allDepartments.map(async (dept) => {
                const deptPeople = allPeople.filter(p => p.department === dept.id);
                let dashboardData;
                try {
                    dashboardData = await dashboardApi.getDashboard(selectedTimeframe, dept.id?.toString());
                }
                catch (err) {
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
                const skillCounts = new Map();
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
                const report = {
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
            }));
            setReports(departmentReports);
        }
        catch (err) {
            setError(err.message || 'Failed to load department reports');
        }
        finally {
            setLoading(false);
        }
    };
    const getUtilizationColor = (percentage) => {
        if (percentage < 70)
            return 'text-emerald-400';
        if (percentage <= 85)
            return 'text-blue-400';
        if (percentage <= 100)
            return 'text-amber-400';
        return 'text-red-400';
    };
    const getDepartmentHealthScore = (report) => {
        const { metrics } = report;
        let score = 100;
        // Penalize for overallocation
        if (metrics.overallocatedCount > 0) {
            score -= (metrics.overallocatedCount / metrics.teamSize) * 30;
        }
        // Optimal utilization range is 70-85%
        if (metrics.avgUtilization < 70) {
            score -= (70 - metrics.avgUtilization) * 0.5;
        }
        else if (metrics.avgUtilization > 85) {
            score -= (metrics.avgUtilization - 85) * 1.5;
        }
        // Small teams are riskier
        if (metrics.teamSize < 3) {
            score -= 10;
        }
        score = Math.max(0, Math.min(100, score));
        let status = 'Excellent';
        if (score < 60)
            status = 'Needs Attention';
        else if (score < 75)
            status = 'Fair';
        else if (score < 90)
            status = 'Good';
        return { score: Math.round(score), status };
    };
    if (loading) {
        return (_jsx(Layout, { children: _jsx("div", { className: "flex items-center justify-center h-64", children: _jsx("div", { className: "text-[#969696]", children: "Generating department reports..." }) }) }));
    }
    const totalPeople = reports.reduce((sum, r) => sum + r.metrics.teamSize, 0);
    const avgUtilization = reports.length > 0
        ? reports.reduce((sum, r) => sum + r.metrics.avgUtilization, 0) / reports.length
        : 0;
    const totalAvailableHours = reports.reduce((sum, r) => sum + r.metrics.availableHours, 0);
    return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold text-[#cccccc]", children: "Department Reports" }), _jsx("p", { className: "text-[#969696] mt-2", children: "Performance analytics and resource insights" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm text-[#969696]", children: "Timeframe:" }), _jsx("div", { className: "flex gap-1", children: [1, 2, 4, 8, 12].map((weeks) => (_jsxs("button", { onClick: () => setSelectedTimeframe(weeks), className: `px-3 py-1 text-sm rounded transition-colors ${selectedTimeframe === weeks
                                            ? 'bg-[#007acc] text-white'
                                            : 'bg-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#4e4e52]'}`, children: [weeks, "w"] }, weeks))) })] })] }), error && (_jsx(Card, { className: "bg-red-500/20 border-red-500/50 p-4", children: _jsxs("div", { className: "text-red-400", children: ["Error: ", error] }) })), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-6", children: [_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Total Departments" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: reports.length })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Total People" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: totalPeople })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Avg Utilization" }), _jsxs("div", { className: `text-2xl font-bold ${getUtilizationColor(avgUtilization)}`, children: [avgUtilization.toFixed(1), "%"] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Available Capacity" }), _jsxs("div", { className: "text-2xl font-bold text-emerald-400", children: [Math.round(totalAvailableHours), "h"] })] })] }), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: _jsxs("div", { className: "p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Department Performance Overview" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-[#3e3e42]", children: [_jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Department" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Team Size" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Utilization" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Peak" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Assignments" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Available" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Skills" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Top Skills" }), _jsx("th", { className: "text-left text-sm font-medium text-[#969696] pb-3", children: "Health" })] }) }), _jsx("tbody", { children: reports.map((report) => {
                                                const health = getDepartmentHealthScore(report);
                                                return (_jsxs("tr", { className: "border-b border-[#3e3e42]/50", children: [_jsx("td", { className: "py-3", children: _jsxs("div", { children: [_jsx("div", { className: "font-medium text-[#cccccc]", children: report.department.name }), _jsx("div", { className: "text-xs text-[#969696]", children: report.department.managerName || 'No manager' })] }) }), _jsx("td", { className: "py-3 text-[#cccccc]", children: report.metrics.teamSize }), _jsx("td", { className: "py-3", children: _jsx(UtilizationBadge, { percentage: report.metrics.avgUtilization }) }), _jsx("td", { className: "py-3", children: _jsxs("span", { className: getUtilizationColor(report.metrics.peakUtilization), children: [report.metrics.peakUtilization.toFixed(1), "%"] }) }), _jsx("td", { className: "py-3 text-[#cccccc]", children: report.metrics.totalAssignments }), _jsxs("td", { className: "py-3 text-emerald-400", children: [Math.round(report.metrics.availableHours), "h"] }), _jsx("td", { className: "py-3", children: _jsxs("div", { className: "text-sm", children: [_jsxs("div", { className: "text-[#cccccc]", children: [report.skills.uniqueSkills, " unique"] }), _jsx("div", { className: "text-[#969696] text-xs", children: report.skills.skillGaps.length > 0 && `${report.skills.skillGaps.length} gaps` })] }) }), _jsx("td", { className: "py-3", children: _jsxs("div", { className: "flex flex-wrap gap-1", children: [report.skills.topSkills.slice(0, 3).map((skill, idx) => (_jsxs("span", { className: "px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs", children: [skill.name, " (", skill.count, ")"] }, idx))), report.skills.topSkills.length > 3 && (_jsxs("span", { className: "text-xs text-[#969696]", children: ["+", report.skills.topSkills.length - 3, " more"] }))] }) }), _jsx("td", { className: "py-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `text-sm ${health.score >= 90 ? 'text-emerald-400' :
                                                                            health.score >= 75 ? 'text-blue-400' :
                                                                                health.score >= 60 ? 'text-amber-400' : 'text-red-400'}`, children: health.score }), _jsx("span", { className: "text-xs text-[#969696]", children: health.status })] }) })] }, report.department.id));
                                            }) })] }) })] }) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: _jsxs("div", { className: "p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Department Utilization Distribution" }), _jsx("div", { className: "space-y-3", children: reports.map((report) => (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm text-[#cccccc]", children: report.department.name }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-20 h-2 bg-[#3e3e42] rounded-full overflow-hidden", children: _jsx("div", { className: `h-full ${report.metrics.avgUtilization < 70 ? 'bg-emerald-400' :
                                                                    report.metrics.avgUtilization <= 85 ? 'bg-blue-400' :
                                                                        report.metrics.avgUtilization <= 100 ? 'bg-amber-400' : 'bg-red-400'}`, style: { width: `${Math.min(100, report.metrics.avgUtilization)}%` } }) }), _jsxs("span", { className: "text-sm text-[#969696] w-12 text-right", children: [report.metrics.avgUtilization.toFixed(0), "%"] })] })] }, report.department.id))) })] }) }), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: _jsxs("div", { className: "p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Available Resources" }), _jsxs("div", { className: "space-y-3", children: [reports
                                                .filter(r => r.metrics.availableHours > 0)
                                                .sort((a, b) => b.metrics.availableHours - a.metrics.availableHours)
                                                .map((report) => (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm text-[#cccccc]", children: report.department.name }), _jsxs("div", { className: "text-right", children: [_jsxs("div", { className: "text-sm text-emerald-400 font-medium", children: [Math.round(report.metrics.availableHours), "h available"] }), _jsxs("div", { className: "text-xs text-[#969696]", children: [report.metrics.teamSize, " people"] })] })] }, report.department.id))), reports.filter(r => r.metrics.availableHours > 0).length === 0 && (_jsx("div", { className: "text-center text-[#969696] py-4", children: "No departments have available capacity" }))] })] }) })] })] }) }));
};
export default ReportsView;
