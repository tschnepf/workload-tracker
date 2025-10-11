import { useEffect, useState } from 'react';
import type { Project } from '@/types/models';

export function useProjectSelection(sortedProjects: Project[]) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    if (sortedProjects.length > 0 && !selectedProject) {
      setSelectedProject(sortedProjects[0]);
      setSelectedIndex(0);
    }
  }, [sortedProjects, selectedProject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let newIndex = selectedIndex;
        if (e.key === 'ArrowUp' && selectedIndex > 0) {
          newIndex = selectedIndex - 1;
        } else if (e.key === 'ArrowDown' && selectedIndex < sortedProjects.length - 1) {
          newIndex = selectedIndex + 1;
        }
        if (newIndex !== selectedIndex) {
          setSelectedIndex(newIndex);
          setSelectedProject(sortedProjects[newIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, sortedProjects]);

  const handleProjectClick = (project: Project, index: number) => {
    setSelectedProject(project);
    setSelectedIndex(index);
  };

  return { selectedProject, setSelectedProject, selectedIndex, setSelectedIndex, handleProjectClick } as const;
}

