import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WorkPlanningSearchBar from '@/features/work-planning/search/WorkPlanningSearchBar';

describe('WorkPlanningSearchBar', () => {
  it('renders tokens and removes token on close click', async () => {
    const user = userEvent.setup();
    const onRemoveToken = vi.fn();

    render(
      <WorkPlanningSearchBar
        id="search"
        label="Search"
        tokens={[{ id: '1', term: 'Alpha', op: 'or' }]}
        activeTokenId={null}
        searchOp="or"
        searchInput=""
        onInputChange={() => {}}
        onInputKeyDown={() => {}}
        onTokenSelect={() => {}}
        onTokenRemove={onRemoveToken}
        onSearchOpChange={() => {}}
      />
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(onRemoveToken).toHaveBeenCalledWith('1');
  });

  it('renders optional tooltip and hint content', () => {
    render(
      <div className="relative group">
        <WorkPlanningSearchBar
          id="search-2"
          label="Search"
          tokens={[]}
          activeTokenId={null}
          searchOp="or"
          searchInput=""
          onInputChange={() => {}}
          onInputKeyDown={() => {}}
          onTokenSelect={() => {}}
          onTokenRemove={() => {}}
          onSearchOpChange={() => {}}
          tooltip={<p>Press Enter to add</p>}
          hint="Workload hint"
        />
      </div>
    );

    expect(screen.getByText('Press Enter to add')).toBeInTheDocument();
    expect(screen.getByText('Workload hint')).toBeInTheDocument();
  });
});
