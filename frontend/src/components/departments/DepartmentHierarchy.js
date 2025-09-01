import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Department Hierarchy Visualization - Organizational chart component
 * Shows parent-child department relationships with team information
 */
import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
const DepartmentHierarchy = ({ departments, people, onDepartmentClick, selectedDepartmentId }) => {
    const [hierarchyTree, setHierarchyTree] = useState([]);
    useEffect(() => {
        if (departments.length > 0) {
            buildHierarchyTree();
        }
    }, [departments, people]);
    const buildHierarchyTree = () => {
        // Create department nodes with people assigned to each
        const deptNodes = {};
        departments.forEach(dept => {
            const departmentPeople = people.filter(person => person.department === dept.id);
            deptNodes[dept.id] = {
                ...dept,
                children: [],
                people: departmentPeople,
                level: 0
            };
        });
        // Build parent-child relationships
        const rootNodes = [];
        departments.forEach(dept => {
            if (dept.parentDepartment && deptNodes[dept.parentDepartment]) {
                // This department has a parent
                deptNodes[dept.parentDepartment].children.push(deptNodes[dept.id]);
            }
            else {
                // This is a root department
                rootNodes.push(deptNodes[dept.id]);
            }
        });
        // Calculate levels for proper rendering
        const calculateLevels = (nodes, level = 0) => {
            nodes.forEach(node => {
                node.level = level;
                calculateLevels(node.children, level + 1);
            });
        };
        calculateLevels(rootNodes);
        setHierarchyTree(rootNodes);
    };
    const DepartmentCard = ({ node }) => {
        const isSelected = selectedDepartmentId === node.id;
        const hasChildren = node.children.length > 0;
        return (_jsxs("div", { className: "relative", children: [_jsxs(Card, { className: `p-4 cursor-pointer transition-all bg-[#2d2d30] border-[#3e3e42] hover:bg-[#3e3e42]/50 ${isSelected ? 'ring-2 ring-[#007acc] bg-[#007acc]/10' : ''}`, onClick: () => onDepartmentClick?.(node), children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h3", { className: "font-semibold text-[#cccccc] mb-1 truncate", children: node.name }), _jsxs("div", { className: "text-xs text-[#969696] mb-2", children: ["Manager: ", node.managerName || 'None assigned'] }), _jsxs("div", { className: "flex items-center gap-4 text-xs", children: [_jsxs("div", { className: "text-blue-400", children: ["\uD83D\uDC65 ", node.people.length, " people"] }), hasChildren && (_jsxs("div", { className: "text-emerald-400", children: ["\uD83C\uDFE2 ", node.children.length, " sub-dept", node.children.length !== 1 ? 's' : ''] }))] }), node.description && (_jsx("div", { className: "text-xs text-[#969696] mt-2 line-clamp-2", children: node.description }))] }), _jsx("div", { className: `px-2 py-1 rounded text-xs ${node.isActive
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-gray-500/20 text-gray-400'}`, children: node.isActive ? 'Active' : 'Inactive' })] }), node.people.length > 0 && (_jsx("div", { className: "mt-3 pt-3 border-t border-[#3e3e42]/50", children: _jsxs("div", { className: "flex flex-wrap gap-1", children: [node.people.slice(0, 3).map((person, index) => (_jsx("span", { className: "px-2 py-1 bg-[#3e3e42]/50 text-xs text-[#cccccc] rounded", children: person.name }, person.id))), node.people.length > 3 && (_jsxs("span", { className: "px-2 py-1 bg-[#3e3e42]/30 text-xs text-[#969696] rounded", children: ["+", node.people.length - 3, " more"] }))] }) }))] }), hasChildren && (_jsxs(_Fragment, { children: [_jsx("div", { className: "absolute left-1/2 bottom-0 w-px h-6 bg-[#3e3e42] transform -translate-x-0.5" }), node.children.length > 1 && (_jsx("div", { className: "absolute top-full left-1/2 mt-6 h-px bg-[#3e3e42] transform -translate-y-0.5", style: {
                                width: `${(node.children.length - 1) * 280 + 200}px`,
                                left: `calc(50% - ${((node.children.length - 1) * 280 + 200) / 2}px)`
                            } }))] }))] }));
    };
    const renderHierarchyLevel = (nodes, level = 0) => {
        if (nodes.length === 0)
            return null;
        return (_jsx("div", { className: "space-y-8", children: _jsx("div", { className: `flex ${nodes.length === 1 ? 'justify-center' : 'justify-center space-x-8'} flex-wrap gap-8`, children: nodes.map((node) => (_jsxs("div", { className: "flex flex-col items-center relative", children: [level > 0 && (_jsx("div", { className: "w-px h-6 bg-[#3e3e42] mb-2" })), _jsx("div", { className: "w-64", children: _jsx(DepartmentCard, { node: node }) }), node.children.length > 0 && (_jsx("div", { className: "mt-8", children: renderHierarchyLevel(node.children, level + 1) }))] }, node.id))) }) }));
    };
    if (hierarchyTree.length === 0) {
        return (_jsxs("div", { className: "text-center py-8 text-[#969696]", children: [_jsx("h3", { className: "text-lg mb-2", children: "No Department Hierarchy" }), _jsx("p", { className: "text-sm", children: "Create departments to see the organizational structure" })] }));
    }
    return (_jsxs("div", { className: "w-full", children: [_jsxs("div", { className: "mb-6 p-4 bg-[#2d2d30] border border-[#3e3e42] rounded-lg", children: [_jsx("h4", { className: "text-sm font-medium text-[#cccccc] mb-2", children: "Legend" }), _jsxs("div", { className: "flex flex-wrap gap-4 text-xs text-[#969696]", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("div", { className: "w-2 h-2 bg-blue-400 rounded" }), _jsx("span", { children: "Team members" })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("div", { className: "w-2 h-2 bg-emerald-400 rounded" }), _jsx("span", { children: "Sub-departments" })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("div", { className: "w-2 h-2 bg-[#007acc] rounded" }), _jsx("span", { children: "Selected department" })] })] })] }), _jsx("div", { className: "overflow-x-auto pb-6", children: _jsx("div", { className: "min-w-max px-4", children: renderHierarchyLevel(hierarchyTree) }) })] }));
};
export default DepartmentHierarchy;
