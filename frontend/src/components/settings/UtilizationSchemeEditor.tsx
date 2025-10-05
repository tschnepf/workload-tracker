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

  const onChange = (key: keyof Editable, value: number | boolean | 'absolute_hours' | 'percent') => {
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {['blue', 'green', 'orange'].map((level) => (
          <div key={level} className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">{capitalize(level)} Min</label>
              <input type="number" className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2"
                     disabled={readOnly}
                     value={(form as any)[`${level}_min`]}
                     onChange={(e) => onChange(`${level}_min` as any, Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">{capitalize(level)} Max</label>
              <input type="number" className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2"
                     disabled={readOnly}
                     value={(form as any)[`${level}_max`]}
                     onChange={(e) => onChange(`${level}_max` as any, Number(e.target.value))} />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">Red Min</label>
            <input type="number" className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2"
                   disabled={readOnly}
                   value={form.red_min}
                   onChange={(e) => onChange('red_min', Number(e.target.value))} />
          </div>
          <div className="text-xs text-[var(--muted)] self-center">Red is open-ended</div>
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
          zero_is_blank: form.zero_is_blank,
        } as const;
        const fixedShell = 'inline-flex items-center justify-center h-6 px-2 min-w-[40px] rounded-full text-xs font-medium text-center';
        const samples = [0, 15, 30, 36, 37, 40, 41];
        return (
          <div className="mt-4">
            <div className="text-sm text-[var(--text)] font-medium mb-2">Preview</div>
            <div className="flex items-center gap-2">
              {samples.map((h) => {
                const pill = getUtilizationPill({ hours: h, capacity: 40, scheme: s, output: 'classes' });
                const aria = h === 0 ? '0 hours' : `${h} hours`;
                return (
                  <div key={h} className={`${fixedShell} ${pill.classes}`} aria-label={aria} title={`${h}h`}>
                    {pill.label}
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
  zero_is_blank: boolean;
};

function toEditable(s: any): Editable {
  return {
    mode: s.mode,
    blue_min: s.blue_min, blue_max: s.blue_max,
    green_min: s.green_min, green_max: s.green_max,
    orange_min: s.orange_min, orange_max: s.orange_max,
    red_min: s.red_min,
    zero_is_blank: s.zero_is_blank,
  };
}

function defaultEditable(): Editable {
  return { mode: 'absolute_hours', blue_min: 1, blue_max: 29, green_min: 30, green_max: 36, orange_min: 37, orange_max: 40, red_min: 41, zero_is_blank: true };
}

function toPayload(f: Editable) { return { ...f }; }

function validate(f: Editable): { ok: boolean; message?: string } {
  if (f.blue_min < 1 || f.red_min < 1) return { ok: false, message: 'Lower bounds must be ≥ 1' };
  if (f.blue_min > f.blue_max) return { ok: false, message: 'Blue min must be ≤ max' };
  if (f.green_min > f.green_max) return { ok: false, message: 'Green min must be ≤ max' };
  if (f.orange_min > f.orange_max) return { ok: false, message: 'Orange min must be ≤ max' };
  if (f.green_min !== f.blue_max + 1) return { ok: false, message: 'Green min must be blue max + 1' };
  if (f.orange_min !== f.green_max + 1) return { ok: false, message: 'Orange min must be green max + 1' };
  if (f.red_min !== f.orange_max + 1) return { ok: false, message: 'Red min must be orange max + 1' };
  return { ok: true };
}

export default UtilizationSchemeEditor;
