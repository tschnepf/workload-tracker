import React from 'react';

export interface GearMenuProps {
  open: boolean;
  disabled?: boolean;
  editingName?: boolean;
  onToggle: () => void;
  onEditName: () => void;
  onDelete: () => void;
}

export default function GearMenu(props: GearMenuProps) {
  const { open, disabled, editingName, onToggle, onEditName, onDelete } = props;
  return (
    <div className="gear-menu relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="p-1 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] rounded transition-colors disabled:opacity-50"
        title="Person options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-50">
          <button
            onClick={onEditName}
            disabled={disabled || editingName}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface)] transition-colors disabled:opacity-50 flex items-center gap-2"
            role="menuitem"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Name
          </button>
          <div className="border-t border-[var(--border)]" />
          <button
            onClick={onDelete}
            disabled={disabled}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-2"
            role="menuitem"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c-1 0 2 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            Delete Person
          </button>
        </div>
      )}
    </div>
  );
}
