import React from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap: Record<NonNullable<SelectProps['size']>, string> = {
  sm: 'min-h-[36px] px-2 py-1 text-xs',
  md: 'min-h-[40px] px-3 py-2 text-sm',
  lg: 'min-h-[44px] px-3 py-2 text-base',
};

const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = '',
  children,
  size = 'md',
  ...props
}) => {
  const errorStyles = error ? 'border-[var(--color-state-danger)]' : '';
  return (
    <div className="space-y-1">
      {label ? <label className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</label> : null}
      <select
        className={[
          'w-full rounded-[var(--radius-md)] border border-[var(--color-border)]',
          'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)] focus:ring-0',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          sizeMap[size],
          errorStyles,
          className,
        ].join(' ')}
        {...props}
      >
        {options ? options.map((option) => (
          <option key={String(option.value)} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        )) : null}
        {children}
      </select>
      {error ? <p className="text-sm text-[var(--color-state-danger)]">{error}</p> : null}
    </div>
  );
};

export default Select;
