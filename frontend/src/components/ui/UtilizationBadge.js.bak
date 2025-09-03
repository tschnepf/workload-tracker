import { jsxs as _jsxs } from "react/jsx-runtime";
const UtilizationBadge = ({ percentage, className = '' }) => {
    // Dark mode utilization color scheme - matches design system
    const getUtilizationStyle = (percent) => {
        if (percent < 70) {
            return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'; // Available
        }
        if (percent <= 85) {
            return 'bg-blue-500/20 text-blue-400 border-blue-500/30'; // Optimal
        }
        if (percent <= 100) {
            return 'bg-amber-500/20 text-amber-400 border-amber-500/30'; // High
        }
        return 'bg-red-500/20 text-red-400 border-red-500/30'; // Overallocated
    };
    const getUtilizationLabel = (percent) => {
        if (percent < 70)
            return 'Available';
        if (percent <= 85)
            return 'Optimal';
        if (percent <= 100)
            return 'High';
        return 'Overallocated';
    };
    const baseStyles = 'px-2 py-1 rounded border text-xs font-medium transition-colors';
    const utilizationStyle = getUtilizationStyle(percentage);
    const label = getUtilizationLabel(percentage);
    return (_jsxs("span", { className: `${baseStyles} ${utilizationStyle} ${className}`, children: [percentage, "% ", label] }));
};
export default UtilizationBadge;
