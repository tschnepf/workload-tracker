import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import ErrorBoundary from './ErrorBoundary';
/**
 * Custom error fallback for page-level errors
 */
const PageErrorFallback = ({ error, errorId, pageName }) => {
    return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-[#1e1e1e]", children: _jsxs("div", { className: "text-center max-w-lg px-6", children: [_jsxs("div", { className: "mb-6", children: [_jsx("div", { className: "text-6xl mb-4", children: "\uD83D\uDEA8" }), _jsx("h1", { className: "text-2xl font-bold text-red-400 mb-2", children: "Page Error" }), _jsxs("p", { className: "text-[#969696]", children: [pageName ? `The ${pageName} page` : 'This page', " encountered an error and couldn't load properly."] })] }), process.env.NODE_ENV === 'development' && error && (_jsxs("details", { className: "text-left mb-6 p-4 bg-[#2d2d30] rounded", children: [_jsx("summary", { className: "cursor-pointer text-[#cccccc] mb-3 font-semibold", children: "Technical Details" }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { children: [_jsx("div", { className: "text-red-300 font-semibold mb-1", children: "Error Message:" }), _jsx("div", { className: "text-[#cccccc] font-mono text-sm bg-[#1e1e1e] p-2 rounded", children: error.message })] }), _jsxs("div", { children: [_jsx("div", { className: "text-red-300 font-semibold mb-1", children: "Stack Trace:" }), _jsx("div", { className: "text-[#969696] font-mono text-xs bg-[#1e1e1e] p-2 rounded overflow-auto max-h-40", children: error.stack })] })] })] })), _jsxs("div", { className: "flex flex-col sm:flex-row gap-3 justify-center", children: [_jsx("button", { onClick: () => window.location.reload(), className: "bg-[#007acc] hover:bg-[#005a99] text-white px-6 py-3 rounded font-medium transition-colors", children: "Reload Page" }), _jsx("button", { onClick: () => window.location.href = '/dashboard', className: "bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc] px-6 py-3 rounded font-medium transition-colors", children: "Go to Dashboard" })] }), errorId && (_jsxs("div", { className: "mt-6 p-3 bg-[#2d2d30] rounded", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "If this error persists, please report it with this ID:" }), _jsx("div", { className: "text-[#cccccc] font-mono text-sm mt-1 select-all", children: errorId })] }))] }) }));
};
/**
 * Page Error Boundary component
 */
const PageErrorBoundary = ({ children, pageName }) => {
    return (_jsx(ErrorBoundary, { level: "page", fallbackComponent: (state) => (_jsx(PageErrorFallback, { ...state, pageName: pageName })), onError: (error, errorInfo) => {
            console.error(`Page Error in ${pageName || 'unknown page'}:`, error, errorInfo);
        }, children: children }));
};
export default PageErrorBoundary;
