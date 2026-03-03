import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const ProjectAssignmentsMobile: React.FC<Props> = ({ children, className }) => (
  <div className={className || 'lg:hidden min-h-0 flex flex-col bg-[var(--bg)]'}>
    {children}
  </div>
);

export default ProjectAssignmentsMobile;
