import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const Input = ({ label, error, className = '', ...props }) => {
    // VSCode-style dark theme input styling - consistent across all forms
    const baseStyles = `
    w-full px-3 py-2 rounded-md border text-sm transition-colors
    bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] 
    placeholder-[#969696] focus:border-[#007acc] 
    focus:ring-1 focus:ring-[#007acc] focus:outline-none
  `;
    const errorStyles = error
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
        : '';
    return (_jsxs("div", { className: "space-y-1", children: [label && (_jsxs("label", { className: "block text-sm font-medium text-[#cccccc]", children: [label, props.required && _jsx("span", { className: "text-red-400 ml-1", children: "*" })] })), _jsx("input", { className: `${baseStyles} ${errorStyles} ${className}`, ...props }), error && (_jsx("p", { className: "text-sm text-red-400", children: error }))] }));
};
export default Input;
