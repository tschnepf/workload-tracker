/**
 * Custom hook for project status operations
 * Encapsulates optimistic updates, error handling, and loading states
 * with enhanced type safety using discriminated unions
 */

import { useState, useCallback } from 'react';
import { useUpdateProject } from '@/hooks/useProjects';
import type { Project } from '@/types/models';

// Discriminated unions for status update states (enhanced type safety)
export type StatusUpdateState = 
  | { type: 'idle' }
  | { type: 'updating'; previousStatus: Project['status']; projectId: number }
  | { type: 'success'; newStatus: Project['status']; projectId: number }
  | { type: 'error'; error: string; projectId: number; rollbackStatus: Project['status'] };

// Enhanced project interface for status operations
export interface ProjectStatusOperations {
  updateStatus: (projectId: number, newStatus: Project['status']) => Promise<void>;
  getUpdateState: (projectId: number) => StatusUpdateState;
  isUpdating: (projectId: number) => boolean;
  reset: (projectId: number) => void;
}

export interface UseProjectStatusOptions {
  onSuccess?: (projectId: number, newStatus: Project['status']) => void;
  onError?: (projectId: number, error: string) => void;
  onOptimisticUpdate?: (projectId: number, newStatus: Project['status'], previousStatus: Project['status']) => void;
  getCurrentStatus?: (projectId: number) => Project['status'] | null;
  onRollback?: (projectId: number, rollbackStatus: Project['status']) => void;
  maxRetries?: number;
  retryDelay?: number;
  enableCacheBusting?: boolean;
  debug?: boolean;
}

export function useProjectStatus(options: UseProjectStatusOptions = {}): ProjectStatusOperations {
  const {
    onSuccess,
    onError,
    onOptimisticUpdate,
    getCurrentStatus,
    onRollback,
    maxRetries = 3,
    retryDelay = 1000,
    enableCacheBusting = true,
    debug = false
  } = options;

  const updateProjectMutation = useUpdateProject();
  const [updateStates, setUpdateStates] = useState<Map<number, StatusUpdateState>>(new Map());

  // Get current update state for a project
  const getUpdateState = useCallback((projectId: number): StatusUpdateState => {
    return updateStates.get(projectId) || { type: 'idle' };
  }, [updateStates]);

  // Check if a project is currently updating
  const isUpdating = useCallback((projectId: number): boolean => {
    const state = getUpdateState(projectId);
    return state.type === 'updating';
  }, [getUpdateState]);

  // Reset update state for a project
  const reset = useCallback((projectId: number) => {
    setUpdateStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(projectId);
      return newMap;
    });
  }, []);

  // Exponential backoff retry logic
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const retryWithBackoff = async (
    fn: () => Promise<void>,
    attempt: number = 0,
    projectId?: number
  ): Promise<void> => {
    try {
      await fn();
    } catch (error) {
      if (attempt < maxRetries) {
        const delayMs = retryDelay * Math.pow(2, attempt); // Exponential backoff
        if (debug) {
          console.log(`[useProjectStatus] Retry attempt ${attempt + 1}/${maxRetries} for project ${projectId}, waiting ${delayMs}ms`);
        }
        await delay(delayMs);
        return retryWithBackoff(fn, attempt + 1, projectId);
      }
      throw error;
    }
  };

  // Main update status function with enhanced error handling and retries
  const updateStatus = useCallback(async (projectId: number, newStatus: Project['status']) => {
    const currentState = getUpdateState(projectId);
    
    // Prevent duplicate requests
    if (currentState.type === 'updating') {
      return;
    }

    try {
      // Get current project status from the callback or use default
      const previousStatus = getCurrentStatus ? getCurrentStatus(projectId) : 'active';
      
      if (debug) {
        console.log(`[useProjectStatus] Starting status update for project ${projectId}: ${previousStatus} -> ${newStatus}`);
      }
      
      // Set updating state
      setUpdateStates(prev => new Map(prev).set(projectId, {
        type: 'updating',
        previousStatus,
        projectId
      }));

      // Call optimistic update callback
      if (onOptimisticUpdate) {
        onOptimisticUpdate(projectId, newStatus, previousStatus);
      }

      // Perform API update with retry logic
      await retryWithBackoff(async () => {
        const updateData: any = { status: newStatus };
        
        // Add cache-busting timestamp if enabled
        if (enableCacheBusting) {
          updateData._cacheBust = Date.now();
        }
        
        await updateProjectMutation.mutateAsync({
          id: projectId,
          data: updateData
        });
      }, 0, projectId);

      // Set success state
      setUpdateStates(prev => new Map(prev).set(projectId, {
        type: 'success',
        newStatus,
        projectId
      }));

      if (debug) {
        console.log(`[useProjectStatus] Successfully updated project ${projectId} status to ${newStatus}`);
      }

      // Call success callback
      if (onSuccess) {
        onSuccess(projectId, newStatus);
      }

      // Auto-reset success state after a delay
      setTimeout(() => reset(projectId), 2000);

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const state = getUpdateState(projectId);
      const rollbackStatus = state.type === 'updating' ? state.previousStatus : 'active';

      // Set error state
      setUpdateStates(prev => new Map(prev).set(projectId, {
        type: 'error',
        error: errorMessage,
        projectId,
        rollbackStatus
      }));

      // Call rollback callback
      if (onRollback) {
        onRollback(projectId, rollbackStatus);
      }

      // Call error callback
      if (onError) {
        onError(projectId, errorMessage);
      }

      // Auto-reset error state after a delay
      setTimeout(() => reset(projectId), 5000);

      // Re-throw to allow caller to handle if needed
      throw error;
    }
  }, [updateProjectMutation, getUpdateState, onOptimisticUpdate, onSuccess, onError, onRollback, reset, maxRetries, retryDelay]);

  return {
    updateStatus,
    getUpdateState,
    isUpdating,
    reset
  };
}