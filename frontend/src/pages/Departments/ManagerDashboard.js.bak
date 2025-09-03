import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Department Manager Dashboard - Specialized view for department managers
 * Shows department-specific metrics and team management tools
 */
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { dashboardApi, departmentsApi, peopleApi } from '@/services/api';
const ManagerDashboard = () => {
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [dashboardData, setDashboardData] = useState(null);
    const [departmentPeople, setDepartmentPeople] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [weeksPeriod, setWeeksPeriod] = useState(1);
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
                setSelectedDepartment(depts[0].id.toString());
            }
        }
        catch (err) {
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
        }
        catch (err) {
            setError(err.message || 'Failed to load department data');
        }
        finally {
            setLoading(false);
        }
    };
    const loadDepartmentPeople = async () => {
        try {
            const response = await peopleApi.list();
            const allPeople = response.results || [];
            const deptPeople = allPeople.filter(person => person.department?.toString() === selectedDepartment);
            setDepartmentPeople(deptPeople);
        }
        catch (err) {
            console.error('Error loading department people:', err);
        }
    };
    const selectedDepartmentInfo = departments.find(d => d.id?.toString() === selectedDepartment);
    if (loading && !dashboardData) {
        return (_jsx(Layout, { children: _jsx("div", { className: "flex items-center justify-center h-64", children: _jsx("div", { className: "text-[#969696]", children: "Loading manager dashboard..." }) }) }));
    }
    return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold text-[#cccccc]", children: "Manager Dashboard" }), _jsxs("p", { className: "text-[#969696] mt-2", children: ["Department-focused management and team insights", selectedDepartmentInfo && (_jsxs("span", { className: "block mt-1 text-[#cccccc]", children: ["Managing: ", selectedDepartmentInfo.name] }))] })] }), _jsxs("div", { className: "flex items-center gap-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm text-[#969696]", children: "Department:" }), _jsxs("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none min-w-[140px]", children: [_jsx("option", { value: "", children: "Select Department..." }), departments.map((dept) => (_jsxs("option", { value: dept.id, children: [dept.name, " ", dept.managerName && `(${dept.managerName})`] }, dept.id)))] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm text-[#969696]", children: "Period:" }), _jsx("div", { className: "flex gap-1", children: [1, 2, 4, 8].map((weeks) => (_jsxs("button", { onClick: () => setWeeksPeriod(weeks), className: `px-2 py-1 text-xs rounded transition-colors ${weeksPeriod === weeks
                                                    ? 'bg-[#007acc] text-white'
                                                    : 'bg-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#4e4e52]'}`, children: [weeks, "w"] }, weeks))) })] })] })] }), error && (_jsx(Card, { className: "bg-red-500/20 border-red-500/50 p-4", children: _jsx("div", { className: "text-red-400", children: error }) })), !selectedDepartment ? (_jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-8 text-center", children: _jsxs("div", { className: "text-[#969696]", children: [_jsx("h3", { className: "text-lg mb-2", children: "Select a Department" }), _jsx("p", { children: "Choose a department to view management insights and team metrics" })] }) })) : dashboardData ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6", children: [_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Team Members" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: dashboardData.summary.total_people }), _jsxs("div", { className: "text-xs text-[#969696] mt-1", children: ["In ", selectedDepartmentInfo?.name] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Department Utilization" }), _jsxs("div", { className: "text-2xl font-bold text-blue-400", children: [dashboardData.summary.avg_utilization, "%"] }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: weeksPeriod === 1 ? 'Current week' : `${weeksPeriod}-week average` })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Active Assignments" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: dashboardData.summary.total_assignments }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Department projects" })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Needs Attention" }), _jsx("div", { className: "text-2xl font-bold text-red-400", children: dashboardData.summary.overallocated_count }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Overallocated people" })] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Team Management Overview" }), _jsxs("div", { className: "space-y-3 max-h-96 overflow-y-auto", children: [dashboardData.team_overview.map(person => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-medium text-[#cccccc]", children: person.name }), _jsxs("div", { className: "text-sm text-[#969696]", children: [person.role, " \u2022 ", person.allocated_hours, "h / ", person.capacity, "h"] }), weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (_jsxs("div", { className: "text-xs text-amber-400 mt-1", children: ["Peak: ", person.peak_utilization_percent, "%", person.is_peak_overallocated && ' ⚠️'] }))] }), _jsxs("div", { className: "flex flex-col items-end gap-1", children: [_jsx(UtilizationBadge, { percentage: person.utilization_percent }), person.is_overallocated && (_jsx("div", { className: "text-xs text-red-400", children: "Action needed" }))] })] }, person.id))), dashboardData.team_overview.length === 0 && (_jsx("div", { className: "text-center py-8 text-[#969696]", children: "No team members found in this department" }))] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Quick Actions" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsxs("button", { className: "p-4 bg-[#3e3e42]/50 rounded-lg border border-[#3e3e42] hover:bg-[#3e3e42]/70 transition-colors text-left", children: [_jsx("div", { className: "text-[#cccccc] font-medium mb-1", children: "\uD83D\uDC65 Manage Team" }), _jsx("div", { className: "text-sm text-[#969696]", children: "Add, edit, or reassign team members" })] }), _jsxs("button", { className: "p-4 bg-[#3e3e42]/50 rounded-lg border border-[#3e3e42] hover:bg-[#3e3e42]/70 transition-colors text-left", children: [_jsx("div", { className: "text-[#cccccc] font-medium mb-1", children: "\uD83D\uDCCA View Reports" }), _jsx("div", { className: "text-sm text-[#969696]", children: "Department performance analytics" })] }), _jsxs("button", { className: "p-4 bg-[#3e3e42]/50 rounded-lg border border-[#3e3e42] hover:bg-[#3e3e42]/70 transition-colors text-left", children: [_jsx("div", { className: "text-[#cccccc] font-medium mb-1", children: "\u2696\uFE0F Balance Workload" }), _jsx("div", { className: "text-sm text-[#969696]", children: "Redistribute assignments" })] })] })] })] })) : null] }) }));
};
export default ManagerDashboard;
