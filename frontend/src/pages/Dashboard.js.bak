import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Dashboard page - Team utilization overview
 * Chunk 4: Real dashboard with team metrics and VSCode dark theme
 */
import { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import UtilizationBadge from '../components/ui/UtilizationBadge';
import SkillsFilter from '../components/skills/SkillsFilter';
import { dashboardApi, departmentsApi, personSkillsApi } from '../services/api';
const Dashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [weeksPeriod, setWeeksPeriod] = useState(1);
    // Department filtering state
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState(''); // Empty string = 'All Departments'
    // Skills filtering state
    const [selectedSkills, setSelectedSkills] = useState([]);
    const [peopleSkills, setPeopleSkills] = useState([]);
    useEffect(() => {
        loadDashboard();
        loadDepartments();
        loadPeopleSkills();
    }, [weeksPeriod, selectedDepartment]);
    const loadDepartments = async () => {
        try {
            const response = await departmentsApi.list();
            setDepartments(response.results || []);
        }
        catch (err) {
            console.error('Error loading departments:', err);
        }
    };
    const loadPeopleSkills = async () => {
        try {
            const response = await personSkillsApi.list();
            setPeopleSkills(response.results || []);
        }
        catch (err) {
            console.error('Error loading people skills:', err);
        }
    };
    const loadDashboard = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await dashboardApi.getDashboard(weeksPeriod, selectedDepartment || undefined);
            setData(response);
        }
        catch (err) {
            setError(err.message || 'Failed to load dashboard data');
        }
        finally {
            setLoading(false);
        }
    };
    const handleWeeksPeriodChange = (newWeeks) => {
        if (newWeeks >= 1 && newWeeks <= 12) {
            setWeeksPeriod(newWeeks);
        }
    };
    // Filter people based on selected skills
    const filterPeopleBySkills = (people) => {
        if (selectedSkills.length === 0)
            return people;
        return people.filter(person => {
            const personSkills = peopleSkills
                .filter(skill => skill.person === person.id && skill.skillType === 'strength')
                .map(skill => skill.skillTagName?.toLowerCase() || '');
            return selectedSkills.some(selectedSkill => personSkills.some(personSkill => personSkill.includes(selectedSkill.toLowerCase()) ||
                selectedSkill.toLowerCase().includes(personSkill)));
        });
    };
    if (loading) {
        return (_jsx(Layout, { children: _jsx("div", { className: "flex items-center justify-center h-64", children: _jsx("div", { className: "text-[#969696]", children: "Loading dashboard..." }) }) }));
    }
    if (error) {
        return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "text-red-400", children: ["Error: ", error] }), _jsx("button", { onClick: loadDashboard, className: "bg-[#007acc] hover:bg-[#1e90ff] text-white px-4 py-2 rounded transition-colors", children: "Retry" })] }) }));
    }
    if (!data) {
        return (_jsx(Layout, { children: _jsx("div", { className: "text-[#969696]", children: "No dashboard data available" }) }));
    }
    return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold text-[#cccccc]", children: "Team Dashboard" }), _jsxs("p", { className: "text-[#969696] mt-2", children: ["Overview of team utilization and workload allocation", weeksPeriod === 1 ? ' (current week)' : ` (${weeksPeriod} week average)`, selectedDepartment && (_jsxs("span", { className: "block mt-1", children: ["Filtered by: ", departments.find(d => d.id?.toString() === selectedDepartment)?.name || 'Unknown Department'] }))] })] }), _jsxs("div", { className: "flex items-center gap-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm text-[#969696]", children: "Department:" }), _jsxs("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none min-w-[140px]", children: [_jsx("option", { value: "", children: "All Departments" }), departments.map((dept) => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm text-[#969696]", children: "Time Period:" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "number", min: "1", max: "12", value: weeksPeriod, onChange: (e) => handleWeeksPeriodChange(parseInt(e.target.value) || 1), className: "w-16 px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" }), _jsx("span", { className: "text-sm text-[#969696]", children: weeksPeriod === 1 ? 'week' : 'weeks' })] }), _jsx("div", { className: "flex gap-1 ml-2", children: [1, 2, 4, 8, 12].map((weeks) => (_jsxs("button", { onClick: () => handleWeeksPeriodChange(weeks), className: `px-2 py-1 text-xs rounded transition-colors ${weeksPeriod === weeks
                                                    ? 'bg-[#007acc] text-white'
                                                    : 'bg-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#4e4e52]'}`, children: [weeks, "w"] }, weeks))) })] })] })] }), selectedSkills.length > 0 || (data && data.team_overview && data.team_overview.length > 0) ? (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("label", { className: "text-sm text-[#969696] flex-shrink-0", children: "Filter by Skills:" }), _jsx(SkillsFilter, { selectedSkills: selectedSkills, onSkillsChange: setSelectedSkills, placeholder: "Add skills filter...", className: "flex-grow max-w-md" }), selectedSkills.length > 0 && (_jsxs("div", { className: "text-xs text-blue-400 flex-shrink-0", children: ["Showing ", filterPeopleBySkills(data?.team_overview || []).length, " of ", data?.team_overview?.length || 0, " people"] }))] })) : null, _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6", children: [_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Total Team Members" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: data.summary.total_people })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Average Utilization" }), _jsxs("div", { className: "text-2xl font-bold text-blue-400", children: [data.summary.avg_utilization, "%"] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Peak Utilization" }), _jsxs("div", { className: "text-2xl font-bold text-amber-400", children: [data.summary.peak_utilization, "%"] }), data.summary.peak_person && (_jsx("div", { className: "text-xs text-[#969696] mt-1", children: data.summary.peak_person }))] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Active Assignments" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: data.summary.total_assignments })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Overallocated" }), _jsx("div", { className: "text-2xl font-bold text-red-400", children: data.summary.overallocated_count })] })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs(Card, { className: "lg:col-span-2 bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Team Overview" }), _jsx("div", { className: "space-y-3 max-h-96 overflow-y-auto", children: filterPeopleBySkills(data.team_overview).map(person => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-medium text-[#cccccc]", children: person.name }), _jsxs("div", { className: "text-sm text-[#969696]", children: [person.role, " \u2022 ", person.allocated_hours, "h / ", person.capacity, "h"] }), weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (_jsxs("div", { className: "text-xs text-amber-400 mt-1", children: ["Peak: ", person.peak_utilization_percent, "%", person.is_peak_overallocated && ' ⚠️'] }))] }), _jsxs("div", { className: "flex flex-col items-end gap-1", children: [_jsx(UtilizationBadge, { percentage: person.utilization_percent }), weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (_jsxs("div", { className: `text-xs px-2 py-1 rounded border ${person.is_peak_overallocated
                                                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                                            : person.peak_utilization_percent > 85
                                                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                                                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`, children: ["Peak: ", person.peak_utilization_percent, "%"] }))] })] }, person.id))) })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Available People" }), _jsx("div", { className: "space-y-3", children: filterPeopleBySkills(data.available_people).length === 0 ? (_jsx("div", { className: "text-[#969696] text-sm", children: selectedSkills.length > 0
                                            ? `No available people found with skills: ${selectedSkills.join(', ')}`
                                            : 'All team members are at capacity' })) : (filterPeopleBySkills(data.available_people).map(person => (_jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "text-[#cccccc] font-medium", children: person.name }), _jsxs("div", { className: "text-emerald-400", children: [person.available_hours, "h available"] })] }, person.id)))) })] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Utilization Distribution" }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-2xl font-bold text-emerald-400", children: data.utilization_distribution.underutilized }), _jsx("div", { className: "text-sm text-[#969696]", children: "Underutilized (<70%)" })] }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-2xl font-bold text-blue-400", children: data.utilization_distribution.optimal }), _jsx("div", { className: "text-sm text-[#969696]", children: "Optimal (70-85%)" })] }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-2xl font-bold text-amber-400", children: data.utilization_distribution.high }), _jsx("div", { className: "text-sm text-[#969696]", children: "High (85-100%)" })] }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-2xl font-bold text-red-400", children: data.utilization_distribution.overallocated }), _jsx("div", { className: "text-sm text-[#969696]", children: "Overallocated (>100%)" })] })] })] }), data.recent_assignments.length > 0 && (_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Recent Assignments" }), _jsx("div", { className: "space-y-2", children: data.recent_assignments.map((assignment, index) => (_jsxs("div", { className: "flex items-center justify-between p-2 bg-[#3e3e42]/30 rounded", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[#cccccc] font-medium", children: assignment.person }), _jsx("span", { className: "text-[#969696]", children: " assigned to " }), _jsx("span", { className: "text-[#cccccc]", children: assignment.project })] }), _jsx("div", { className: "text-[#969696] text-sm", children: new Date(assignment.created).toLocaleDateString() })] }, index))) })] }))] }) }));
};
export default Dashboard;
