import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const ProjectsListDesktopLayout: React.FC<Props> = ({ children, className }) => (
  <div className={className || 'relative flex-1 h-full min-h-0 min-w-0 overflow-hidden'}>
    {children}
  </div>
);

export default ProjectsListDesktopLayout;
