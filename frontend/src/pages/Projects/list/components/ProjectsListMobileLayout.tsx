import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const ProjectsListMobileLayout: React.FC<Props> = ({ children, className }) => (
  <div className={className || 'min-h-0 flex flex-col bg-[var(--bg)]'}>
    {children}
  </div>
);

export default ProjectsListMobileLayout;
