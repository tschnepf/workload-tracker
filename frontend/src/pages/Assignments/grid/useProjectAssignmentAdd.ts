import { useCallback, useState } from 'react';
import type { Project } from '@/types/models';

export interface UseProjectAssignmentAddArgs {
  search: (query: string) => Project[];
  onAdd: (personId: number, project: Project) => Promise<void> | void;
}

export function useProjectAssignmentAdd({ search, onAdd }: UseProjectAssignmentAddArgs) {
  const [isAddingFor, setIsAddingFor] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSearchResults, setProjectSearchResults] = useState<Project[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(-1);

  const open = useCallback((personId: number) => {
    setIsAddingFor(personId);
    setNewProjectName('');
    setSelectedProject(null);
    setProjectSearchResults([]);
    setShowProjectDropdown(false);
    setSelectedDropdownIndex(-1);
  }, []);

  const reset = useCallback(() => {
    setIsAddingFor(null);
    setNewProjectName('');
    setSelectedProject(null);
    setProjectSearchResults([]);
    setShowProjectDropdown(false);
    setSelectedDropdownIndex(-1);
  }, []);

  const cancel = useCallback(() => {
    reset();
  }, [reset]);

  const onSearchChange = useCallback((value: string) => {
    setNewProjectName(value);
    const results = search(value);
    setProjectSearchResults(results);
    setShowProjectDropdown(results.length > 0);
    setSelectedProject(null);
    setSelectedDropdownIndex(-1);
  }, [search]);

  const onProjectSelect = useCallback((project: Project) => {
    setSelectedProject(project);
    setNewProjectName(project.name);
    setShowProjectDropdown(false);
    setProjectSearchResults([]);
    setSelectedDropdownIndex(-1);
  }, []);

  const addSelected = useCallback(async (personId: number) => {
    if (!selectedProject) return;
    await onAdd(personId, selectedProject);
    reset();
  }, [onAdd, reset, selectedProject]);

  const addProject = useCallback(async (personId: number, project: Project) => {
    await onAdd(personId, project);
    reset();
  }, [onAdd, reset]);

  return {
    // state
    isAddingFor,
    newProjectName,
    selectedProject,
    projectSearchResults,
    showProjectDropdown,
    selectedDropdownIndex,
    // setters for keyboard nav in the presentational component
    setSelectedDropdownIndex,
    setShowProjectDropdown,
    // actions
    open,
    reset,
    cancel,
    onSearchChange,
    onProjectSelect,
    addSelected,
    addProject,
  } as const;
}

export type UseProjectAssignmentAddReturn = ReturnType<typeof useProjectAssignmentAdd>;

