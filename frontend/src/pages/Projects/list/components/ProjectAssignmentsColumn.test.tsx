import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectAssignmentsColumn from './ProjectAssignmentsColumn';

vi.mock('./AssignmentRow', () => ({
  default: () => <div data-testid="assignment-row-stub">AssignmentRow</div>,
}));

vi.mock('./AddAssignmentCard', () => ({
  default: ({ className }: { className?: string }) => (
    <div data-testid="add-assignment-card" className={className || ''}>AddAssignmentCard</div>
  ),
}));

const baseProps: any = {
  isNarrowLayout: true,
  showAddAssignment: true,
  onAddAssignment: vi.fn(),
  onSaveAssignment: vi.fn(),
  onCancelAddAssignment: vi.fn(),
  addAssignmentState: {
    personSearch: '',
    selectedPerson: null,
    roleOnProjectId: null,
    roleOnProject: '',
    roleSearch: '',
    weeklyHours: {},
  },
  onPersonSearch: vi.fn(),
  onPersonSearchFocus: vi.fn(),
  onPersonSearchKeyDown: vi.fn(),
  srAnnouncement: '',
  personSearchResults: [],
  selectedPersonIndex: -1,
  onPersonSelect: vi.fn(),
  onRoleSelectNew: vi.fn(),
  onRolePlaceholderSelect: vi.fn(),
  addRoles: [],
  roleMatches: [],
  isPersonSearchOpen: false,
  personSearchDropdownAbove: false,
  personSearchInputRef: { current: null },
  departmentEntries: [['Electrical', [{ id: 1, person: 2, weeklyHours: {} }]]],
  editingAssignmentId: null,
  editData: { roleOnProject: '', currentWeekHours: 0, roleSearch: '' },
  onEditAssignment: vi.fn(),
  onDeleteAssignment: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onHoursChange: vi.fn(),
  getCurrentWeekHours: vi.fn().mockReturnValue(0),
  onChangeAssignmentRole: vi.fn(),
  getPersonDepartmentId: vi.fn().mockReturnValue(null),
  currentWeekKey: '2026-03-02',
  onUpdateWeekHours: vi.fn(),
  weekKeys: ['2026-03-02'],
  isCellSelected: vi.fn().mockReturnValue(false),
  isEditingCell: vi.fn().mockReturnValue(false),
  onCellSelect: vi.fn(),
  onCellMouseDown: vi.fn(),
  onCellMouseEnter: vi.fn(),
  onEditStartCell: vi.fn(),
  onEditSaveCell: vi.fn(),
  onEditCancelCell: vi.fn(),
  editingValue: '',
  onEditValueChangeCell: vi.fn(),
  optimisticHours: new Map(),
  onSwapPlaceholder: vi.fn(),
};

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ProjectAssignmentsColumn', () => {
  it('renders narrow ordering as add button -> add card -> assignment cards', () => {
    renderWithQueryClient(<ProjectAssignmentsColumn {...baseProps} isNarrowLayout />);

    const addButtonRow = screen.getByTestId('assignments-add-button-narrow');
    const addCard = screen.getByTestId('add-assignment-card');
    const assignmentCard = screen.getByTestId('assignment-department-card');

    expect(addButtonRow.compareDocumentPosition(addCard)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(addCard.compareDocumentPosition(assignmentCard)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders wide add button row and hides narrow button row', () => {
    renderWithQueryClient(<ProjectAssignmentsColumn {...baseProps} isNarrowLayout={false} />);
    expect(screen.getByTestId('assignments-add-button-wide')).toBeInTheDocument();
    expect(screen.queryByTestId('assignments-add-button-narrow')).not.toBeInTheDocument();
  });

  it('renders empty state when there are no assignments and add form is closed', () => {
    renderWithQueryClient(
      <ProjectAssignmentsColumn
        {...baseProps}
        showAddAssignment={false}
        departmentEntries={[]}
      />
    );
    expect(screen.getByTestId('assignments-empty-state')).toBeInTheDocument();
  });
});
