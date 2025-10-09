import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RoleDropdown from '../RoleDropdown';

describe('RoleDropdown', () => {
  const roles = [
    { id: 1, name: 'Engineer', is_active: true, sort_order: 0, department_id: 10 },
    { id: 2, name: 'Manager', is_active: true, sort_order: 0, department_id: 10 },
    { id: 3, name: 'Designer', is_active: true, sort_order: 0, department_id: 10 },
  ];

  it('renders options with ARIA semantics and highlights current', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<RoleDropdown roles={roles as any} currentId={2} onSelect={onSelect} onClose={onClose} />);

    const list = screen.getByRole('listbox');
    expect(list).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    // Includes the Clear role pseudo-option
    expect(options.length).toBe(roles.length + 1);

    const manager = options.find((el) => el.textContent === 'Manager')!;
    expect(manager).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect for Clear role and a specific role', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<RoleDropdown roles={roles as any} currentId={null} onSelect={onSelect} onClose={onClose} />);

    // Clear role
    fireEvent.click(screen.getByText('Clear role'));
    expect(onSelect).toHaveBeenCalledWith(null, null);

    onSelect.mockClear();
    // Pick a role
    fireEvent.click(screen.getByText('Engineer'));
    expect(onSelect).toHaveBeenCalledWith(1, 'Engineer');
  });

  it('closes when clicking outside', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <div>
        <div data-testid="outside">outside</div>
        <RoleDropdown roles={roles as any} currentId={null} onSelect={onSelect} onClose={onClose} />
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });

  it('has proper ARIA labeling and supports keyboard navigation', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<RoleDropdown roles={roles as any} currentId={null} onSelect={onSelect} onClose={onClose} ariaLabel="Role options" />);

    const list = screen.getByRole('listbox');
    expect(list).toHaveAttribute('aria-label', 'Role options');

    // Initial active is Clear role (index 0)
    let activeId = list.getAttribute('aria-activedescendant');
    expect(activeId).toBe('role-option-0');

    // Arrow down moves to first actual role
    list.focus();
    // Simulate ArrowDown
    fireEvent.keyDown(list, { key: 'ArrowDown', code: 'ArrowDown' });
    activeId = list.getAttribute('aria-activedescendant');
    expect(activeId).toBe('role-option-1');

    // Enter selects that role
    fireEvent.keyDown(list, { key: 'Enter', code: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(1, 'Engineer');
  });
});
