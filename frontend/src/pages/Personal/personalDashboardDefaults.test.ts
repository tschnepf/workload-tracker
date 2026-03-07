import { describe, expect, it } from 'vitest';
import { MY_WORK_DEFAULT_LAYOUT } from './personalDashboardDefaults';

describe('my work dashboard defaults', () => {
  it('keeps lead assignments and calendar large across breakpoints', () => {
    const cols10 = MY_WORK_DEFAULT_LAYOUT.widgetsByCols['10'] || [];
    const cols8 = MY_WORK_DEFAULT_LAYOUT.widgetsByCols['8'] || [];
    const cols6 = MY_WORK_DEFAULT_LAYOUT.widgetsByCols['6'] || [];
    const cols4 = MY_WORK_DEFAULT_LAYOUT.widgetsByCols['4'] || [];

    const find = (items: typeof cols10, cardId: string) => items.find((w) => w.cardId === cardId);

    expect(find(cols10, 'my-summary')).toMatchObject({ w: 2, h: 2 });
    expect(find(cols10, 'lead-project-assignments')).toMatchObject({ w: 6, h: 4 });
    expect(find(cols10, 'my-calendar')).toMatchObject({ w: 4, h: 4 });

    expect(find(cols8, 'lead-project-assignments')).toMatchObject({ w: 5, h: 4 });
    expect(find(cols8, 'my-calendar')).toMatchObject({ w: 3, h: 4 });

    expect(find(cols6, 'lead-project-assignments')).toMatchObject({ w: 6, h: 4 });
    expect(find(cols6, 'my-calendar')).toMatchObject({ w: 6, h: 4 });

    expect(find(cols4, 'lead-project-assignments')).toMatchObject({ w: 4, h: 4 });
    expect(find(cols4, 'my-calendar')).toMatchObject({ w: 4, h: 4 });
  });
});
