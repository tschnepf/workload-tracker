import { describe, expect, it } from 'vitest';
import { TEAM_DEFAULT_LAYOUT } from './dashboardDefaults';

describe('team dashboard default layout', () => {
  it('matches the approved widget arrangement', () => {
    const widgetsByCard = new Map(TEAM_DEFAULT_LAYOUT.widgets.map((widget) => [widget.cardId, widget]));

    expect(widgetsByCard.get('upcoming-deliverables')).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    expect(widgetsByCard.get('utilization-distribution')).toMatchObject({ x: 2, y: 0, w: 3, h: 2 });
    expect(widgetsByCard.get('avg-utilization')).toMatchObject({ x: 5, y: 0, w: 1, h: 1 });
    expect(widgetsByCard.get('active-projects')).toMatchObject({ x: 6, y: 0, w: 1, h: 1 });
    expect(widgetsByCard.get('recent-assignments')).toMatchObject({ x: 8, y: 0, w: 2, h: 2 });
    expect(widgetsByCard.get('assigned-hours-client')).toMatchObject({ x: 5, y: 1, w: 3, h: 4 });
    expect(widgetsByCard.get('overallocated-team-members')).toMatchObject({ x: 0, y: 2, w: 2, h: 3 });
    expect(widgetsByCard.get('availability-alerting')).toMatchObject({ x: 2, y: 2, w: 3, h: 3 });
    expect(widgetsByCard.get('role-capacity-summary')).toMatchObject({ x: 8, y: 2, w: 2, h: 3 });
  });
});

