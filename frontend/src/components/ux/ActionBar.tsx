import React from 'react';

export type ActionBarProps = {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  overflow?: React.ReactNode;
  danger?: React.ReactNode;
  className?: string;
  primaryAlign?: 'edge' | 'flow';
};

const ActionBar: React.FC<ActionBarProps> = ({ primary, secondary, overflow, danger, className, primaryAlign = 'edge' }) => {
  const primaryAlignClass = primaryAlign === 'flow' ? '' : 'ml-auto';
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className || ''}`.trim()}>
      <div className="flex items-center gap-2 min-w-0">{secondary}</div>
      <div className="flex items-center gap-2">{danger}</div>
      <div className="flex items-center gap-2">{overflow}</div>
      <div className={`flex items-center gap-2 ${primaryAlignClass}`.trim()}>{primary}</div>
    </div>
  );
};

export default ActionBar;
