import React from 'react';
import ProjectDetailsDrawer from './ProjectDetailsDrawer';

type DrawerState = {
  isOpen: boolean;
  projectId: number | null;
};

type DrawerContextValue = {
  state: DrawerState;
  open: (projectId: number) => void;
  close: () => void;
};

const ProjectDetailsDrawerContext = React.createContext<DrawerContextValue | null>(null);

export function useProjectDetailsDrawer(): DrawerContextValue {
  const ctx = React.useContext(ProjectDetailsDrawerContext);
  if (!ctx) throw new Error('useProjectDetailsDrawer must be used within ProjectDetailsDrawerProvider');
  return ctx;
}

export const ProjectDetailsDrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<DrawerState>({ isOpen: false, projectId: null });

  const open = React.useCallback((projectId: number) => {
    if (!projectId) return;
    setState({ isOpen: true, projectId });
  }, []);

  const close = React.useCallback(() => {
    setState({ isOpen: false, projectId: null });
  }, []);

  const value = React.useMemo(() => ({ state, open, close }), [state, open, close]);

  return (
    <ProjectDetailsDrawerContext.Provider value={value}>
      {children}
      <ProjectDetailsDrawer open={state.isOpen} projectId={state.projectId} onClose={close} />
    </ProjectDetailsDrawerContext.Provider>
  );
};

export default ProjectDetailsDrawerProvider;
