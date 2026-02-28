import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onNewProject: () => void;
  onToggleDetails: () => void;
  detailsOpen: boolean;
  onRefresh: () => void | Promise<void>;
}

const ProjectsActionsMenu: React.FC<Props> = ({ onNewProject, onToggleDetails, detailsOpen, onRefresh }) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const MENU_WIDTH = 180;

  const updateMenuPosition = React.useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(12, rect.right - MENU_WIDTH),
      Math.max(12, window.innerWidth - MENU_WIDTH - 12)
    );
    setMenuPos({ top: rect.bottom + 4, left });
  }, []);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  const runAction = async (fn: () => void | Promise<void>) => {
    setOpen(false);
    await fn();
  };

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        className="h-10 px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Open project actions menu"
        title="Actions"
      >
        Actions
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[1200] rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg p-1"
          style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          role="menu"
          aria-label="Project actions menu"
        >
          <button
            type="button"
            className="w-full text-left px-2 py-1 rounded text-xs text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onClick={() => { void runAction(onNewProject); }}
            role="menuitem"
          >
            New Project
          </button>
          <button
            type="button"
            className="w-full text-left px-2 py-1 rounded text-xs text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onClick={() => { void runAction(onToggleDetails); }}
            role="menuitem"
          >
            {detailsOpen ? 'Hide Details' : 'Show Details'}
          </button>
          <button
            type="button"
            className="w-full text-left px-2 py-1 rounded text-xs text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onClick={() => { void runAction(onRefresh); }}
            role="menuitem"
          >
            Refresh
          </button>
        </div>,
        document.body
      ) : null}
    </div>
  );
};

export default ProjectsActionsMenu;
