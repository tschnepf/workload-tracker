import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from 'react-router-dom';
// Reusable Icon Component for navigation
const IconComponent = ({ type, className = "w-4 h-4", isActive = false }) => {
    const iconColor = "currentColor";
    switch (type) {
        case 'dashboard':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("rect", { x: "3", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "14", width: "7", height: "7" }), _jsx("rect", { x: "3", y: "14", width: "7", height: "7" })] }));
        case 'people':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }));
        case 'assignments':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14,2 14,8 20,8" }), _jsx("line", { x1: "9", y1: "15", x2: "15", y2: "15" }), _jsx("line", { x1: "9", y1: "18", x2: "13", y2: "18" })] }));
        case 'departments':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M3 21h18" }), _jsx("path", { d: "M5 21V7l8-4v18" }), _jsx("path", { d: "M19 21V11l-6-4" })] }));
        case 'projects':
            return (_jsx("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: _jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }) }));
        case 'reports':
            return (_jsx("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: _jsx("polyline", { points: "22,12 18,12 15,21 9,3 6,12 2,12" }) }));
        case 'skills':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M12 2L2 7v10c0 5.55 3.84 10 9 11 1.16.21 2.76.21 3.92 0C20.16 27 24 22.55 24 17V7l-10-5z" }), _jsx("path", { d: "M8 11l2 2 4-4" })] }));
        case 'hierarchy':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }), _jsx("path", { d: "M16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }), _jsx("path", { d: "M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }), _jsx("path", { d: "M10.5 8.5 9.5 14.5" }), _jsx("path", { d: "M13.5 8.5 14.5 14.5" })] }));
        case 'manager':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("circle", { cx: "12", cy: "8", r: "5" }), _jsx("path", { d: "M20 21a8 8 0 0 0-16 0" }), _jsx("path", { d: "M12 13v8" }), _jsx("path", { d: "M8 17l4-4 4 4" })] }));
        case 'settings':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" })] }));
        case 'help':
            return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }), _jsx("circle", { cx: "12", cy: "17", r: "1" })] }));
        default:
            return (_jsx("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: _jsx("circle", { cx: "12", cy: "12", r: "10" }) }));
    }
};
// Tooltip Component for hover labels
const Tooltip = ({ children, title, description }) => (_jsxs("div", { className: "group/tooltip relative", children: [children, _jsxs("div", { className: "absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-[#2d2d30] border border-[#3e3e42] rounded-md shadow-lg z-50 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 pointer-events-none min-w-[180px]", children: [_jsx("div", { className: "text-[#cccccc] text-sm font-medium mb-1", children: title }), _jsx("div", { className: "text-[#969696] text-xs", children: description }), _jsx("div", { className: "absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#3e3e42]" }), _jsx("div", { className: "absolute right-full top-1/2 -translate-y-1/2 translate-x-px border-4 border-transparent border-r-[#2d2d30]" })] })] }));
const Sidebar = () => {
    const location = useLocation();
    const menuItems = [
        {
            path: '/dashboard',
            icon: 'dashboard',
            label: 'Dashboard',
            description: 'Overview and metrics'
        },
        {
            path: '/people',
            icon: 'people',
            label: 'People',
            description: 'Team management'
        },
        {
            path: '/departments',
            icon: 'departments',
            label: 'Departments',
            description: 'Organization structure'
        },
        {
            path: '/assignments',
            icon: 'assignments',
            label: 'Assignments',
            description: 'Workload allocation'
        },
        {
            path: '/projects',
            icon: 'projects',
            label: 'Projects',
            description: 'Project tracking'
        },
        {
            path: '/skills',
            icon: 'skills',
            label: 'Skills',
            description: 'Team skills analysis'
        },
        {
            path: '/settings',
            icon: 'settings',
            label: 'Settings',
            description: 'System configuration'
        }
    ];
    // Advanced department features
    const departmentItems = [
        {
            path: '/departments/manager',
            icon: 'manager',
            label: 'Manager View',
            description: 'Department management dashboard'
        },
        {
            path: '/departments/hierarchy',
            icon: 'hierarchy',
            label: 'Org Chart',
            description: 'Department hierarchy visualization'
        },
        {
            path: '/departments/reports',
            icon: 'reports',
            label: 'Reports',
            description: 'Department analytics and insights'
        }
    ];
    const systemItems = [
        {
            path: '/settings',
            icon: 'settings',
            label: 'Settings',
            description: 'System configuration'
        }
    ];
    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
    return (_jsxs("div", { className: "bg-[#2d2d30] border-r border-[#3e3e42] flex-shrink-0 w-16", children: [_jsx("div", { className: "h-16 flex items-center border-b border-[#3e3e42] relative", children: _jsx(Tooltip, { title: "Workload Tracker", description: "Resource Management System", children: _jsx("div", { className: "w-full h-full flex items-center justify-center", children: _jsx("div", { className: "w-8 h-8 bg-[#007acc] rounded flex items-center justify-center", children: _jsx("span", { className: "text-white text-sm font-bold", children: "WT" }) }) }) }) }), _jsxs("nav", { className: "flex-1 py-4", children: [_jsx("div", { className: "space-y-1 px-3", children: menuItems.map((item) => (_jsx(Tooltip, { title: item.label, description: item.description, children: _jsx(Link, { to: item.path, className: `
                  group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 justify-center
                  ${isActive(item.path)
                                    ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]'
                                    : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'}
                `, children: _jsx("div", { className: "flex-shrink-0", children: _jsx(IconComponent, { type: item.icon, className: "w-4 h-4", isActive: isActive(item.path) }) }) }) }, item.path))) }), _jsx("div", { className: "my-4 mx-6 border-t border-[#3e3e42]" }), _jsx("div", { className: "space-y-1 px-3", children: departmentItems.map((item) => (_jsx(Tooltip, { title: item.label, description: item.description, children: _jsx(Link, { to: item.path, className: `
                  group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 justify-center
                  ${isActive(item.path)
                                    ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]'
                                    : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'}
                `, children: _jsx("div", { className: "flex-shrink-0", children: _jsx(IconComponent, { type: item.icon, className: "w-4 h-4", isActive: isActive(item.path) }) }) }) }, item.path))) }), _jsx("div", { className: "my-4 mx-6 border-t border-[#3e3e42]" }), _jsx("div", { className: "space-y-1 px-3", children: systemItems.map((item) => (_jsx(Tooltip, { title: item.label, description: item.description, children: _jsx(Link, { to: item.path, className: `
                  group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 justify-center
                  ${isActive(item.path)
                                    ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]'
                                    : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'}
                `, children: _jsx("div", { className: "flex-shrink-0", children: _jsx(IconComponent, { type: item.icon, className: "w-4 h-4", isActive: isActive(item.path) }) }) }) }, item.path))) }), _jsx("div", { className: "my-6 mx-6 border-t border-[#3e3e42]" }), _jsxs("div", { className: "px-3 space-y-1", children: [_jsx(Tooltip, { title: "User Profile", description: "Account settings", children: _jsx("div", { className: "flex items-center rounded-md hover:bg-[#3e3e42]/50 cursor-pointer transition-colors px-3 py-2.5 justify-center", children: _jsx("div", { className: "w-6 h-6 bg-[#007acc] rounded-full flex items-center justify-center flex-shrink-0", children: _jsxs("svg", { className: "w-3 h-3 text-white", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "12", cy: "7", r: "4" })] }) }) }) }), _jsx(Tooltip, { title: "Help & Support", description: "Documentation and assistance", children: _jsx(Link, { to: "/help", className: "flex items-center rounded-md text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50 transition-colors px-3 py-2.5 justify-center", children: _jsx("div", { className: "flex-shrink-0", children: _jsx(IconComponent, { type: "help", className: "w-4 h-4" }) }) }) })] })] })] }));
};
export default Sidebar;
