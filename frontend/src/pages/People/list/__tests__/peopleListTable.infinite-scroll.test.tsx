import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import PeopleListTable from '@/pages/People/list/components/PeopleListTable';

function makePeople(count: number) {
  return Array.from({ length: count }).map((_, index) => ({
    id: index + 1,
    name: `Person ${index + 1}`,
    roleName: 'Engineer',
    departmentName: 'Electrical',
    location: 'Remote',
    weeklyCapacity: 36,
    isActive: true,
  })) as any[];
}

describe('PeopleListTable infinite scroll', () => {
  it('loads next page when scrolled near the bottom', () => {
    const onLoadMore = vi.fn();
    const { getByTestId } = render(
      <PeopleListTable
        items={makePeople(4)}
        bulkMode={false}
        selectedPersonId={null}
        selectedPeopleIds={new Set()}
        onRowClick={vi.fn()}
        onToggleSelect={vi.fn()}
        hasMore
        isLoadingMore={false}
        onLoadMore={onLoadMore}
      />
    );

    const scrollEl = getByTestId('people-list-scroll');
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 550 });

    fireEvent.scroll(scrollEl);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not load next page while a page is already loading', () => {
    const onLoadMore = vi.fn();
    const { getByTestId } = render(
      <PeopleListTable
        items={makePeople(4)}
        bulkMode={false}
        selectedPersonId={null}
        selectedPeopleIds={new Set()}
        onRowClick={vi.fn()}
        onToggleSelect={vi.fn()}
        hasMore
        isLoadingMore
        onLoadMore={onLoadMore}
      />
    );

    const scrollEl = getByTestId('people-list-scroll');
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 580 });

    fireEvent.scroll(scrollEl);

    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
