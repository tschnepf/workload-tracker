/**
 * Project Status Subscription Hook
 * Implements pub-sub pattern for cross-component status updates
 * Ensures all components stay in sync when project status changes
 */

import { useState, useEffect, useCallback } from 'react';
import type { Project } from '@/types/models';

// Global event system for project status changes
type StatusChangeEvent = {
  projectId: number;
  oldStatus: Project['status'];
  newStatus: Project['status'];
  timestamp: number;
};

type StatusChangeListener = (event: StatusChangeEvent) => void;

class ProjectStatusEventManager {
  private listeners = new Map<string, StatusChangeListener>();
  private projectListeners = new Map<number, Set<string>>();

  // Subscribe to status changes for a specific project
  subscribe(projectId: number, listener: StatusChangeListener): () => void {
    const listenerId = `${projectId}-${Date.now()}-${Math.random()}`;
    
    // Store the listener
    this.listeners.set(listenerId, listener);
    
    // Track project-specific listeners
    if (!this.projectListeners.has(projectId)) {
      this.projectListeners.set(projectId, new Set());
    }
    this.projectListeners.get(projectId)!.add(listenerId);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listenerId);
      const projectSet = this.projectListeners.get(projectId);
      if (projectSet) {
        projectSet.delete(listenerId);
        if (projectSet.size === 0) {
          this.projectListeners.delete(projectId);
        }
      }
    };
  }

  // Subscribe to all status changes
  subscribeToAll(listener: StatusChangeListener): () => void {
    const listenerId = `all-${Date.now()}-${Math.random()}`;
    this.listeners.set(listenerId, listener);

    return () => {
      this.listeners.delete(listenerId);
    };
  }

  // Emit a status change event
  emit(projectId: number, oldStatus: Project['status'], newStatus: Project['status']): void {
    const event: StatusChangeEvent = {
      projectId,
      oldStatus,
      newStatus,
      timestamp: Date.now()
    };

    // Notify project-specific listeners
    const projectSet = this.projectListeners.get(projectId);
    if (projectSet) {
      projectSet.forEach(listenerId => {
        const listener = this.listeners.get(listenerId);
        if (listener) {
          try {
            listener(event);
          } catch (error) {
            console.error(`Error in project status listener ${listenerId}:`, error);
          }
        }
      });
    }

    // Notify global listeners
    this.listeners.forEach((listener, listenerId) => {
      if (!listenerId.startsWith(`${projectId}-`)) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in global status listener ${listenerId}:`, error);
        }
      }
    });
  }

  // Get current subscriber count for debugging
  getSubscriberCount(projectId?: number): number {
    if (projectId !== undefined) {
      return this.projectListeners.get(projectId)?.size || 0;
    }
    return this.listeners.size;
  }
}

// Global singleton instance
const statusEventManager = new ProjectStatusEventManager();

export interface UseProjectStatusSubscriptionOptions {
  projectId?: number;
  onStatusChange?: (event: StatusChangeEvent) => void;
  debug?: boolean;
}

/**
 * Hook to subscribe to project status changes
 * Can subscribe to specific project or all projects
 */
export function useProjectStatusSubscription(options: UseProjectStatusSubscriptionOptions = {}) {
  const { projectId, onStatusChange, debug = false } = options;
  const [lastEvent, setLastEvent] = useState<StatusChangeEvent | null>(null);

  // Memoized event handler
  const handleStatusChange = useCallback((event: StatusChangeEvent) => {
    if (debug) {
      console.log(`[ProjectStatusSubscription] Status change for project ${event.projectId}: ${event.oldStatus} -> ${event.newStatus}`);
    }
    
    setLastEvent(event);
    
    if (onStatusChange) {
      onStatusChange(event);
    }
  }, [onStatusChange, debug]);

  // Subscribe to events
  useEffect(() => {
    if (projectId !== undefined) {
      // Subscribe to specific project
      const unsubscribe = statusEventManager.subscribe(projectId, handleStatusChange);
      
      if (debug) {
        console.log(`[ProjectStatusSubscription] Subscribed to project ${projectId}`);
      }
      
      return unsubscribe;
    } else {
      // Subscribe to all projects
      const unsubscribe = statusEventManager.subscribeToAll(handleStatusChange);
      
      if (debug) {
        console.log(`[ProjectStatusSubscription] Subscribed to all projects`);
      }
      
      return unsubscribe;
    }
  }, [projectId, handleStatusChange, debug]);

  // Emit status change event
  const emitStatusChange = useCallback((
    targetProjectId: number, 
    oldStatus: Project['status'], 
    newStatus: Project['status']
  ) => {
    statusEventManager.emit(targetProjectId, oldStatus, newStatus);
  }, []);

  return {
    lastEvent,
    emitStatusChange,
    getSubscriberCount: () => statusEventManager.getSubscriberCount(projectId)
  };
}