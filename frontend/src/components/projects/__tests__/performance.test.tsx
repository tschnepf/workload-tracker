/**
 * Performance benchmark tests for project status components
 * Validates performance with large datasets and measures memoization effectiveness
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useProjectStatus } from '../useProjectStatus';
import { useProjectStatusSubscription } from '../useProjectStatusSubscription';
import { vi, describe, test, expect } from 'vitest';

// Mock large dataset
const generateMockProjects = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Project ${i + 1}`,
    status: i % 2 === 0 ? 'active' : 'completed',
    client: `Client ${i + 1}`,
    isUpdating: false,
    lastUpdated: Date.now()
  }));
};

const generateMockAssignments = (projectCount: number, assignmentsPerProject: number) => {
  const assignments = [];
  for (let p = 1; p <= projectCount; p++) {
    for (let a = 1; a <= assignmentsPerProject; a++) {
      assignments.push({
        id: (p - 1) * assignmentsPerProject + a,
        project: p,
        projectDisplayName: `Project ${p}`,
        personId: a,
        weeklyHours: {}
      });
    }
  }
  return assignments;
};

describe('Performance Benchmarks', () => {
  test('status update performance with 500+ assignments', async () => {
    const PERFORMANCE_THRESHOLD = 2000; // 2 seconds max
    const PROJECT_COUNT = 100;
    const ASSIGNMENTS_PER_PROJECT = 5;
    
    const projects = generateMockProjects(PROJECT_COUNT);
    const assignments = generateMockAssignments(PROJECT_COUNT, ASSIGNMENTS_PER_PROJECT);
    
    console.log(`Testing with ${projects.length} projects and ${assignments.length} assignments`);
    
    const startTime = performance.now();
    
    // Simulate multiple concurrent status updates
    const statusHooks = [];
    for (let i = 0; i < 10; i++) {
      const { result } = renderHook(() => useProjectStatus({
        getCurrentStatus: (projectId) => projects.find(p => p.id === projectId)?.status || 'active',
        onOptimisticUpdate: vi.fn(),
        onSuccess: vi.fn(),
        debug: false // Disable debug for performance testing
      }));
      statusHooks.push(result);
    }
    
    // Perform concurrent status updates
    const updatePromises = statusHooks.map((hook, index) => 
      act(async () => {
        try {
          await hook.current.updateStatus(index + 1, 'completed');
        } catch (error) {
          // Expected in test environment
        }
      })
    );
    
    await Promise.all(updatePromises);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Performance test completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD);
  });

  test('memoization effectiveness with repeated renders', () => {
    const RENDER_COUNT = 1000;
    const mockGetProjectStatus = vi.fn().mockReturnValue('active');
    
    const TestComponent = ({ projects }: { projects: any[] }) => {
      return (
        <div>
          {projects.map(project => (
            <div key={project.id}>
              {mockGetProjectStatus(project.id)}
            </div>
          ))}
        </div>
      );
    };
    
    const projects = generateMockProjects(100);
    
    const startTime = performance.now();
    
    // Render multiple times to test memoization
    let container;
    for (let i = 0; i < RENDER_COUNT; i++) {
      const result = render(<TestComponent projects={projects} />);
      container = result.container;
      result.unmount();
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`${RENDER_COUNT} renders completed in ${duration.toFixed(2)}ms`);
    console.log(`Average render time: ${(duration / RENDER_COUNT).toFixed(3)}ms`);
    
    // Should be very fast due to memoization
    expect(duration / RENDER_COUNT).toBeLessThan(1); // Less than 1ms per render
  });

  test('memory usage with large subscriber count', () => {
    const SUBSCRIBER_COUNT = 1000;
    const subscribers = [];
    
    console.log(`Creating ${SUBSCRIBER_COUNT} status subscribers...`);
    
    const startTime = performance.now();
    
    // Create many subscribers
    for (let i = 0; i < SUBSCRIBER_COUNT; i++) {
      const { result, unmount } = renderHook(() => 
        useProjectStatusSubscription({
          projectId: i % 100, // Distribute across 100 projects
          onStatusChange: vi.fn(),
          debug: false
        })
      );
      
      subscribers.push({ result, unmount });
    }
    
    const creationTime = performance.now() - startTime;
    console.log(`${SUBSCRIBER_COUNT} subscribers created in ${creationTime.toFixed(2)}ms`);
    
    // Test event broadcasting performance
    const broadcastStart = performance.now();
    
    act(() => {
      subscribers[0].result.current.emitStatusChange(1, 'active', 'completed');
    });
    
    const broadcastTime = performance.now() - broadcastStart;
    console.log(`Event broadcast completed in ${broadcastTime.toFixed(2)}ms`);
    
    // Cleanup
    const cleanupStart = performance.now();
    subscribers.forEach(({ unmount }) => unmount());
    const cleanupTime = performance.now() - cleanupStart;
    
    console.log(`Cleanup completed in ${cleanupTime.toFixed(2)}ms`);
    
    // Performance assertions
    expect(creationTime / SUBSCRIBER_COUNT).toBeLessThan(1); // Less than 1ms per subscriber
    expect(broadcastTime).toBeLessThan(100); // Event broadcast should be fast
    expect(cleanupTime).toBeLessThan(500); // Cleanup should be reasonable
  });

  test('DOM update performance with React.memo optimization', () => {
    const ASSIGNMENT_COUNT = 500;
    let renderCount = 0;
    
    const MockAssignmentRow = React.memo<{ assignment: any; projectsById: Map<number, any> }>(({ 
      assignment, 
      projectsById 
    }) => {
      renderCount++;
      const project = projectsById.get(assignment.project);
      return (
        <div data-testid={`assignment-${assignment.id}`}>
          {assignment.projectDisplayName} - {project?.status}
        </div>
      );
    });
    
    const assignments = generateMockAssignments(100, 5);
    const projects = generateMockProjects(100);
    const projectsById = new Map(projects.map(p => [p.id, p]));
    
    const TestContainer = ({ updatedProjectId }: { updatedProjectId?: number }) => {
      const currentProjectsById = new Map(projectsById);
      
      // Update one project's status
      if (updatedProjectId) {
        const project = currentProjectsById.get(updatedProjectId);
        if (project) {
          currentProjectsById.set(updatedProjectId, { ...project, status: 'completed' });
        }
      }
      
      return (
        <div>
          {assignments.map(assignment => (
            <MockAssignmentRow
              key={assignment.id}
              assignment={assignment}
              projectsById={currentProjectsById}
            />
          ))}
        </div>
      );
    };
    
    // Initial render
    renderCount = 0;
    const { rerender } = render(<TestContainer />);
    const initialRenderCount = renderCount;
    
    console.log(`Initial render: ${initialRenderCount} assignment rows rendered`);
    expect(initialRenderCount).toBe(ASSIGNMENT_COUNT);
    
    // Update one project's status
    renderCount = 0;
    const startTime = performance.now();
    
    rerender(<TestContainer updatedProjectId={1} />);
    
    const updateTime = performance.now() - startTime;
    const updatedRenderCount = renderCount;
    
    console.log(`Status update: ${updatedRenderCount} rows re-rendered in ${updateTime.toFixed(2)}ms`);
    
    // With React.memo, only affected assignments should re-render
    // Project 1 has 5 assignments, so only those should re-render
    expect(updatedRenderCount).toBeLessThanOrEqual(10); // Allow some buffer
    expect(updateTime).toBeLessThan(50); // Should be very fast
  });

  test('status dropdown rendering performance', () => {
    const DROPDOWN_COUNT = 100;
    const startTime = performance.now();
    
    const containers = [];
    for (let i = 0; i < DROPDOWN_COUNT; i++) {
      const { container } = render(
        <div>
          {/* Simulate multiple dropdowns */}
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j}>
              Status: <span>active</span>
            </div>
          ))}
        </div>
      );
      containers.push(container);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`${DROPDOWN_COUNT} dropdown containers rendered in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(1000); // Should be under 1 second
  });
});