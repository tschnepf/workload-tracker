import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea: React.FC<TextareaProps> = ({ label, error, className = '', ...props }) => {
  const errorStyles = error ? 'border-[var(--color-state-danger)] focus-visible:ring-[var(--color-state-danger)]' : '';
  return (
    <div className="space-y-1">
      {label ? <label className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</label> : null}
      <textarea
        className={[
          'w-full min-h-[96px] rounded-[var(--radius-md)] border border-[var(--color-border)]',
          'bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]',
          'px-3 py-2 text-sm focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          errorStyles,
          className,
        ].join(' ')}
        {...props}
      />
      {error ? <p className="text-sm text-[var(--color-state-danger)]">{error}</p> : null}
    </div>
  );
};

export default Textarea;
