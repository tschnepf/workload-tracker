import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Department Hierarchy View - Full page organizational chart
 * Shows complete department structure with navigation and details
 */
import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import DepartmentHierarchy from '@/components/departments/DepartmentHierarchy';
import { departmentsApi, peopleApi } from '@/services/api';
const HierarchyView = () => {
    const [departments, setDepartments] = useState([]);
    const [people, setPeople] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        loadData();
    }, []);
    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [deptResponse, peopleResponse] = await Promise.all([
                departmentsApi.list(),
                peopleApi.list()
            ]);
            setDepartments(deptResponse.results || []);
            setPeople(peopleResponse.results || []);
        }
        catch (err) {
            setError(err.message || 'Failed to load data');
        }
        finally {
            setLoading(false);
        }
    };
    const handleDepartmentClick = (department) => {
        setSelectedDepartment(department);
    };
    const getDepartmentStats = (department) => {
        const deptPeople = people.filter(p => p.department === department.id);
        const subDepartments = departments.filter(d => d.parentDepartment === department.id);
        return {
            directReports: deptPeople.length,
            subDepartments: subDepartments.length,
            totalTeamSize: deptPeople.length + subDepartments.reduce((total, subDept) => {
                return total + people.filter(p => p.department === subDept.id).length;
            }, 0)
        };
    };
    if (loading) {
        return (_jsx(Layout, { children: _jsx("div", { className: "flex items-center justify-center h-64", children: _jsx("div", { className: "text-[#969696]", children: "Loading organizational structure..." }) }) }));
    }
    return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold text-[#cccccc]", children: "Department Hierarchy" }), _jsx("p", { className: "text-[#969696] mt-2", children: "Organizational structure and team relationships" })] }), _jsx("div", { className: "text-right", children: _jsxs("div", { className: "text-sm text-[#969696]", children: [_jsxs("div", { children: [departments.length, " departments"] }), _jsxs("div", { children: [people.length, " people"] })] }) })] }), error && (_jsxs(Card, { className: "bg-red-500/20 border-red-500/50 p-4", children: [_jsxs("div", { className: "text-red-400", children: ["Error: ", error] }), _jsx("button", { onClick: loadData, className: "mt-2 text-sm text-[#007acc] hover:text-[#1e90ff]", children: "Retry" })] })), departments.length === 0 ? (_jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-8 text-center", children: _jsxs("div", { className: "text-[#969696]", children: [_jsx("h3", { className: "text-lg mb-2", children: "No Departments" }), _jsx("p", { children: "Create departments to see the organizational hierarchy" })] }) })) : (_jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-4 gap-6", children: [_jsx("div", { className: "xl:col-span-3", children: _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-6", children: "Organizational Chart" }), _jsx(DepartmentHierarchy, { departments: departments, people: people, onDepartmentClick: handleDepartmentClick, selectedDepartmentId: selectedDepartment?.id })] }) }), _jsx("div", { className: "xl:col-span-1", children: _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6 sticky top-6", children: selectedDepartment ? (_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Department Details" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h4", { className: "font-medium text-[#cccccc] mb-2", children: selectedDepartment.name }), _jsxs("div", { className: "space-y-1 text-sm", children: [_jsxs("div", { className: "text-[#969696]", children: ["Manager: ", _jsx("span", { className: "text-[#cccccc]", children: selectedDepartment.managerName || 'None assigned' })] }), _jsxs("div", { className: "text-[#969696]", children: ["Status: ", _jsx("span", { className: selectedDepartment.isActive ? 'text-emerald-400' : 'text-gray-400', children: selectedDepartment.isActive ? 'Active' : 'Inactive' })] })] })] }), _jsxs("div", { children: [_jsx("h4", { className: "font-medium text-[#cccccc] mb-2", children: "Statistics" }), (() => {
                                                            const stats = getDepartmentStats(selectedDepartment);
                                                            return (_jsxs("div", { className: "space-y-1 text-sm", children: [_jsxs("div", { className: "text-[#969696]", children: ["Direct reports: ", _jsx("span", { className: "text-[#cccccc]", children: stats.directReports })] }), _jsxs("div", { className: "text-[#969696]", children: ["Sub-departments: ", _jsx("span", { className: "text-[#cccccc]", children: stats.subDepartments })] }), _jsxs("div", { className: "text-[#969696]", children: ["Total team size: ", _jsx("span", { className: "text-[#cccccc]", children: stats.totalTeamSize })] })] }));
                                                        })()] }), selectedDepartment.description && (_jsxs("div", { children: [_jsx("h4", { className: "font-medium text-[#cccccc] mb-2", children: "Description" }), _jsx("p", { className: "text-sm text-[#969696]", children: selectedDepartment.description })] })), _jsxs("div", { children: [_jsx("h4", { className: "font-medium text-[#cccccc] mb-2", children: "Team Members" }), (() => {
                                                            const teamMembers = people.filter(p => p.department === selectedDepartment.id);
                                                            return teamMembers.length > 0 ? (_jsx("div", { className: "space-y-2", children: teamMembers.map(person => (_jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "text-[#cccccc]", children: person.name }), _jsxs("div", { className: "text-[#969696] text-xs", children: [person.weeklyCapacity, "h capacity"] })] }, person.id))) })) : (_jsx("div", { className: "text-sm text-[#969696]", children: "No team members assigned" }));
                                                        })()] })] })] })) : (_jsxs("div", { className: "text-center text-[#969696]", children: [_jsx("h3", { className: "text-lg mb-2", children: "Select a Department" }), _jsx("p", { className: "text-sm", children: "Click on any department in the hierarchy to view details" })] })) }) })] }))] }) }));
};
export default HierarchyView;
