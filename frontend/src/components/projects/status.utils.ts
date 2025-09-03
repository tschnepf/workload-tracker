/**
 * Status utilities and theme constants for project status management
 * Single source of truth for status formatting, colors, and options
 * Uses VSCode Dark Theme colors as specified in CLAUDE.md
 */

import type { Project } from '@/types/models';

export type ProjectStatus = Project['status'];

// VSCode Dark Theme colors - ONLY source of truth for status colors
export const STATUS_COLORS = {
  active: 'text-emerald-400',
  active_ca: 'text-blue-400', 
  planning: 'text-blue-400',
  on_hold: 'text-amber-400',
  completed: 'text-[#cccccc]', // VSCode secondary text
  cancelled: 'text-red-400',
  default: 'text-[#969696]', // VSCode muted text
} as const;

// Editable status options (subset of all possible statuses)
export const editableStatusOptions = [
  'active',
  'active_ca', 
  'on_hold',
  'completed',
  'cancelled'
] as const;

// All possible status options for display
export const allStatusOptions = [
  'active',
  'active_ca',
  'planning',
  'on_hold', 
  'completed',
  'cancelled'
] as const;

/**
 * Get status color class for a given status
 * Uses VSCode Dark Theme colors for consistency
 */
export const getStatusColor = (status?: string | null): string => {
  if (!status) return STATUS_COLORS.default;
  
  const normalizedStatus = status.toLowerCase();
  return STATUS_COLORS[normalizedStatus as keyof typeof STATUS_COLORS] || STATUS_COLORS.default;
};

/**
 * Format status for display
 * Handles special cases like 'active_ca' -> 'Active CA'
 */
export const formatStatus = (status?: string | null): string => {
  if (!status) return 'Unknown';
  
  // Special case for active_ca
  if (status.toLowerCase() === 'active_ca') return 'Active CA';
  
  // Standard formatting: snake_case -> Title Case
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Check if a status is editable via dropdown
 */
export const isStatusEditable = (status?: string | null): boolean => {
  if (!status) return false;
  return editableStatusOptions.includes(status as any);
};

/**
 * Get background color class for status badges
 * Uses VSCode theme background colors with opacity
 */
export const getStatusBgColor = (status?: string | null): string => {
  if (!status) return 'bg-[#3e3e42]/50';
  
  const normalizedStatus = status.toLowerCase();
  switch (normalizedStatus) {
    case 'active':
      return 'bg-emerald-500/20';
    case 'active_ca':
      return 'bg-blue-500/20';
    case 'planning':
      return 'bg-blue-500/20';
    case 'on_hold':
      return 'bg-amber-500/20';
    case 'completed':
      return 'bg-[#3e3e42]/50';
    case 'cancelled':
      return 'bg-red-500/20';
    default:
      return 'bg-[#3e3e42]/50';
  }
};

/**
 * Get border color class for status badges
 */
export const getStatusBorderColor = (status?: string | null): string => {
  if (!status) return 'border-[#3e3e42]';
  
  const normalizedStatus = status.toLowerCase();
  switch (normalizedStatus) {
    case 'active':
      return 'border-emerald-500/30';
    case 'active_ca':
      return 'border-blue-500/30';
    case 'planning':
      return 'border-blue-500/30';
    case 'on_hold':
      return 'border-amber-500/30';
    case 'completed':
      return 'border-[#3e3e42]';
    case 'cancelled':
      return 'border-red-500/30';
    default:
      return 'border-[#3e3e42]';
  }
};