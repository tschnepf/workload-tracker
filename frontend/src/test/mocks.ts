// Mock implementations for testing
import { vi } from 'vitest';

export const mockUseProjects = {
  useUpdateProject: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 1, status: 'completed' })
  })
}

export const mockProject = {
  id: 1,
  name: 'Test Project',
  status: 'active' as const,
  client: 'Test Client',
  isUpdating: false,
  lastUpdated: Date.now()
}

export const mockAssignment = {
  id: 1,
  project: 1,
  projectDisplayName: 'Test Project',
  personId: 1,
  weeklyHours: {}
}