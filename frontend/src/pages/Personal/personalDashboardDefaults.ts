import { createDefaultSurfaceLayout } from '@/components/dashboard/layout/dashboardLayoutState';
import type { DashboardSurfaceLayout, DashboardWidgetLayoutItem } from '@/components/dashboard/layout/dashboardLayoutTypes';

function widget(cardId: string, x: number, y: number, w: number, h: number): DashboardWidgetLayoutItem {
  return { i: cardId, cardId, x, y, w, h };
}

const base = createDefaultSurfaceLayout({
  widgets: [
    { cardId: 'my-summary', x: 0, y: 0, w: 2, h: 2 },
    { cardId: 'my-projects', x: 2, y: 0, w: 2, h: 2 },
    { cardId: 'my-deliverables', x: 4, y: 0, w: 2, h: 2 },
    { cardId: 'upcoming-pre-deliverables', x: 6, y: 0, w: 2, h: 2 },
    { cardId: 'my-schedule', x: 8, y: 0, w: 2, h: 2 },
    { cardId: 'lead-project-assignments', x: 0, y: 2, w: 6, h: 4 },
    { cardId: 'my-calendar', x: 6, y: 2, w: 4, h: 4 },
  ],
});

export const MY_WORK_DEFAULT_LAYOUT: DashboardSurfaceLayout = {
  ...base,
  widgetsByCols: {
    '10': [
      widget('my-summary', 0, 0, 2, 2),
      widget('my-projects', 2, 0, 2, 2),
      widget('my-deliverables', 4, 0, 2, 2),
      widget('upcoming-pre-deliverables', 6, 0, 2, 2),
      widget('my-schedule', 8, 0, 2, 2),
      widget('lead-project-assignments', 0, 2, 6, 4),
      widget('my-calendar', 6, 2, 4, 4),
    ],
    '8': [
      widget('my-summary', 0, 0, 2, 2),
      widget('my-projects', 2, 0, 2, 2),
      widget('my-deliverables', 4, 0, 2, 2),
      widget('upcoming-pre-deliverables', 6, 0, 2, 2),
      widget('my-schedule', 0, 2, 3, 2),
      widget('lead-project-assignments', 3, 2, 5, 4),
      widget('my-calendar', 0, 4, 3, 4),
    ],
    '6': [
      widget('my-summary', 0, 0, 2, 2),
      widget('my-projects', 2, 0, 2, 2),
      widget('my-deliverables', 4, 0, 2, 2),
      widget('upcoming-pre-deliverables', 0, 2, 2, 2),
      widget('my-schedule', 2, 2, 4, 2),
      widget('lead-project-assignments', 0, 4, 6, 4),
      widget('my-calendar', 0, 8, 6, 4),
    ],
    '4': [
      widget('my-summary', 0, 0, 2, 2),
      widget('my-projects', 2, 0, 2, 2),
      widget('my-deliverables', 0, 2, 2, 2),
      widget('upcoming-pre-deliverables', 2, 2, 2, 2),
      widget('my-schedule', 0, 4, 4, 2),
      widget('lead-project-assignments', 0, 6, 4, 4),
      widget('my-calendar', 0, 10, 4, 4),
    ],
    '2': [
      widget('my-summary', 0, 0, 2, 2),
      widget('my-projects', 0, 2, 2, 2),
      widget('my-deliverables', 0, 4, 2, 2),
      widget('upcoming-pre-deliverables', 0, 6, 2, 2),
      widget('my-schedule', 0, 8, 2, 2),
      widget('lead-project-assignments', 0, 10, 2, 4),
      widget('my-calendar', 0, 14, 2, 4),
    ],
  },
};
