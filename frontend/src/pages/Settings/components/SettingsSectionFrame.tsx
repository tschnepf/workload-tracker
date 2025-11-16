import React from 'react';
import clsx from 'clsx';

type SettingsSectionFrameProps = {
  id?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const SettingsSectionFrame: React.FC<SettingsSectionFrameProps> = ({
  id,
  title,
  description,
  actions,
  children,
  className,
}) => (
  <section
    id={id}
    className={clsx('bg-[var(--card)] border border-[var(--border)] rounded-lg p-6', className)}
  >
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-1">{title}</h2>
        {description ? <p className="text-[var(--muted)] text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex-shrink-0">{actions}</div> : null}
    </div>
    {children}
  </section>
);

export default SettingsSectionFrame;

