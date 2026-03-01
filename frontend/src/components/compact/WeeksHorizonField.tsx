import React from 'react';

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

const clampWeeks = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const WeeksHorizonField: React.FC<Props> = ({
  value,
  onChange,
  min = 1,
  max = 52,
  className,
}) => {
  const [inputValue, setInputValue] = React.useState(String(value));
  const inputId = React.useId();

  React.useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commit = React.useCallback(() => {
    if (!inputValue.trim()) {
      setInputValue(String(value));
      return;
    }
    const parsed = Number.parseInt(inputValue, 10);
    if (Number.isNaN(parsed)) {
      setInputValue(String(value));
      return;
    }
    const next = clampWeeks(parsed, min, max);
    setInputValue(String(next));
    if (next !== value) onChange(next);
  }, [inputValue, value, min, max, onChange]);

  return (
    <div className={`h-10 shrink-0 inline-flex items-center gap-2 px-2 rounded border border-[var(--border)] bg-[var(--surface)] ${className || ''}`.trim()}>
      <label htmlFor={inputId} className="text-xs text-[var(--muted)] shrink-0">
        Weeks
      </label>
      <input
        id={inputId}
        type="number"
        min={min}
        max={max}
        value={inputValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === '') {
            setInputValue('');
            return;
          }
          if (!/^\d+$/.test(next)) return;
          setInputValue(next);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        aria-label="Weeks horizon"
        className="w-16 bg-transparent text-sm text-[var(--text)] focus:outline-none"
      />
    </div>
  );
};

export default WeeksHorizonField;
