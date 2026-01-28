import React from 'react';

export interface AutoHoursActionButtonsProps {
  onReplace: () => void;
  onSupplement: () => void;
  disabled?: boolean;
}

const AutoHoursActionButtons: React.FC<AutoHoursActionButtonsProps> = ({
  onReplace,
  onSupplement,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onReplace();
        }}
        disabled={disabled}
        title="Replace hours using auto hours presets"
        className="w-3.5 h-3.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[9px] font-semibold leading-none text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        R
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSupplement();
        }}
        disabled={disabled}
        title="Supplement hours using auto hours presets"
        className="w-3.5 h-3.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[9px] font-semibold leading-none text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        S
      </button>
    </div>
  );
};

export default AutoHoursActionButtons;
