import React from 'react';
import { createPortal } from 'react-dom';
import type { ProjectRole } from '@/roles/api';

interface Props {
  roles: ProjectRole[];
  currentId?: number | null;
  onSelect: (roleId: number | null, roleName: string | null) => void;
  onClose: () => void;
  ariaLabel?: string;
  labelledById?: string;
  // Optional anchor to render via portal above any overflow/stacking contexts
  anchorRef?: React.RefObject<HTMLElement>;
}

const RoleDropdown: React.FC<Props> = ({ roles, currentId, onSelect, onClose, ariaLabel = 'Role options', labelledById, anchorRef }) => {
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const [activeIndex, setActiveIndex] = React.useState<number>(() => {
    const idx = roles.findIndex(r => r.id === (currentId ?? undefined));
    return currentId == null ? 0 : (idx >= 0 ? idx + 1 : 0); // +1 for Clear role
  });

  const items = React.useMemo(() => [{ id: null as number | null, name: 'Clear role' }, ...roles.map(r => ({ id: r.id as number, name: r.name }))], [roles]);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!listRef.current) return;
      const target = e.target as HTMLElement;
      if (!listRef.current.contains(target)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  React.useEffect(() => {
    // Autofocus listbox so keyboard works immediately
    listRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    const max = items.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i >= max ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i <= 0 ? max : i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(max);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const choice = items[activeIndex];
      onSelect(choice.id, choice.name ?? null);
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  const activeId = `role-option-${activeIndex}`;

  // If an anchor is provided, render in a portal positioned to the anchor to avoid clipping by overflow-hidden parents
  const [pos, setPos] = React.useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 200 });
  React.useLayoutEffect(() => {
    function measure() {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: Math.max(200, r.width) });
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchorRef?.current]);

  const dropdown = (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={activeId}
      aria-labelledby={labelledById}
      aria-label={labelledById ? undefined : ariaLabel}
      className={`${anchorRef ? 'z-50' : 'absolute z-50 mt-1'} min-w-[200px] max-h-60 overflow-auto bg-[var(--card)] border border-[var(--border)] rounded shadow-lg`}
      style={anchorRef ? { position: 'fixed', left: pos.left, top: pos.top, width: pos.width } : undefined}
      onKeyDown={handleKeyDown}
      data-portal={anchorRef ? 'true' : undefined}
    >
      {items.map((item, idx) => {
        const selected = (currentId == null && idx === 0) || (item.id != null && item.id === currentId);
        return (
          <li
            key={`${item.id ?? 'clear'}`}
            id={`role-option-${idx}`}
            role="option"
            aria-selected={selected}
            className={`px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surfaceHover)] ${selected ? 'text-[var(--text)]' : 'text-[var(--muted)]'} ${idx === activeIndex ? 'bg-[var(--surfaceOverlay)]' : ''}`}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => { onSelect(item.id, item.id == null ? null : item.name); onClose(); }}
          >
            {item.name}
          </li>
        );
      })}
    </ul>
  );

  if (anchorRef && typeof document !== 'undefined') {
    return createPortal(dropdown, document.body);
  }

  return dropdown;
};

export default RoleDropdown;
