import React from 'react';
import { render } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { describe, it, beforeAll, beforeEach, vi, expect } from 'vitest';
import PersonalDashboard from '@/pages/Personal/PersonalDashboard';
import { TeamCapacityCalendarCard } from '@/pages/Dashboard';
import { DeliverablesCalendarContent } from '@/pages/Deliverables/Calendar';
import type { FullCalendarWrapperProps } from '@/features/fullcalendar/FullCalendarWrapper';

const recordedCalendarProps: FullCalendarWrapperProps[] = [];

vi.mock('@/features/fullcalendar', async () => {
  const actual = await vi.importActual<typeof import('@/features/fullcalendar')>('@/features/fullcalendar');
  const MockCalendar: React.FC<FullCalendarWrapperProps> = (props) => {
    recordedCalendarProps.push(props);
    return (
      <div
        data-testid={`mock-fullcalendar-${recordedCalendarProps.length}`}
        data-initial-view={props.initialView ?? props.responsiveViews?.desktop ?? ''}
      >
        mocked calendar
      </div>
    );
  };
  return {
    ...actual,
    FullCalendarWrapper: MockCalendar,
  };
});

const authReturn = { person: { id: 99 }, accessToken: 'token-123' };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authReturn }));

const defaultPersonalPayload = {
  summary: {
    personId: 99,
    currentWeekKey: '2025-W47',
    utilizationPercent: 78,
    allocatedHours: 32,
    availableHours: 8,
  },
  alerts: {
    overallocatedNextWeek: false,
    underutilizedNext4Weeks: false,
    overduePreItems: 0,
  },
  projects: [
    { id: 1, name: 'Atlas Tower', client_name: 'Stack', active_assignments: 2, status: 'active' },
  ],
  deliverables: [
    { id: 10, project_name: 'Atlas Tower', description: 'IFC Issue', due_date: '2025-12-01' },
  ],
  schedule: {
    weekKeys: ['2025-11-24', '2025-12-01'],
    weeklyCapacity: 40,
    weekTotals: { '2025-11-24': 34, '2025-12-01': 20 },
  },
};

const personalWorkReturn = {
  data: defaultPersonalPayload,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock('@/hooks/usePersonalWork', () => ({ usePersonalWork: () => personalWorkReturn }));

const sampleDeliverables = [
  {
    id: 501,
    itemType: 'deliverable' as const,
    title: 'Specification TOC',
    date: '2025-12-01',
    projectName: 'Stack',
    projectClient: 'Stack',
    isCompleted: false,
  },
  {
    id: 777,
    itemType: 'pre_deliverable' as const,
    title: 'Model Delivery',
    date: '2025-12-03',
    parentDeliverableId: 501,
    projectName: 'Stack',
    projectClient: 'Stack',
    isCompleted: false,
  },
];

const deliverablesHookReturn = {
  data: sampleDeliverables,
  isLoading: false,
  error: null as string | null,
  refetch: vi.fn(),
};

vi.mock('@/hooks/useDeliverablesCalendar', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDeliverablesCalendar')>('@/hooks/useDeliverablesCalendar');
  return {
    ...actual,
    useDeliverablesCalendar: () => deliverablesHookReturn,
  };
});

vi.mock('@/components/projects/quickview', () => {
  const quickView = { open: vi.fn() };
  return {
    useProjectQuickViewPopover: () => quickView,
    ProjectQuickViewPopoverProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/lib/gridRefreshBus', () => ({
  subscribeGridRefresh: () => () => {},
  emitGridRefresh: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  assignmentsApi: { byPerson: vi.fn(async () => []) },
  deliverableAssignmentsApi: { byPerson: vi.fn(async () => []) },
  peopleApi: { autocomplete: vi.fn(async () => []) },
}));

vi.mock('@/components/dashboard/UpcomingPreDeliverablesWidget', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-pre-items" />,
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: /max-width: 768px/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });
});

beforeEach(() => {
  recordedCalendarProps.length = 0;
  personalWorkReturn.refresh = vi.fn();
  personalWorkReturn.data = defaultPersonalPayload;
  personalWorkReturn.loading = false;
  personalWorkReturn.error = null;
  deliverablesHookReturn.data = sampleDeliverables;
  deliverablesHookReturn.isLoading = false;
  deliverablesHookReturn.error = null;
  deliverablesHookReturn.refetch = vi.fn();
});

describe('FullCalendar integration points', () => {
  it('wires My Work calendars for both desktop and mobile stacks', () => {
    renderWithProviders(<PersonalDashboard />, {
      route: '/personal',
      routes: [{ path: '/personal', element: <PersonalDashboard /> }],
    });
    expect(recordedCalendarProps.length).toBeGreaterThanOrEqual(2);
    recordedCalendarProps.forEach((props) => {
      expect(props.initialView).toBe('personalMultiWeek');
      expect(props.responsiveViews?.mobile).toBe('listWeek');
      expect(props.events?.length).toBe(sampleDeliverables.length);
    });
  });

  it('merges capacity and deliverable events on the team dashboard card', () => {
    const rows = [
      {
        id: 1,
        name: 'Jamie Electric',
        department: 'Electrical',
        weeklyCapacity: 40,
        weekKeys: ['2025-11-24', '2025-12-01'],
        weekTotals: { '2025-11-24': 36, '2025-12-01': 28 },
      },
    ];
    render(
      <TeamCapacityCalendarCard
        rows={rows as any}
        loading={false}
        deliverables={sampleDeliverables as any}
        deliverablesLoading={false}
        onRangeChange={vi.fn()}
      />
    );
    expect(recordedCalendarProps).toHaveLength(1);
    const props = recordedCalendarProps[0];
    expect(props.initialView).toBe('dayGridMonth');
    expect(props.responsiveViews?.mobile).toBe('listWeek');
    const kinds = props.events?.map((evt) => (evt?.extendedProps as any)?.kind);
    expect(kinds).toContain('capacity-week');
    expect(kinds).toContain('deliverable');
  });

  it('renders the deliverables calendar with the multi-week responsive view', () => {
    render(<DeliverablesCalendarContent />);
    expect(recordedCalendarProps).toHaveLength(1);
    const props = recordedCalendarProps[0];
    expect(props.initialView).toBe('deliverablesMultiWeek');
    expect(props.responsiveViews?.mobile).toBe('listWeek');
    expect(props.events?.length).toBe(sampleDeliverables.length);
  });
});
