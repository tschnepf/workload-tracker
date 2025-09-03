import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Assignment List Page - Dark mode table with assignment management
 * Chunk 3: Basic assignment CRUD with utilization display
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { assignmentsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
const AssignmentList = () => {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        loadAssignments();
    }, []);
    const loadAssignments = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await assignmentsApi.list();
            setAssignments(response.results || []);
        }
        catch (err) {
            setError(err.message || 'Failed to load assignments');
        }
        finally {
            setLoading(false);
        }
    };
    const handleDelete = async (id, projectDisplayName, personName) => {
        if (!window.confirm(`Remove ${personName} from ${projectDisplayName}?`)) {
            return;
        }
        try {
            await assignmentsApi.delete(id);
            await loadAssignments(); // Reload the list
        }
        catch (err) {
            setError(err.message || 'Failed to delete assignment');
        }
    };
    if (loading) {
        return (_jsx(Layout, { children: _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: _jsx("div", { className: "text-slate-300", children: "Loading assignments..." }) }) }));
    }
    return (_jsx(Layout, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: "Project Assignments" }), _jsx(Button, { variant: "primary", onClick: () => navigate('/assignments/new'), children: "Create Assignment" })] }), error && (_jsx(Card, { className: "bg-red-500/20 border-red-500/50 p-4", children: _jsx("div", { className: "text-red-400", children: error }) })), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] overflow-hidden", children: assignments.length === 0 ? (_jsxs("div", { className: "p-6 text-center", children: [_jsx("div", { className: "text-[#969696] mb-4", children: "No project assignments yet" }), _jsx(Button, { variant: "primary", onClick: () => navigate('/assignments/new'), children: "Create First Assignment" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { className: "bg-[#3e3e42] border-b border-[#3e3e42]", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider", children: "Person" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider", children: "Project" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider", children: "Allocation" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider", children: "Created" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium text-[#cccccc] uppercase tracking-wider", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-600", children: assignments.map((assignment) => (_jsxs("tr", { className: "hover:bg-[#3e3e42]/50 transition-colors", children: [_jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: _jsx("div", { className: "font-medium text-[#cccccc]", children: assignment.personName }) }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: _jsx("div", { className: "text-slate-300", children: assignment.projectDisplayName || assignment.projectName || 'No Project' }) }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: _jsx(UtilizationBadge, { percentage: assignment.allocationPercentage }) }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: _jsx("div", { className: "text-[#969696] text-sm", children: assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : '-' }) }), _jsxs("td", { className: "px-6 py-4 whitespace-nowrap text-right text-sm space-x-2", children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => navigate(`/assignments/${assignment.id}/edit`), children: "Edit" }), _jsx(Button, { variant: "danger", size: "sm", onClick: () => handleDelete(assignment.id, assignment.projectDisplayName, assignment.personName), children: "Remove" })] })] }, assignment.id))) })] }) })) }), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-4", children: _jsxs("div", { className: "text-[#969696] text-sm", children: ["Total: ", _jsx("span", { className: "text-[#cccccc] font-medium", children: assignments.length }), " active assignments"] }) })] }) }));
};
export default AssignmentList;
