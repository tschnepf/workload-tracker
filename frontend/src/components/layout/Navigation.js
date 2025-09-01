import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from 'react-router-dom';
const Navigation = () => {
    const location = useLocation();
    // VSCode-style dark theme navigation styling - maintain consistency
    const navStyles = {
        container: 'bg-[#2d2d30] border-b border-[#3e3e42] shadow-sm',
        inner: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
        logo: 'text-xl font-bold text-[#cccccc]',
        links: 'flex space-x-8',
        link: 'text-[#969696] hover:text-[#cccccc] px-3 py-2 text-sm font-medium transition-colors',
        activeLink: 'text-[#007acc] hover:text-[#1e90ff] px-3 py-2 text-sm font-medium'
    };
    const isActive = (path) => location.pathname === path;
    return (_jsx("nav", { className: navStyles.container, children: _jsx("div", { className: navStyles.inner, children: _jsxs("div", { className: "flex justify-between items-center h-16", children: [_jsx("div", { className: navStyles.logo, children: "Workload Tracker" }), _jsxs("div", { className: navStyles.links, children: [_jsx(Link, { to: "/dashboard", className: isActive('/dashboard') ? navStyles.activeLink : navStyles.link, children: "Dashboard" }), _jsx(Link, { to: "/people", className: isActive('/people') ? navStyles.activeLink : navStyles.link, children: "People" }), _jsx(Link, { to: "/assignments", className: isActive('/assignments') ? navStyles.activeLink : navStyles.link, children: "Assignments" }), _jsx(Link, { to: "/projects", className: isActive('/projects') ? navStyles.activeLink : navStyles.link, children: "Projects" })] })] }) }) }));
};
export default Navigation;
