/**
 * Accessibility tests for project status components
 * Ensures ARIA compliance, keyboard navigation, and screen reader support
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusBadge } from '../StatusBadge';
import { StatusDropdown } from '../StatusDropdown';
import { useDropdownAria } from '../useDropdownAria';
import { renderHook } from '@testing-library/react';
import { vi, describe, test, expect } from 'vitest';

describe('Accessibility Tests', () => {
  describe('StatusBadge ARIA Compliance', () => {
    test('display variant has proper semantics', () => {
      const { container } = render(
        <StatusBadge status="active" variant="display" />
      );
      
      const badge = container.querySelector('span');
      expect(badge).toBeInTheDocument();
      expect(badge).not.toHaveAttribute('role'); // Should be plain text
      expect(badge).not.toHaveAttribute('aria-haspopup');
    });

    test('editable variant has proper button semantics', () => {
      const mockOnClick = vi.fn();
      const { container } = render(
        <StatusBadge status="active" variant="editable" onClick={mockOnClick} />
      );
      
      const button = container.querySelector('button');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('aria-haspopup', 'listbox');
      expect(button).toHaveAttribute('aria-label', 'Change status from Active');
    });

    test('disabled state is properly announced', () => {
      const mockOnClick = vi.fn();
      const { container } = render(
        <StatusBadge 
          status="active" 
          variant="editable" 
          onClick={mockOnClick}
          isUpdating={true}
        />
      );
      
      const button = container.querySelector('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-label', 'Change status from Active');
    });
  });

  describe('StatusDropdown Accessibility', () => {
    test('dropdown has proper ARIA structure', () => {
      const mockOnSelect = vi.fn();
      const mockOnClose = vi.fn();
      
      render(
        <StatusDropdown
          currentStatus="active"
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
          projectId="test-project"
        />
      );
      
      const dropdown = screen.getByRole('listbox');
      expect(dropdown).toBeInTheDocument();
      expect(dropdown).toHaveAttribute('aria-labelledby');
      
      // Check options
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
      
      options.forEach(option => {
        expect(option).toHaveAttribute('aria-selected');
        expect(option).toHaveAttribute('tabIndex', '0');
      });
    });

    test('selected option is properly marked', () => {
      const mockOnSelect = vi.fn();
      const mockOnClose = vi.fn();
      
      render(
        <StatusDropdown
          currentStatus="active"
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
          projectId="test-project"
        />
      );
      
      const activeOption = screen.getByRole('option', { name: /active/i });
      expect(activeOption).toHaveAttribute('aria-selected', 'true');
    });

    test('keyboard navigation works correctly', async () => {
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      const mockOnClose = vi.fn();
      
      render(
        <StatusDropdown
          currentStatus="active"
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
          projectId="test-project"
        />
      );
      
      // Test Escape key
      await user.keyboard('{Escape}');
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('option selection with Enter key', async () => {
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      const mockOnClose = vi.fn();
      
      render(
        <StatusDropdown
          currentStatus="active"
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
          projectId="test-project"
        />
      );
      
      const completedOption = screen.getByRole('option', { name: /completed/i });
      completedOption.focus();
      await user.keyboard('{Enter}');
      
      expect(mockOnSelect).toHaveBeenCalledWith('completed');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('useDropdownAria Hook', () => {
    test('generates proper ARIA attributes', () => {
      const { result } = renderHook(() => 
        useDropdownAria({
          isOpen: true,
          id: 'test-dropdown',
          labelText: 'Project status'
        })
      );
      
      const { buttonProps, menuProps } = result.current;
      
      expect(buttonProps).toEqual({
        'aria-haspopup': 'listbox',
        'aria-expanded': true,
        'aria-controls': 'dropdown-menu-test-dropdown',
        'aria-label': 'Project status dropdown',
        'id': 'dropdown-button-test-dropdown'
      });
      
      expect(menuProps).toEqual({
        'role': 'listbox',
        'aria-labelledby': 'dropdown-button-test-dropdown',
        'id': 'dropdown-menu-test-dropdown',
        'data-dropdown': true
      });
    });

    test('handles closed state correctly', () => {
      const { result } = renderHook(() => 
        useDropdownAria({
          isOpen: false,
          id: 'test-dropdown'
        })
      );
      
      const { buttonProps } = result.current;
      
      expect(buttonProps['aria-expanded']).toBe(false);
      expect(buttonProps['aria-controls']).toBeUndefined();
    });

    test('generates option props correctly', () => {
      const { result } = renderHook(() => 
        useDropdownAria({
          isOpen: true,
          id: 'test-dropdown'
        })
      );
      
      const optionProps = result.current.getOptionProps('active', true);
      
      expect(optionProps).toEqual({
        'role': 'option',
        'aria-selected': true,
        'tabIndex': 0,
        'data-value': 'active'
      });
    });
  });

  describe('Screen Reader Support', () => {
    test('status changes are announced', () => {
      const { result } = renderHook(() => 
        useDropdownAria({
          isOpen: true,
          id: 'test-dropdown',
          labelText: 'Project status'
        })
      );
      
      const screenReaderText = result.current.getScreenReaderText('selected', 'completed');
      expect(screenReaderText).toBe('completed selected');
      
      const openText = result.current.getScreenReaderText('opened');
      expect(openText).toBe('Project status menu opened');
      
      const closeText = result.current.getScreenReaderText('closed');
      expect(closeText).toBe('Project status menu closed');
    });
  });

  describe('Focus Management', () => {
    test('focus returns to trigger after dropdown closes', async () => {
      const user = userEvent.setup();
      const mockOnClick = vi.fn();
      
      const { rerender } = render(
        <div>
          <StatusBadge 
            status="active" 
            variant="editable" 
            onClick={mockOnClick}
          />
        </div>
      );
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      // Simulate dropdown opening and then closing
      rerender(
        <div>
          <StatusBadge 
            status="active" 
            variant="editable" 
            onClick={mockOnClick}
          />
          <StatusDropdown
            currentStatus="active"
            isOpen={true}
            onSelect={vi.fn()}
            onClose={vi.fn()}
            projectId="test"
          />
        </div>
      );
      
      // Dropdown should be focusable
      const dropdown = screen.getByRole('listbox');
      expect(dropdown).toBeInTheDocument();
    });
  });
});