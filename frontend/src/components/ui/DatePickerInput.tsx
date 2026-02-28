import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PickerState = {
  month: number;
  year: number;
  anchorRect: AnchorRect;
};

interface DatePickerInputProps {
  label?: string;
  value?: string | null;
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
}

const parseYmd = (value: string): { year: number; month: number; day: number } | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yy, mm, dd] = value.split('-').map(Number);
  if (!yy || !mm || !dd) return null;
  return { year: yy, month: mm - 1, day: dd };
};

const formatYmd = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatDisplayDate = (value: string | null | undefined) => {
  if (!value) return '';
  const parsed = parseYmd(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(parsed.year, parsed.month, parsed.day)
  );
};

const DatePickerInput: React.FC<DatePickerInputProps> = ({
  label,
  value,
  onChange,
  name,
  required,
  disabled,
  error,
  placeholder = 'Select a date',
  className = '',
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const inputId = useId();

  const selected = useMemo(() => {
    if (!value) return null;
    return parseYmd(value);
  }, [value]);

  const closePicker = () => setPicker(null);

  const openPicker = () => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const baseDate = selected ? new Date(selected.year, selected.month, selected.day) : new Date();
    setPicker({
      month: baseDate.getMonth(),
      year: baseDate.getFullYear(),
      anchorRect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  useEffect(() => {
    if (!picker) return;

    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (popoverRef.current && target && popoverRef.current.contains(target)) return;
      if (buttonRef.current && target && buttonRef.current.contains(target)) return;
      setPicker(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPicker(null);
      }
    };
    const handleScroll = () => setPicker(null);
    const handleResize = () => setPicker(null);

    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [picker]);

  const moveMonth = (delta: number) => {
    setPicker((prev) => {
      if (!prev) return prev;
      const next = new Date(prev.year, prev.month + delta, 1);
      return { ...prev, month: next.getMonth(), year: next.getFullYear() };
    });
  };

  const displayValue = formatDisplayDate(value);

  const popover = picker && typeof document !== 'undefined'
    ? (() => {
      const { anchorRect, month, year } = picker;
      const popoverWidth = 244;
      const popoverHeight = 260;
      const margin = 8;
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
      const spaceBelow = viewportH - anchorRect.bottom;
      const placeBelow = spaceBelow >= popoverHeight || anchorRect.top < popoverHeight;
      const top = placeBelow ? anchorRect.bottom + 6 : anchorRect.top - popoverHeight - 6;
      const left = Math.min(Math.max(anchorRect.left, margin), Math.max(margin, viewportW - popoverWidth - margin));
      const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
      const todayYmd = formatYmd(new Date());
      const start = new Date(year, month, 1);
      const startDay = start.getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();
      const cells = Array.from({ length: 42 }).map((_, idx) => {
        const offset = idx - startDay + 1;
        let d: Date;
        let inMonth = true;
        if (offset <= 0) {
          d = new Date(year, month - 1, daysInPrevMonth + offset);
          inMonth = false;
        } else if (offset > daysInMonth) {
          d = new Date(year, month + 1, offset - daysInMonth);
          inMonth = false;
        } else {
          d = new Date(year, month, offset);
        }
        const ymd = formatYmd(d);
        const isSelected = !!selected
          && selected.year === d.getFullYear()
          && selected.month === d.getMonth()
          && selected.day === d.getDate();
        const isToday = ymd === todayYmd;
        return { date: d, inMonth, isSelected, isToday, ymd };
      });

      return createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[1300]"
          style={{ top, left, width: popoverWidth }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Date picker"
        >
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                className="px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => moveMonth(-1)}
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="text-sm font-medium text-[var(--text)]">{monthLabel}</div>
              <button
                type="button"
                className="px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => moveMonth(1)}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 text-[10px] text-[var(--muted)] mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => (
                <button
                  key={cell.ymd}
                  type="button"
                  className={`h-7 w-7 text-xs rounded-full mx-auto flex items-center justify-center transition-colors ${
                    cell.isSelected
                      ? 'bg-[var(--primary)] text-white'
                      : cell.isToday
                        ? 'border border-[var(--primary)] text-[var(--text)]'
                        : cell.inMonth
                          ? 'text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                          : 'text-[var(--muted)]'
                  }`}
                  onClick={() => {
                    onChange(cell.ymd);
                    closePicker();
                  }}
                >
                  {cell.date.getDate()}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                className="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => {
                  onChange('');
                  closePicker();
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                onClick={closePicker}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      );
    })()
    : null;

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-[var(--text)]" htmlFor={inputId}>
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <button
        id={inputId}
        ref={buttonRef}
        type="button"
        name={name}
        disabled={disabled}
        onClick={() => {
          if (picker) closePicker();
          else openPicker();
        }}
        className={`
          w-full px-3 py-2 rounded-md border text-sm transition-colors
          bg-[var(--surface)] border-[var(--border)] text-[var(--text)]
          focus:border-[var(--focus)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-none
          min-h-[44px] flex items-center justify-between
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        aria-haspopup="dialog"
        aria-expanded={!!picker}
        aria-label={label || 'Start date'}
      >
        <span className={displayValue ? '' : 'text-[var(--muted)]'}>
          {displayValue || placeholder}
        </span>
        <span className="text-[var(--muted)] text-xs">Pick</span>
      </button>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      {popover}
    </div>
  );
};

export default DatePickerInput;
