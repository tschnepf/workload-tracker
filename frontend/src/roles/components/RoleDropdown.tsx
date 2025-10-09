import React from 'react';
import type { ProjectRole } from '@/roles/api';

interface Props {
  roles: ProjectRole[];
  currentId?: number | null;
  onSelect: (roleId: number | null, roleName: string | null) => void;
  onClose: () => void;
  ariaLabel?: string;
  labelledById?: string;
}

const RoleDropdown: React.FC<Props> = ({ roles, currentId, onSelect, onClose, ariaLabel = 'Role options', labelledById }) => {
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

  return (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={activeId}
      aria-labelledby={labelledById}
      aria-label={labelledById ? undefined : ariaLabel}
      className="absolute z-50 mt-1 min-w-[200px] max-h-60 overflow-auto bg-[var(--card)] border border-[var(--border)] rounded shadow-lg"
      onKeyDown={handleKeyDown}
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
};

export default RoleDropdown;
