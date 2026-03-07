import { createDefaultSurfaceLayout } from '@/components/dashboard/layout/dashboardLayoutState';

export const TEAM_DEFAULT_LAYOUT = createDefaultSurfaceLayout({
  widgets: [
    { cardId: 'upcoming-deliverables', x: 0, y: 0, w: 2, h: 2 },
    { cardId: 'utilization-distribution', x: 2, y: 0, w: 3, h: 2 },
    { cardId: 'avg-utilization', x: 5, y: 0, w: 1, h: 1 },
    { cardId: 'active-projects', x: 6, y: 0, w: 1, h: 1 },
    { cardId: 'recent-assignments', x: 8, y: 0, w: 2, h: 2 },
    { cardId: 'assigned-hours-client', x: 5, y: 1, w: 3, h: 4 },
    { cardId: 'overallocated-team-members', x: 0, y: 2, w: 2, h: 3 },
    { cardId: 'availability-alerting', x: 2, y: 2, w: 3, h: 3 },
    { cardId: 'role-capacity-summary', x: 8, y: 2, w: 2, h: 3 },
  ],
});

