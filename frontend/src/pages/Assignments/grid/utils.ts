// Shared, lean utilities for grid week headers (server week keys only)

export type WeekHeader = { date: string; display: string; fullDisplay: string };

export function toWeekHeader(weekKeys: string[]): WeekHeader[] {
  if (!Array.isArray(weekKeys)) return [];
  return weekKeys.map((mondayStr) => {
    // Use locale-safe formatting but avoid TZ shifts by anchoring to midnight
    const monday = new Date(mondayStr + 'T00:00:00');
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const display = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fullDisplay = `${display} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return { date: mondayStr, display, fullDisplay };
  });
}

