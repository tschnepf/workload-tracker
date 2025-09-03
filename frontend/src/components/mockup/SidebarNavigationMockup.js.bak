import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Sidebar Navigation Mockup - VSCode-style expandable sidebar
 * Shows both expanded (with text) and collapsed (icon only) states
 * Responsive behavior based on screen width
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
const SidebarNavigationMockup = () => {
    const [screenWidth, setScreenWidth] = useState(1200); // Mock screen width for demo
    const location = useLocation();
    // Mock screen width changes for demonstration (visual only now)
    useEffect(() => {
        const interval = setInterval(() => {
            setScreenWidth(prev => {
                if (prev === 1200)
                    return 800;
                if (prev === 800)
                    return 600;
                return 1200;
            });
        }, 4000);
        return () => clearInterval(interval);
    }, []);
    // Sidebar is always collapsed now - no expansion logic needed
    // Custom Tooltip Component
    const Tooltip = ({ children, title, description }) => (_jsxs("div", { className: "group/tooltip relative", children: [children, _jsxs("div", { className: "absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-[#2d2d30] border border-[#3e3e42] rounded-md shadow-lg z-50 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 pointer-events-none min-w-[180px]", children: [_jsx("div", { className: "text-[#cccccc] text-sm font-medium mb-1", children: title }), _jsx("div", { className: "text-[#969696] text-xs", children: description }), _jsx("div", { className: "absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#3e3e42]" }), _jsx("div", { className: "absolute right-full top-1/2 -translate-y-1/2 translate-x-px border-4 border-transparent border-r-[#2d2d30]" })] })] }));
    // VSCode-style minimalistic icons
    const IconComponent = ({ type, className = "w-5 h-5", isActive = false }) => {
        const iconColor = isActive ? "currentColor" : "currentColor";
        switch (type) {
            case 'dashboard':
                return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("rect", { x: "3", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "14", width: "7", height: "7" }), _jsx("rect", { x: "3", y: "14", width: "7", height: "7" })] }));
            case 'people':
                return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })] }));
            case 'assignments':
                return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14,2 14,8 20,8" }), _jsx("line", { x1: "9", y1: "15", x2: "15", y2: "15" }), _jsx("line", { x1: "9", y1: "18", x2: "13", y2: "18" })] }));
            case 'projects':
                return (_jsx("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: _jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }) }));
            case 'reports':
                return (_jsx("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: _jsx("polyline", { points: "22,12 18,12 15,21 9,3 6,12 2,12" }) }));
            case 'settings':
                return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("path", { d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" })] }));
            case 'help':
                return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }), _jsx("circle", { cx: "12", cy: "17", r: "1" })] }));
            default:
                return (_jsx("svg", { className: className, viewBox: "0 0 24 24", fill: "none", stroke: iconColor, strokeWidth: "1.5", children: _jsx("circle", { cx: "12", cy: "12", r: "10" }) }));
        }
    };
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
            path: '/reports',
            icon: 'reports',
            label: 'Reports',
            description: 'Analytics and insights'
        },
        {
            path: '/settings',
            icon: 'settings',
            label: 'Settings',
            description: 'System configuration'
        }
    ];
    const isActive = (path) => location.pathname === path;
    return (_jsxs("div", { className: "min-h-screen bg-[#1e1e1e] flex", children: [_jsxs("div", { className: "fixed top-4 right-4 z-50 bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-4 space-y-3", children: [_jsx("div", { className: "text-[#cccccc] text-sm font-medium", children: "Always-Collapsed Sidebar Demo" }), _jsxs("div", { className: "text-[#969696] text-xs", children: ["Screen Width: ", screenWidth, "px"] }), _jsx("div", { className: "text-[#969696] text-xs", children: "State: Always Collapsed" }), _jsx("div", { className: "text-[#969696] text-xs", children: "Hover icons for tooltips" })] }), _jsxs("div", { className: "bg-[#2d2d30] border-r border-[#3e3e42] flex-shrink-0 w-16", children: [_jsx("div", { className: "h-16 flex items-center border-b border-[#3e3e42] relative", children: _jsx(Tooltip, { title: "Workload Tracker", description: "Resource Management System", children: _jsx("div", { className: "w-full h-full flex items-center justify-center", children: _jsx("div", { className: "w-8 h-8 bg-[#007acc] rounded flex items-center justify-center", children: _jsx("span", { className: "text-white text-sm font-bold", children: "WT" }) }) }) }) }), _jsxs("nav", { className: "flex-1 py-4", children: [_jsx("div", { className: "space-y-1 px-3", children: menuItems.map((item) => (_jsx(Tooltip, { title: item.label, description: item.description, children: _jsx(Link, { to: item.path, className: `
                    group flex items-center rounded-md text-sm transition-all duration-200 px-3 py-2.5 justify-center
                    ${isActive(item.path)
                                            ? 'bg-[#007acc]/10 border-r-2 border-[#007acc] text-[#007acc]'
                                            : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50'}
                  `, children: _jsx("div", { className: "flex-shrink-0", children: _jsx(IconComponent, { type: item.icon, className: "w-4 h-4", isActive: isActive(item.path) }) }) }) }, item.path))) }), _jsx("div", { className: "my-6 mx-6 border-t border-[#3e3e42]" }), _jsxs("div", { className: "px-3 space-y-1", children: [_jsx(Tooltip, { title: "Tim User", description: "Administrator", children: _jsx("div", { className: "flex items-center rounded-md hover:bg-[#3e3e42]/50 cursor-pointer transition-colors px-3 py-2.5 justify-center", children: _jsx("div", { className: "w-6 h-6 bg-[#007acc] rounded-full flex items-center justify-center flex-shrink-0", children: _jsxs("svg", { className: "w-3 h-3 text-white", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "12", cy: "7", r: "4" })] }) }) }) }), _jsx(Tooltip, { title: "Help & Support", description: "Documentation and assistance", children: _jsx(Link, { to: "/help", className: "flex items-center rounded-md text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/50 transition-colors px-3 py-2.5 justify-center", children: _jsx("div", { className: "flex-shrink-0", children: _jsx(IconComponent, { type: "help", className: "w-4 h-4" }) }) }) })] })] })] }), _jsxs("div", { className: "flex-1 flex flex-col min-w-0", children: [_jsx("div", { className: "h-12 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center px-6", children: _jsxs("div", { className: "flex items-center gap-3 text-sm text-[#969696]", children: [_jsx("span", { children: "Dashboard" }), _jsx("span", { children: "/" }), _jsx("span", { className: "text-[#cccccc]", children: "Overview" })] }) }), _jsx("main", { className: "flex-1 p-6 overflow-auto", children: _jsxs("div", { className: "max-w-6xl", children: [_jsx("h1", { className: "text-3xl font-bold text-[#cccccc] mb-2", children: "Dashboard Overview" }), _jsx("p", { className: "text-[#969696] mb-8", children: "Welcome to your workload management dashboard" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8", children: [_jsxs("div", { className: "bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-2", children: "Team Utilization" }), _jsx("div", { className: "text-3xl font-bold text-[#007acc] mb-2", children: "82%" }), _jsx("p", { className: "text-[#969696] text-sm", children: "Average team utilization this week" })] }), _jsxs("div", { className: "bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-2", children: "Active Projects" }), _jsx("div", { className: "text-3xl font-bold text-[#007acc] mb-2", children: "12" }), _jsx("p", { className: "text-[#969696] text-sm", children: "Currently active projects" })] }), _jsxs("div", { className: "bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-2", children: "Overallocated" }), _jsx("div", { className: "text-3xl font-bold text-amber-400 mb-2", children: "3" }), _jsx("p", { className: "text-[#969696] text-sm", children: "Team members over capacity" })] })] }), _jsxs("div", { className: "bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Always-Collapsed Sidebar Features" }), _jsxs("div", { className: "space-y-3 text-sm text-[#969696]", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-[#007acc] font-mono", children: "\u2022" }), _jsxs("div", { children: [_jsx("strong", { className: "text-[#cccccc]", children: "Always Collapsed:" }), " Fixed 64px width sidebar that never expands"] })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-[#007acc] font-mono", children: "\u2022" }), _jsxs("div", { children: [_jsx("strong", { className: "text-[#cccccc]", children: "Smart Tooltips:" }), " Hover over any icon to see title and description"] })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-[#007acc] font-mono", children: "\u2022" }), _jsxs("div", { children: [_jsx("strong", { className: "text-[#cccccc]", children: "Space Efficient:" }), " Maximum content area with minimal navigation footprint"] })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-[#007acc] font-mono", children: "\u2022" }), _jsxs("div", { children: [_jsx("strong", { className: "text-[#cccccc]", children: "Active States:" }), " Current page highlighted with accent color and border"] })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-[#007acc] font-mono", children: "\u2022" }), _jsxs("div", { children: [_jsx("strong", { className: "text-[#cccccc]", children: "VSCode-Style:" }), " Minimalistic icons and professional tooltip design"] })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-[#007acc] font-mono", children: "\u2022" }), _jsxs("div", { children: [_jsx("strong", { className: "text-[#cccccc]", children: "Consistent Layout:" }), " Same visual hierarchy as expanded mode but space-optimized"] })] })] })] })] }) })] })] }));
};
export default SidebarNavigationMockup;
