import React, { useMemo, useState } from 'react';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import Button from '@/components/ui/Button';
import { getUtilizationPill } from '@/util/utilization';

type Props = {
  readOnly?: boolean;
};

export const UtilizationSchemeEditor: React.FC<Props> = ({ readOnly }) => {
  const { data: scheme, isLoading, error, update, isUpdating } = useUtilizationScheme();
  const [form, setForm] = useState(() => (scheme ? toEditable(scheme) : defaultEditable()));

  React.useEffect(() => {
    if (scheme) setForm(toEditable(scheme));
  }, [scheme]);

  const valid = useMemo(() => validate(form), [form]);

  if (isLoading) {
    return <div className="text-[var(--muted)] text-sm">Loading utilization scheme...</div>;
  }
  if (error) {
    return <div className="text-red-400 text-sm">Failed to load utilization scheme: {error.message}</div>;
  }
  if (!scheme) return null;

  const toPercent = (value: number, capacity: number) => {
    const denom = capacity > 0 ? capacity : 1;
    return Math.round((value / denom) * 100);
  };

  const toHours = (value: number, capacity: number) => {
    const denom = capacity > 0 ? capacity : 1;
    return Math.round((value / 100) * denom);
  };

  const convertRanges = (current: Editable, nextMode: Editable['mode']): Editable => {
    if (current.mode === nextMode) return current;
    const capacity = current.full_capacity_hours || 36;
    const convert = nextMode === 'percent' ? toPercent : toHours;
    const blue_min = Math.max(1, convert(current.blue_min, capacity));
    const blue_max = Math.max(blue_min, convert(current.blue_max, capacity));
    const green_max = Math.max(blue_max + 1, convert(current.green_max, capacity));
    const orange_max = Math.max(green_max + 1, convert(current.orange_max, capacity));
    const red_min = Math.max(orange_max + 1, convert(current.red_min, capacity));
    return {
      ...current,
      mode: nextMode,
      blue_min,
      blue_max,
      green_min: blue_max + 1,
      green_max,
      orange_min: green_max + 1,
      orange_max,
      red_min,
    };
  };

  const onChange = (key: keyof Editable, value: number | boolean | 'absolute_hours' | 'percent') => {
    if (key === 'mode') {
      setForm((f) => convertRanges(f, value as Editable['mode']));
      return;
    }
    setForm((f) => ({ ...f, [key]: value as any }));
  };

  const onSave = async () => {
    if (!valid.ok) return;
    const payload = toPayload(form);
    await update(payload);
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text)]">Utilization Scheme</h2>
          <p className="text-[var(--muted)] text-sm">Edit hour ranges and zero handling. Changes are validated and protected by ETag.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">Mode</label>
          <select
            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[44px] focus:border-[var(--primary)]"
            value={form.mode}
            disabled={readOnly}
            onChange={(e) => onChange('mode', e.target.value as any)}
          >
            <option value="absolute_hours">Absolute Hours</option>
            <option value="percent">Percent</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input id="zeroIsBlank" type="checkbox" className="accent-[var(--primary)]" checked={form.zero_is_blank} disabled={readOnly}
                 onChange={(e) => onChange('zero_is_blank', e.target.checked)} />
          <label htmlFor="zeroIsBlank" className="text-sm text-[var(--text)]">Zero is blank</label>
        </div>
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">Hours at 100%</label>
          <input
            type="number"
            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            disabled={readOnly}
            min={1}
            value={form.full_capacity_hours}
            onChange={(e) => onChange('full_capacity_hours', Number(e.target.value))}
          />
          <div className="text-xs text-[var(--muted)] mt-1">Used when converting hours ↔ percent.</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-[120px_120px_120px] items-center gap-3 text-sm text-[var(--muted)] mb-2">
          <div></div>
          <div>Min</div>
          <div>Max</div>
        </div>
        {(['blue', 'green', 'orange'] as const).map((level) => (
          <div key={level} className="grid grid-cols-[120px_120px_120px] items-center gap-3 mb-3">
            <div className="text-sm text-[var(--text)]">{capitalize(level)}</div>
            <input
              type="number"
              className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              disabled={readOnly}
              value={(form as any)[`${level}_min`]}
              onChange={(e) => onChange(`${level}_min` as any, Number(e.target.value))}
            />
            <input
              type="number"
              className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              disabled={readOnly}
              value={(form as any)[`${level}_max`]}
              onChange={(e) => onChange(`${level}_max` as any, Number(e.target.value))}
            />
          </div>
        ))}
        <div className="grid grid-cols-[120px_120px_120px] items-center gap-3">
          <div className="text-sm text-[var(--text)]">Red</div>
          <input
            type="number"
            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            disabled={readOnly}
            value={form.red_min}
            onChange={(e) => onChange('red_min', Number(e.target.value))}
          />
          <div className="text-xs text-[var(--muted)]">Open-ended</div>
        </div>
      </div>

      {/* Live preview of pills using current form values */}
      {(() => {
        const s = {
          mode: form.mode,
          blue_min: form.blue_min, blue_max: form.blue_max,
          green_min: form.green_min, green_max: form.green_max,
          orange_min: form.orange_min, orange_max: form.orange_max,
          red_min: form.red_min,
          full_capacity_hours: form.full_capacity_hours,
          zero_is_blank: form.zero_is_blank,
        } as const;
        const fixedShell = 'inline-flex flex-col items-center justify-center gap-0.5 py-1 px-2 min-w-[46px] rounded-full text-xs font-medium text-center';
        const samples = [0, form.blue_max, form.green_min, form.green_max, form.orange_min, form.orange_max, form.red_min];
        const toPercentLabel = (hours: number) => {
          const denom = form.full_capacity_hours > 0 ? form.full_capacity_hours : 1;
          return `${Math.round((hours / denom) * 100)}%`;
        };
        const toHoursLabel = (percent: number) => {
          const denom = form.full_capacity_hours > 0 ? form.full_capacity_hours : 1;
          return `${Math.round((percent / 100) * denom)}h`;
        };
        return (
          <div className="mt-4">
            <div className="text-sm text-[var(--text)] font-medium mb-2">Preview</div>
            <div className="flex items-center gap-2">
              {samples.map((h) => {
                const isPercent = form.mode === 'percent';
                const hours = isPercent ? Math.round((h / 100) * (form.full_capacity_hours || 1)) : h;
                const percent = isPercent ? h : Math.round((h / (form.full_capacity_hours || 1)) * 100);
                const pill = getUtilizationPill({
                  hours,
                  percent,
                  capacity: form.full_capacity_hours,
                  scheme: s,
                  output: 'classes',
                });
                const hoursLabel = isPercent ? toHoursLabel(h) : `${h}h`;
                const percentLabel = isPercent ? `${h}%` : toPercentLabel(h);
                const aria = `${hoursLabel} (${percentLabel})`;
                return (
                  <div key={h} className={`${fixedShell} ${pill.classes}`} aria-label={aria} title={aria}>
                    <span className="leading-none">{hoursLabel}</span>
                    <span className="text-[10px] leading-none opacity-80">{percentLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {!valid.ok && (
        <div className="mt-3 text-xs text-red-400">{valid.message}</div>
      )}

      <div className="mt-4">
        <Button disabled={readOnly || !valid.ok || isUpdating} onClick={onSave}>
          {isUpdating ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

type Editable = {
  mode: 'absolute_hours' | 'percent';
  blue_min: number; blue_max: number;
  green_min: number; green_max: number;
  orange_min: number; orange_max: number;
  red_min: number;
  full_capacity_hours: number;
  zero_is_blank: boolean;
};

function toEditable(s: any): Editable {
  return {
    mode: s.mode,
    blue_min: s.blue_min, blue_max: s.blue_max,
    green_min: s.green_min, green_max: s.green_max,
    orange_min: s.orange_min, orange_max: s.orange_max,
    red_min: s.red_min,
    full_capacity_hours: s.full_capacity_hours ?? 36,
    zero_is_blank: s.zero_is_blank,
  };
}

function defaultEditable(): Editable {
  return {
    mode: 'absolute_hours',
    blue_min: 1,
    blue_max: 29,
    green_min: 30,
    green_max: 36,
    orange_min: 37,
    orange_max: 40,
    red_min: 41,
    full_capacity_hours: 36,
    zero_is_blank: true,
  };
}

function toPayload(f: Editable) { return { ...f }; }

function validate(f: Editable): { ok: boolean; message?: string } {
  if (f.blue_min < 1 || f.red_min < 1) return { ok: false, message: 'Lower bounds must be ≥ 1' };
  if (f.full_capacity_hours < 1) return { ok: false, message: 'Hours at 100% must be ≥ 1' };
  if (f.blue_min > f.blue_max) return { ok: false, message: 'Blue min must be ≤ max' };
  if (f.green_min > f.green_max) return { ok: false, message: 'Green min must be ≤ max' };
  if (f.orange_min > f.orange_max) return { ok: false, message: 'Orange min must be ≤ max' };
  if (f.green_min !== f.blue_max + 1) return { ok: false, message: 'Green min must be blue max + 1' };
  if (f.orange_min !== f.green_max + 1) return { ok: false, message: 'Orange min must be green max + 1' };
  if (f.red_min !== f.orange_max + 1) return { ok: false, message: 'Red min must be orange max + 1' };
  return { ok: true };
}

export default UtilizationSchemeEditor;
