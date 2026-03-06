import React from 'react';

interface PanelHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ title, subtitle, actions, className = '' }) => (
  <div className={`flex items-start justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{subtitle}</p> : null}
    </div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
  </div>
);

export default PanelHeader;
