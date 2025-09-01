import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Projects List Mockup - Based on reference image
 * Split-panel layout with filterable project list and detailed project view
 */
import { useState, useEffect } from 'react';
// Mock data to demonstrate the layout
const mockProjects = [
    {
        id: 1,
        name: 'Richmond Masterplanning',
        projectNumber: '#25.026.01',
        type: 'Greenfield',
        status: 'Active',
        client: 'Richmond Corp',
        nextDeliverable: '8/27/2025',
        deliverableType: 'Unknown Type'
    },
    {
        id: 2,
        name: 'KcService Due Diligence',
        projectNumber: '#25.026.01',
        type: 'Assessment',
        status: 'Active',
        client: 'KcService Ltd',
        nextDeliverable: '8/27/2025',
        deliverableType: 'Unknown Type'
    },
    {
        id: 3,
        name: 'Align Compass GA23',
        projectNumber: '#24.028.07',
        type: 'TTO',
        status: 'Active',
        client: 'Align Corp',
        nextDeliverable: '',
        deliverableType: ''
    },
    {
        id: 4,
        name: 'SNHA - ADC - CMH02',
        projectNumber: '#25.005',
        type: 'Greenfield',
        status: 'Active',
        client: 'SNHA',
        nextDeliverable: '8/14/2025',
        deliverableType: 'Unknown Type',
        isSelected: true
    },
    {
        id: 5,
        name: 'APLD - ELN02 TTO',
        projectNumber: '#24.030',
        type: 'Tenant Fit Out',
        status: 'Active',
        client: 'APLD',
        nextDeliverable: '',
        deliverableType: ''
    }
];
const mockAssignments = [
    { department: 'Electrical', person: 'Carl Weatherford', role: 'Electrical Support', hours: '0h' },
    { department: 'Fire', person: 'Andrew Searcho', role: 'Fire Protection Lead', hours: '0h' },
    { department: 'Fire', person: 'James Juren', role: 'Fire Protection Support', hours: '0h' },
    { department: 'Mechanical', person: 'Brendan Kisseback', role: 'Mechanical Lead', hours: '0h' },
    { department: 'Mechanical', person: 'Emma Reitano', role: 'Mechanical Support', hours: '0h' },
    { department: 'Mechanical', person: 'Connor Melbius', role: 'Mechanical Support', hours: '0h' }
];
const mockDeliverables = [
    {
        id: 1,
        description: 'Progress to client',
        type: 'Unknown Type',
        phase: '95%',
        hours: '0h',
        dueDate: '8/14/2025'
    },
    {
        id: 2,
        description: 'IFP (Stamped)',
        type: 'IFP',
        phase: '100%',
        hours: '0h',
        dueDate: ''
    }
];
const ProjectsListMockup = () => {
    const [selectedProject, setSelectedProject] = useState(mockProjects.find(p => p.isSelected));
    const [statusFilter, setStatusFilter] = useState('Show All');
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(mockProjects.findIndex(p => p.isSelected));
    const statusOptions = ['Active', 'Active No Dates', 'On Hold', 'Complete', 'Cancelled', 'Show All'];
    const handleProjectClick = (project, index) => {
        setSelectedProject(project);
        setSelectedIndex(index);
    };
    const getStatusColor = (status) => {
        switch (status) {
            case 'Active': return 'text-emerald-400';
            case 'On Hold': return 'text-amber-400';
            case 'Complete': return 'text-slate-400';
            case 'Cancelled': return 'text-red-400';
            default: return 'text-slate-400';
        }
    };
    const handleSort = (column) => {
        if (sortBy === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        }
        else {
            setSortBy(column);
            setSortDirection('asc');
        }
    };
    const sortedProjects = [...mockProjects].sort((a, b) => {
        let aValue, bValue;
        switch (sortBy) {
            case 'client':
                aValue = a.client;
                bValue = b.client;
                break;
            case 'name':
                aValue = a.name;
                bValue = b.name;
                break;
            case 'type':
                aValue = a.type;
                bValue = b.type;
                break;
            case 'status':
                aValue = a.status;
                bValue = b.status;
                break;
            case 'nextDeliverable':
                // Sort by date for next deliverable
                aValue = a.nextDeliverable ? new Date(a.nextDeliverable) : new Date('1900-01-01');
                bValue = b.nextDeliverable ? new Date(b.nextDeliverable) : new Date('1900-01-01');
                break;
            default:
                aValue = a.name;
                bValue = b.name;
        }
        // For date comparison
        if (sortBy === 'nextDeliverable') {
            return sortDirection === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
        }
        // For string comparison
        const result = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? result : -result;
    });
    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                let newIndex = selectedIndex;
                if (e.key === 'ArrowUp' && selectedIndex > 0) {
                    newIndex = selectedIndex - 1;
                }
                else if (e.key === 'ArrowDown' && selectedIndex < sortedProjects.length - 1) {
                    newIndex = selectedIndex + 1;
                }
                if (newIndex !== selectedIndex) {
                    setSelectedIndex(newIndex);
                    setSelectedProject(sortedProjects[newIndex]);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, sortedProjects]);
    const SortIcon = ({ column }) => {
        if (sortBy !== column)
            return null;
        return (_jsx("span", { className: "ml-1 text-[#007acc]", children: sortDirection === 'asc' ? '▲' : '▼' }));
    };
    return (_jsxs("div", { className: "min-h-screen bg-[#1e1e1e] flex", children: [_jsx("div", { className: "w-16 bg-[#2d2d30] border-r border-[#3e3e42] flex-shrink-0", children: _jsx("div", { className: "p-2", children: _jsx("div", { className: "w-8 h-8 bg-[#007acc] rounded flex items-center justify-center text-white text-xs font-bold", children: "W" }) }) }), _jsxs("div", { className: "flex-1 flex h-screen bg-[#1e1e1e]", children: [_jsxs("div", { className: "w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0", children: [_jsxs("div", { className: "p-3 border-b border-[#3e3e42]", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h1", { className: "text-lg font-semibold text-[#cccccc]", children: "Projects" }), _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ New" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs text-[#969696] mb-1 block", children: "Filter by Status:" }), _jsx("div", { className: "flex flex-wrap gap-1", children: statusOptions.map((status) => (_jsx("button", { onClick: () => setStatusFilter(status), className: `px-2 py-0.5 text-xs rounded border transition-colors ${statusFilter === status
                                                                ? 'bg-[#007acc] border-[#007acc] text-white'
                                                                : 'bg-[#3e3e42] border-[#3e3e42] text-[#969696] hover:text-[#cccccc]'}`, children: status }, status))) })] }), _jsx("div", { children: _jsx("input", { type: "text", placeholder: "Search projects", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" }) })] })] }), _jsxs("div", { className: "flex-1 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-12 gap-2 px-2 py-1.5 text-xs text-[#969696] font-medium border-b border-[#3e3e42] bg-[#2d2d30]", children: [_jsxs("div", { className: "col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('client'), children: ["CLIENT", _jsx(SortIcon, { column: "client" })] }), _jsxs("div", { className: "col-span-3 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('name'), children: ["PROJECT", _jsx(SortIcon, { column: "name" })] }), _jsxs("div", { className: "col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('type'), children: ["TYPE", _jsx(SortIcon, { column: "type" })] }), _jsxs("div", { className: "col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('status'), children: ["STATUS", _jsx(SortIcon, { column: "status" })] }), _jsxs("div", { className: "col-span-3 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('nextDeliverable'), children: ["NEXT DELIVERABLE", _jsx(SortIcon, { column: "nextDeliverable" })] })] }), _jsx("div", { className: "overflow-y-auto h-full", children: sortedProjects.map((project, index) => (_jsxs("div", { onClick: () => handleProjectClick(project, index), className: `grid grid-cols-12 gap-2 px-2 py-1.5 text-sm border-b border-[#3e3e42] cursor-pointer hover:bg-[#3e3e42]/50 transition-colors focus:outline-none ${selectedProject?.id === project.id ? 'bg-[#007acc]/20 border-[#007acc]' : ''}`, tabIndex: 0, children: [_jsx("div", { className: "col-span-2 text-[#969696] text-xs", children: project.client }), _jsxs("div", { className: "col-span-3", children: [_jsx("div", { className: "text-[#cccccc] font-medium leading-tight", children: project.name }), _jsx("div", { className: "text-[#969696] text-xs leading-tight", children: project.projectNumber })] }), _jsx("div", { className: "col-span-2 text-[#969696] text-xs", children: project.type }), _jsx("div", { className: "col-span-2", children: _jsx("span", { className: `${getStatusColor(project.status)} text-xs`, children: project.status }) }), _jsx("div", { className: "col-span-3", children: project.nextDeliverable && (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-[#cccccc] text-xs leading-tight", children: project.nextDeliverable }), _jsx("div", { className: "text-[#969696] text-xs leading-tight", children: project.deliverableType })] })) })] }, project.id))) })] })] }), _jsx("div", { className: "w-1/2 flex flex-col bg-[#2d2d30] min-w-0", children: selectedProject ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "p-4 border-b border-[#3e3e42]", children: _jsxs("div", { className: "flex justify-between items-start mb-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-[#cccccc] mb-2", children: selectedProject.name }), _jsxs("div", { className: "grid grid-cols-2 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Client:" }), _jsx("div", { className: "text-[#cccccc]", children: "ADC" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Status:" }), _jsx("div", { className: getStatusColor(selectedProject.status), children: "Active" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Project Number:" }), _jsx("div", { className: "text-[#cccccc]", children: "25.005" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Location:" }), _jsx("div", { className: "text-[#cccccc]", children: "Cornsville, OH" })] })] })] }), _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "Edit Project" })] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [_jsxs("div", { className: "pb-4 border-b border-[#3e3e42]", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h3", { className: "text-base font-semibold text-[#cccccc]", children: "Assignments" }), _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ Add Assignment" })] }), _jsxs("div", { className: "space-y-2", children: [['Electrical', 'Fire', 'Mechanical'].map((dept) => (_jsxs("div", { children: [_jsx("h4", { className: "font-medium text-[#cccccc] mb-1 text-sm", children: dept }), _jsx("div", { className: "space-y-1", children: mockAssignments
                                                                        .filter(a => a.department === dept)
                                                                        .map((assignment, index) => (_jsxs("div", { className: "flex justify-between items-center p-1.5 bg-[#3e3e42]/30 rounded text-xs", children: [_jsxs("div", { className: "flex-1", children: [index === 0 && (_jsxs("div", { className: "grid grid-cols-3 gap-4 text-[#969696] text-xs uppercase font-medium mb-1", children: [_jsx("div", { children: "PERSON" }), _jsx("div", { children: "ROLE" }), _jsx("div", { children: "HOURS" })] })), _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsx("div", { className: "text-[#cccccc]", children: assignment.person }), _jsx("div", { className: "text-[#969696]", children: assignment.role }), _jsx("div", { className: "text-[#969696]", children: assignment.hours })] })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors", children: "Edit" }), _jsx("button", { className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors", children: "Delete" })] })] }, index))) })] }, dept))), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Summary: 6 assignments \u2022 0h total planned" })] })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h3", { className: "text-base font-semibold text-[#cccccc]", children: "Deliverables" }), _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ Add Deliverable" })] }), _jsx("div", { className: "space-y-1", children: mockDeliverables.map((deliverable) => (_jsxs("div", { className: "flex justify-between items-center p-2 bg-[#3e3e42]/30 rounded", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#cccccc] font-medium text-sm", children: deliverable.description }), _jsxs("div", { className: "text-xs text-[#969696]", children: ["Type: ", deliverable.type, " \u2022 Phase: ", deliverable.phase, " \u2022 Hours: ", deliverable.hours, deliverable.dueDate && (_jsxs(_Fragment, { children: [" \u2022 Due: ", deliverable.dueDate] }))] })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors", children: "Edit" }), _jsx("button", { className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors", children: "Delete" })] })] }, deliverable.id))) })] })] })] })) : (_jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsxs("div", { className: "text-center text-[#969696]", children: [_jsx("div", { className: "text-lg mb-2", children: "Select a project" }), _jsx("div", { className: "text-sm", children: "Choose a project from the list to view details" })] }) })) })] })] }));
};
export default ProjectsListMockup;
