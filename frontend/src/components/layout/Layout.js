import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Sidebar from './Sidebar';
const Layout = ({ children }) => {
    return (_jsxs("div", { className: "min-h-screen bg-[#1e1e1e] flex", children: [_jsx(Sidebar, {}), _jsx("div", { className: "flex-1 flex flex-col min-w-0", children: _jsx("main", { className: "flex-1 px-4 sm:px-6 lg:px-8 py-8", children: children }) })] }));
};
export default Layout;
