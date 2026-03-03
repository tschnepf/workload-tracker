import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const ProjectAssignmentsDesktop: React.FC<Props> = ({ children, className }) => (
  <div className={className || 'hidden lg:flex flex-col min-h-0 min-w-0 flex-1'}>
    {children}
  </div>
);

export default ProjectAssignmentsDesktop;
