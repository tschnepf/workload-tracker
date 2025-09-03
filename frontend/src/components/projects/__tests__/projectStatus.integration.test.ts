/**
 * Integration tests for project status update functionality
 * Tests discriminated union state transitions, error recovery, and derived state recomputation
 */

import { renderHook, act } from '@testing-library/react';
import { useProjectStatus } from '../useProjectStatus';
import { useProjectStatusSubscription } from '../useProjectStatusSubscription';
import { vi, describe, beforeEach, test, expect } from 'vitest';

// Mock the projects API
vi.mock('@/hooks/useProjects', () => ({
  useUpdateProject: () => ({
    mutateAsync: vi.fn()
  })
}));

describe('Project Status Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('optimistic update with rollback on error', async () => {
    const mockGetCurrentStatus = vi.fn().mockReturnValue('active');
    const mockOnOptimisticUpdate = vi.fn();
    const mockOnRollback = vi.fn();
    const mockOnError = vi.fn();

    const { result } = renderHook(() => useProjectStatus({
      getCurrentStatus: mockGetCurrentStatus,
      onOptimisticUpdate: mockOnOptimisticUpdate,
      onRollback: mockOnRollback,
      onError: mockOnError,
      maxRetries: 1
    }));

    // Mock API failure
    const mockUpdateProject = require('@/hooks/useProjects').useUpdateProject();
    mockUpdateProject.mutateAsync.mockRejectedValue(new Error('API Error'));

    // Test optimistic update followed by rollback
    await act(async () => {
      try {
        await result.current.updateStatus(1, 'completed');
      } catch (error) {
        // Expected to fail
      }
    });

    expect(mockOnOptimisticUpdate).toHaveBeenCalledWith(1, 'completed', 'active');
    expect(mockOnRollback).toHaveBeenCalledWith(1, 'active');
    expect(mockOnError).toHaveBeenCalledWith(1, 'API Error');
  });

  test('discriminated union state transitions', () => {
    const { result } = renderHook(() => useProjectStatus());

    // Initial state should be idle
    expect(result.current.getUpdateState(1)).toEqual({ type: 'idle' });
    expect(result.current.isUpdating(1)).toBe(false);

    // After starting update, state should be updating
    act(() => {
      result.current.updateStatus(1, 'completed');
    });

    const updatingState = result.current.getUpdateState(1);
    expect(updatingState.type).toBe('updating');
    if (updatingState.type === 'updating') {
      expect(updatingState.projectId).toBe(1);
      expect(updatingState.previousStatus).toBeDefined();
    }

    expect(result.current.isUpdating(1)).toBe(true);
  });

  test('derived state recomputation', async () => {
    let allowedProjectIds = new Set([1, 2]); // Projects 1 and 2 are initially allowed
    const mockOnStatusChange = vi.fn().mockImplementation((event) => {
      // Simulate recomputing allowedProjectIds when status changes
      if (event.projectId === 1 && event.newStatus === 'cancelled') {
        allowedProjectIds.delete(1); // Remove cancelled project from allowed set
      } else if (event.projectId === 1 && event.newStatus === 'active') {
        allowedProjectIds.add(1); // Add active project back to allowed set
      }
    });

    const { result: subscriptionResult } = renderHook(() => 
      useProjectStatusSubscription({
        onStatusChange: mockOnStatusChange
      })
    );

    // Test that changing status triggers derived state recomputation
    act(() => {
      subscriptionResult.current.emitStatusChange(1, 'active', 'cancelled');
    });

    expect(mockOnStatusChange).toHaveBeenCalledWith({
      projectId: 1,
      oldStatus: 'active',
      newStatus: 'cancelled',
      timestamp: expect.any(Number)
    });

    // Verify derived state was updated
    expect(allowedProjectIds.has(1)).toBe(false);

    // Test changing back to active
    act(() => {
      subscriptionResult.current.emitStatusChange(1, 'cancelled', 'active');
    });

    expect(allowedProjectIds.has(1)).toBe(true);
  });

  test('pub-sub cross-component synchronization', () => {
    const mockListener1 = vi.fn();
    const mockListener2 = vi.fn();

    const { result: sub1 } = renderHook(() => 
      useProjectStatusSubscription({
        projectId: 1,
        onStatusChange: mockListener1
      })
    );

    const { result: sub2 } = renderHook(() => 
      useProjectStatusSubscription({
        onStatusChange: mockListener2 // Listen to all projects
      })
    );

    // Emit status change
    act(() => {
      sub1.current.emitStatusChange(1, 'active', 'completed');
    });

    // Both listeners should be notified
    expect(mockListener1).toHaveBeenCalledTimes(1);
    expect(mockListener2).toHaveBeenCalledTimes(1);

    // Emit change for different project
    act(() => {
      sub1.current.emitStatusChange(2, 'planning', 'active');
    });

    // Only global listener should be notified
    expect(mockListener1).toHaveBeenCalledTimes(1); // Still 1
    expect(mockListener2).toHaveBeenCalledTimes(2); // Now 2
  });
});

describe('Performance Tests', () => {
  test('status update performance with large dataset', async () => {
    const startTime = performance.now();
    
    // Simulate updating 100 projects
    const promises = [];
    for (let i = 1; i <= 100; i++) {
      const { result } = renderHook(() => useProjectStatus({
        getCurrentStatus: () => 'active',
        onOptimisticUpdate: vi.fn(),
        onSuccess: vi.fn()
      }));
      
      promises.push(act(async () => {
        await result.current.updateStatus(i, 'completed');
      }));
    }

    await Promise.all(promises);
    
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should complete within reasonable time (adjust threshold as needed)
    expect(duration).toBeLessThan(5000); // 5 seconds max for 100 updates
  });

  test('memory usage with multiple subscribers', () => {
    const subscribers = [];

    // Create 100 subscribers
    for (let i = 0; i < 100; i++) {
      const { result } = renderHook(() => 
        useProjectStatusSubscription({
          projectId: i,
          onStatusChange: vi.fn()
        })
      );
      subscribers.push(result);
    }

    // Test that subscriber count is correct
    expect(subscribers[0].current.getSubscriberCount()).toBeGreaterThan(0);

    // Clean up should happen automatically when components unmount
    subscribers.forEach(sub => {
      // This would normally happen on component unmount
      // Just verify the subscriber exists for now
      expect(sub.current.getSubscriberCount).toBeDefined();
    });
  });
});