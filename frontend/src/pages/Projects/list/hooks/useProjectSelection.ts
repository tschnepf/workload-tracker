import { useEffect, useMemo, useState } from 'react';
import type { Project } from '@/types/models';

type Options = {
  autoSelectFirst?: boolean;
  enabled?: boolean;
};

export function useProjectSelection(sortedProjects: Project[], options?: Options) {
  const autoSelectFirst = options?.autoSelectFirst ?? true;
  const enabled = options?.enabled ?? true;
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Derive selected project from id to keep in sync with list updates
  const selectedProject = useMemo(() => {
    if (selectedProjectId == null) return null
    const p = sortedProjects.find(p => p.id === selectedProjectId) || null
    return p
  }, [sortedProjects, selectedProjectId])

  // Initialize selection when projects first arrive
  useEffect(() => {
    if (!autoSelectFirst) return;
    if (sortedProjects.length > 0 && selectedProjectId == null) {
      setSelectedProjectId(sortedProjects[0].id ?? null)
      setSelectedIndex(0)
    }
  }, [autoSelectFirst, sortedProjects, selectedProjectId])

  // Keyboard navigation by index, but update id from list for stability
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let newIndex = selectedIndex;
        if (e.key === 'ArrowUp' && selectedIndex > 0) newIndex = selectedIndex - 1;
        else if (e.key === 'ArrowDown' && selectedIndex < sortedProjects.length - 1) newIndex = selectedIndex + 1;
        if (newIndex !== selectedIndex) {
          setSelectedIndex(newIndex);
          const p = sortedProjects[newIndex];
          if (p?.id != null) setSelectedProjectId(p.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, selectedIndex, sortedProjects]);

  const handleProjectClick = (project: Project, index: number) => {
    setSelectedProjectId(project.id ?? null);
    setSelectedIndex(index);
  };

  // Backwards-compatible setter used elsewhere: update id from project
  const setSelectedProject = (p: Project | null) => {
    if (p?.id != null) setSelectedProjectId(p.id)
    else setSelectedProjectId(null)
  }

  return { selectedProject, setSelectedProject, selectedIndex, setSelectedIndex, handleProjectClick } as const;
}
