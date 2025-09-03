import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const Card = ({ children, className = '', title, onClick }) => {
    // VSCode-style dark theme card styling - consistent across all cards
    const baseStyles = `
    bg-[#2d2d30] border border-[#3e3e42] 
    rounded-lg shadow-lg shadow-black/5
    p-6
  `;
    return (_jsxs("div", { className: `${baseStyles} ${className}`, onClick: onClick, children: [title && (_jsx("h3", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: title })), children] }));
};
export default Card;
