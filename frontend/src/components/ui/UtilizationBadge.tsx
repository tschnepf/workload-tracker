/**
 * UtilizationBadge component — percent-based badge routed through unified classes
 * Backwards-compatible: keeps percent thresholds (<=70, <=85, <=100, >100)
 * and maps to theme-aligned classes via utilization util.
 */

import React from 'react';
import { utilizationLevelToClasses } from '@/util/utilization';

interface UtilizationBadgeProps {
  percentage: number;
  className?: string;
}

const UtilizationBadge: React.FC<UtilizationBadgeProps> = ({ percentage, className = '' }) => {
  // Percent classification consistent with fallback policy (70/85/100)
  const level = (percentage <= 70)
    ? 'blue'
    : (percentage <= 85)
      ? 'green'
      : (percentage <= 100)
        ? 'orange'
        : 'red';
  const classes = utilizationLevelToClasses(level as any);

  const label = percentage < 70
    ? 'Available'
    : percentage <= 85
      ? 'Optimal'
      : percentage <= 100
        ? 'High'
        : 'Overallocated';

  return (
    <span className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${classes} ${className}`}>
      {percentage}% {label}
    </span>
  );
};

export default UtilizationBadge;
