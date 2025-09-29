/**
 * Visual regression tests for StatusBadge component
 * Ensures consistent styling between Projects and Assignments pages
 */

import React from 'react';
import { render, within } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';
import type { ProjectStatus } from '../status.utils';
import { vi, describe, test, expect } from 'vitest';

describe('StatusBadge Visual Regression Tests', () => {
  const allStatuses: ProjectStatus[] = ['active', 'active_ca', 'planning', 'on_hold', 'completed', 'cancelled'];

  test('display variant renders consistently', () => {
    const expectedLabels: Record<ProjectStatus, string> = {
      active: 'Active',
      active_ca: 'Active CA',
      planning: 'Planning',
      on_hold: 'On Hold',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };

    allStatuses.forEach(status => {
      const { container } = render(
        <StatusBadge status={status} variant="display" />
      );

      const badge = container.querySelector('span');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(expectedLabels[status]);
      
      // Test color consistency
      expect(badge).toHaveClass('text-xs', 'font-medium', 'inline-flex', 'items-center');
      
      // Status-specific color classes should be present
      const colorClasses = badge?.className || '';
      switch (status) {
        case 'active':
          expect(colorClasses).toContain('text-emerald-400');
          break;
        case 'active_ca':
        case 'planning':
          expect(colorClasses).toContain('text-blue-400');
          break;
        case 'on_hold':
          expect(colorClasses).toContain('text-amber-400');
          break;
        case 'completed':
          expect(colorClasses).toContain('text-[#cccccc]');
          break;
        case 'cancelled':
          expect(colorClasses).toContain('text-red-400');
          break;
      }
    });
  });

  test('editable variant renders with dropdown arrow', () => {
    allStatuses.forEach(status => {
      const mockOnClick = vi.fn();
      const { container } = render(
        <StatusBadge status={status} variant="editable" onClick={mockOnClick} />
      );
      
      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-haspopup', 'listbox');
      
      // Should have dropdown arrow icon
      const svg = button?.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });
  });

  test('loading state renders with spinner', () => {
    allStatuses.forEach(status => {
      const mockOnClick = vi.fn();
      const { container } = render(
        <StatusBadge 
          status={status} 
          variant="editable" 
          onClick={mockOnClick}
          isUpdating={true}
        />
      );
      
      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(button).toHaveClass('opacity-60', 'cursor-wait');
      
      // Should have spinner instead of dropdown arrow
      const spinnerPath = button?.querySelector('path[d*="4 12a8 8"]');
      expect(spinnerPath).toBeInTheDocument();
    });
  });

  test('status formatting consistency', () => {
    const testCases = [
      { input: 'active', expected: 'Active' },
      { input: 'active_ca', expected: 'Active CA' },
      { input: 'on_hold', expected: 'On Hold' },
      { input: 'completed', expected: 'Completed' },
      { input: 'cancelled', expected: 'Cancelled' },
      { input: 'not_a_status', expected: 'Not A Status' },
      { input: null, expected: 'Unknown' },
      { input: undefined, expected: 'Unknown' }
    ];

    testCases.forEach(({ input, expected }) => {
      const { container } = render(
        <StatusBadge status={input} variant="display" />
      );
      
      // Scope query to this render to avoid matching across multiple renders in the same test
      expect(within(container).getByText(expected)).toBeInTheDocument();
    });
  });

  test('accessibility attributes are correct', () => {
    const mockOnClick = vi.fn();
    const { container } = render(
      <StatusBadge 
        status="active" 
        variant="editable" 
        onClick={mockOnClick}
      />
    );
    
    const button = container.querySelector('button');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-haspopup', 'listbox');
    expect(button).toHaveAttribute('aria-label', 'Change status from Active');
  });

  test('color scheme consistency across variants', () => {
    // Test that both display and editable variants use same color classes
    const status = 'active';
    
    const { container: displayContainer } = render(
      <StatusBadge status={status} variant="display" />
    );
    
    const { container: editableContainer } = render(
      <StatusBadge status={status} variant="editable" onClick={vi.fn()} />
    );
    
    const displayBadge = displayContainer.querySelector('span');
    const editableButton = editableContainer.querySelector('button');
    
    // Both should have the same color class
    expect(displayBadge).toHaveClass('text-emerald-400');
    expect(editableButton).toHaveClass('text-emerald-400');
  });
});
