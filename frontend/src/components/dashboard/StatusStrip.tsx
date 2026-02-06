import React from 'react';

export type StatusTone = 'info' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<StatusTone, { bg: string; border: string; text: string; iconBg: string }> = {
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-200',
    iconBg: 'bg-blue-500/20 text-blue-200',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-200',
    iconBg: 'bg-amber-500/20 text-amber-200',
  },
  danger: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-200',
    iconBg: 'bg-red-500/20 text-red-200',
  },
  neutral: {
    bg: 'bg-[var(--surface)]/70',
    border: 'border-[var(--border)]',
    text: 'text-[var(--text)]',
    iconBg: 'bg-[var(--surfaceHover)] text-[var(--text)]',
  },
};

interface StatusStripProps {
  tone?: StatusTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const DefaultIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      fill="currentColor"
      d="M12 2 1 21h22L12 2zm0 6.5c.6 0 1 .4 1 1v5.5a1 1 0 1 1-2 0V9.5c0-.6.4-1 1-1zm0 10.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"
    />
  </svg>
);

const StatusStrip: React.FC<StatusStripProps> = ({ tone = 'warning', icon, children, className }) => {
  const styles = toneClasses[tone];
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_6px_18px_rgba(0,0,0,0.25)] ${styles.bg} ${styles.border} ${className ?? ''}`}
    >
      <div className={`flex h-7 w-7 items-center justify-center rounded-full ${styles.iconBg}`}>
        {icon ?? <DefaultIcon />}
      </div>
      <div className={`text-sm font-medium ${styles.text}`}>{children}</div>
    </div>
  );
};

export default StatusStrip;
