import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * RoleList Component - Display roles with clickable sortable headers
 * Phase 2.3: Follows TABLE COLUMN SORTING STANDARDS
 */
import { useState } from 'react';
const RoleList = ({ roles, onEditRole, onDeleteRole, loading }) => {
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    // Handle column header clicks for sorting
    const handleColumnSort = (column) => {
        if (sortBy === column) {
            // Toggle direction if clicking the same column
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        }
        else {
            // Set new column and reset to ascending
            setSortBy(column);
            setSortDirection('asc');
        }
    };
    // Sortable column header component - CRITICAL: follows TABLE COLUMN SORTING STANDARDS
    const SortableHeader = ({ column, children, className = "" }) => (_jsxs("button", { onClick: () => handleColumnSort(column), className: `flex items-center gap-1 text-left hover:text-[#cccccc] transition-colors ${className}`, children: [children, sortBy === column && (_jsx("svg", { className: `w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M6 9l6 6 6-6" }) }))] }));
    // Sort roles based on current sort settings
    const sortedRoles = [...roles].sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'description':
                const aDesc = a.description || '';
                const bDesc = b.description || '';
                comparison = aDesc.localeCompare(bDesc);
                break;
            case 'createdAt':
                const aDate = new Date(a.createdAt || '').getTime();
                const bDate = new Date(b.createdAt || '').getTime();
                comparison = aDate - bDate;
                break;
            default:
                comparison = a.name.localeCompare(b.name);
                break;
        }
        return sortDirection === 'desc' ? -comparison : comparison;
    });
    if (loading) {
        return (_jsx("div", { className: "text-[#969696] py-8 text-center", children: "Loading roles..." }));
    }
    if (roles.length === 0) {
        return (_jsxs("div", { className: "text-[#969696] py-8 text-center", children: [_jsx("div", { className: "mb-2", children: "No roles found" }), _jsx("div", { className: "text-sm", children: "Click \"Add Role\" to create your first role" })] }));
    }
    return (_jsxs("div", { className: "overflow-x-auto", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-3 bg-[#3e3e42]/30 border-b border-[#3e3e42] text-sm font-medium text-[#969696] rounded-t-md", children: [_jsx("div", { className: "col-span-3", children: _jsx(SortableHeader, { column: "name", children: "ROLE NAME" }) }), _jsx("div", { className: "col-span-5", children: _jsx(SortableHeader, { column: "description", children: "DESCRIPTION" }) }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { column: "createdAt", children: "CREATED" }) }), _jsx("div", { className: "col-span-1 text-center", children: "STATUS" }), _jsx("div", { className: "col-span-1 text-center", children: "ACTIONS" })] }), _jsx("div", { className: "divide-y divide-[#3e3e42]", children: sortedRoles.map((role) => (_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-4 hover:bg-[#3e3e42]/20 transition-colors", children: [_jsx("div", { className: "col-span-3", children: _jsx("div", { className: "font-medium text-[#cccccc]", children: role.name }) }), _jsx("div", { className: "col-span-5", children: _jsx("div", { className: "text-[#969696] text-sm", children: role.description || 'No description' }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "text-[#969696] text-sm", children: role.createdAt ? new Date(role.createdAt).toLocaleDateString() : '-' }) }), _jsx("div", { className: "col-span-1 text-center", children: _jsx("span", { className: `inline-block w-2 h-2 rounded-full ${role.isActive ? 'bg-emerald-400' : 'bg-[#969696]'}`, title: role.isActive ? 'Active' : 'Inactive' }) }), _jsx("div", { className: "col-span-1 text-center", children: _jsxs("div", { className: "flex items-center justify-center gap-1", children: [_jsx("button", { onClick: () => onEditRole(role), className: "text-[#969696] hover:text-[#007acc] p-1 rounded transition-colors", title: "Edit role", children: _jsxs("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }), _jsx("path", { d: "m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" })] }) }), _jsx("button", { onClick: () => onDeleteRole(role), className: "text-[#969696] hover:text-red-400 p-1 rounded transition-colors", title: "Delete role", children: _jsxs("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "3,6 5,6 21,6" }), _jsx("path", { d: "m19,6v14a2,2 0 0 1 -2,2H7a2,2 0 0 1 -2,-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2" }), _jsx("line", { x1: "10", y1: "11", x2: "10", y2: "17" }), _jsx("line", { x1: "14", y1: "11", x2: "14", y2: "17" })] }) })] }) })] }, role.id))) })] }));
};
export default RoleList;
