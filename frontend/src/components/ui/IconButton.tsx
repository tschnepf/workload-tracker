import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'primary' | 'danger';
}

const sizeMap: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
};

const toneMap: Record<NonNullable<IconButtonProps['tone']>, string> = {
  default: 'text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--surfaceHover)]',
  primary: 'text-white border-[var(--color-action-primary)] bg-[var(--color-action-primary)] hover:bg-[var(--color-action-primary-hover)]',
  danger: 'text-white border-[var(--color-state-danger)] bg-[var(--color-state-danger)] hover:opacity-90',
};

const IconButton: React.FC<IconButtonProps> = ({
  label,
  size = 'md',
  tone = 'default',
  className = '',
  children,
  ...props
}) => {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center rounded-[var(--radius-md)] border',
        'focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
        'transition-colors motion-reduce:transition-none',
        'disabled:opacity-60 disabled:pointer-events-none',
        sizeMap[size],
        toneMap[tone],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  );
};

export default IconButton;
