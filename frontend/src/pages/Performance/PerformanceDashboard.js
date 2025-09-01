import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Performance Dashboard - Phase 6 Implementation
 * Comprehensive performance monitoring and metrics visualization
 */
import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { getEnhancedPerformanceSummary, getEnhancedPerformanceMetrics, getBudgetViolations, PERFORMANCE_BUDGETS, trackPerformanceEvent, EnhancedPerformanceTimer } from '@/utils/monitoring';
const PerformanceDashboard = () => {
    const [summary, setSummary] = useState(null);
    const [metrics, setMetrics] = useState([]);
    const [violations, setViolations] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const refreshData = () => {
        const timer = new EnhancedPerformanceTimer('performance_dashboard_refresh');
        try {
            setIsLoading(true);
            const currentSummary = getEnhancedPerformanceSummary();
            const currentMetrics = getEnhancedPerformanceMetrics();
            const currentViolations = getBudgetViolations();
            setSummary(currentSummary);
            setMetrics(currentMetrics);
            setViolations(currentViolations);
            setLastUpdated(new Date());
            trackPerformanceEvent('dashboard_refresh', timer.end().duration);
        }
        finally {
            setIsLoading(false);
        }
    };
    useEffect(() => {
        refreshData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(refreshData, 30000);
        return () => clearInterval(interval);
    }, []);
    const getScoreColor = (score) => {
        switch (score) {
            case 'good': return 'text-emerald-400';
            case 'warning': return 'text-amber-400';
            case 'poor': return 'text-red-400';
            default: return 'text-[#969696]';
        }
    };
    const getScoreBadgeColor = (score) => {
        switch (score) {
            case 'good': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'warning': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            case 'poor': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-[#3e3e42]/20 text-[#969696] border-[#3e3e42]/30';
        }
    };
    const formatValue = (metric, value) => {
        if (metric === 'CLS') {
            return value.toFixed(3);
        }
        return `${Math.round(value)}ms`;
    };
    const formatTimestamp = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString();
    };
    if (!summary) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-[400px]", children: _jsx("div", { className: "text-[#969696]", children: "Loading performance data..." }) }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: "Performance Dashboard" }), _jsx("p", { className: "text-[#969696] mt-1", children: "Real-time Web Vitals monitoring and budget compliance" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "text-sm text-[#969696]", children: ["Last updated: ", lastUpdated.toLocaleTimeString()] }), _jsx(Button, { onClick: refreshData, disabled: isLoading, className: "bg-[#007acc] hover:bg-[#005a99]", children: isLoading ? 'Refreshing...' : 'Refresh' })] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Total Metrics" }), _jsx("div", { className: "text-2xl font-bold text-[#cccccc]", children: summary.totalMetrics }), _jsxs("div", { className: "text-xs text-[#969696] mt-1", children: ["Session: ", summary.sessionId.slice(-8)] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Budget Compliance" }), _jsxs("div", { className: `text-2xl font-bold ${summary.budgetCompliance >= 90 ? 'text-emerald-400' : summary.budgetCompliance >= 70 ? 'text-amber-400' : 'text-red-400'}`, children: [summary.budgetCompliance.toFixed(1), "%"] }), _jsxs("div", { className: "text-xs text-[#969696] mt-1", children: [summary.budgetViolations, " violations"] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Good Performance" }), _jsx("div", { className: "text-2xl font-bold text-emerald-400", children: summary.byScore.good }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Within thresholds" })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "Needs Attention" }), _jsx("div", { className: "text-2xl font-bold text-red-400", children: summary.byScore.warning + summary.byScore.poor }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Performance issues" })] })] }), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h2", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Core Web Vitals" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4", children: Object.entries(PERFORMANCE_BUDGETS).map(([metricName, budget]) => {
                            const latestMetric = summary.byMetric[metricName];
                            return (_jsxs("div", { className: "text-center p-4 bg-[#3e3e42]/50 rounded-lg", children: [_jsx("div", { className: "text-sm font-medium text-[#cccccc] mb-2", children: metricName }), latestMetric ? (_jsxs(_Fragment, { children: [_jsx("div", { className: `text-xl font-bold ${getScoreColor(latestMetric.score)}`, children: formatValue(metricName, latestMetric.value) }), _jsx("div", { className: `text-xs px-2 py-1 rounded border mt-2 inline-block ${getScoreBadgeColor(latestMetric.score)}`, children: latestMetric.score }), _jsxs("div", { className: "text-xs text-[#969696] mt-1", children: ["Budget: ", formatValue(metricName, budget.budget)] }), latestMetric.exceedsBudget && (_jsxs("div", { className: "text-xs text-red-400 mt-1", children: ["+", formatValue(metricName, latestMetric.value - budget.budget), " over"] }))] })) : (_jsx("div", { className: "text-[#969696] text-sm", children: "No data" }))] }, metricName));
                        }) })] }), violations.length > 0 && (_jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsxs("h2", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: ["\uD83D\uDEA8 Budget Violations (", violations.length, ")"] }), _jsxs("div", { className: "space-y-3", children: [violations.slice(0, 10).map((violation, index) => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium text-red-400", children: violation.metric }), _jsx("div", { className: "text-sm text-[#969696]", children: formatTimestamp(violation.timestamp) })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-red-400 font-medium", children: formatValue(violation.metric, violation.value) }), _jsxs("div", { className: "text-xs text-[#969696]", children: ["Budget: ", formatValue(violation.metric, violation.budget)] }), _jsxs("div", { className: "text-xs text-red-300", children: ["+", formatValue(violation.metric, violation.excess), " over"] })] })] }, index))), violations.length > 10 && (_jsxs("div", { className: "text-center text-[#969696] text-sm pt-3", children: ["... and ", violations.length - 10, " more violations"] }))] })] })), _jsxs(Card, { className: "bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h2", { className: "text-lg font-semibold text-[#cccccc] mb-4", children: "Recent Metrics" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-[#3e3e42]", children: [_jsx("th", { className: "text-left py-2 text-[#cccccc]", children: "Metric" }), _jsx("th", { className: "text-left py-2 text-[#cccccc]", children: "Value" }), _jsx("th", { className: "text-left py-2 text-[#cccccc]", children: "Score" }), _jsx("th", { className: "text-left py-2 text-[#cccccc]", children: "Budget Status" }), _jsx("th", { className: "text-left py-2 text-[#cccccc]", children: "Time" })] }) }), _jsx("tbody", { children: metrics.slice(-20).reverse().map((metric, index) => (_jsxs("tr", { className: "border-b border-[#3e3e42]/50", children: [_jsx("td", { className: "py-2 text-[#cccccc] font-medium", children: metric.metric }), _jsx("td", { className: `py-2 ${getScoreColor(metric.score)}`, children: formatValue(metric.metric, metric.value) }), _jsx("td", { className: "py-2", children: _jsx("span", { className: `px-2 py-1 rounded text-xs ${getScoreBadgeColor(metric.score)}`, children: metric.score }) }), _jsx("td", { className: "py-2", children: metric.exceedsBudget ? (_jsx("span", { className: "text-red-400 text-xs", children: "Over budget" })) : (_jsx("span", { className: "text-emerald-400 text-xs", children: "Within budget" })) }), _jsx("td", { className: "py-2 text-[#969696] text-xs", children: formatTimestamp(metric.timestamp) })] }, index))) })] }) })] })] }));
};
export default PerformanceDashboard;
