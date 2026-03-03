import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const AssignmentGridMobileToolbar: React.FC<Props> = ({ children, className }) => (
  <div className={className || 'lg:hidden border-b border-[var(--border)] bg-[var(--surface)] p-2'}>
    {children}
  </div>
);

export default AssignmentGridMobileToolbar;
