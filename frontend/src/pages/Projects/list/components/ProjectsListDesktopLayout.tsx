import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const ProjectsListDesktopLayout: React.FC<Props> = ({ children, className }) => (
  <div className={className || 'relative flex-1 min-h-0 min-w-0'}>
    {children}
  </div>
);

export default ProjectsListDesktopLayout;
