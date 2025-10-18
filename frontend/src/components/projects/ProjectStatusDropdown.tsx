import React from 'react';
import StatusBadge, { editableStatusOptions, formatStatus, getStatusColor } from '@/components/projects/StatusBadge';

interface Props {
  status: string;
  onChange: (newStatus: string) => void;
  isOpen: boolean;
  setOpen: (v: boolean) => void;
}

const ProjectStatusDropdown: React.FC<Props> = ({ status, onChange, isOpen, setOpen }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (containerRef.current && !containerRef.current.contains(target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen]);

  return (
    <div className="relative status-dropdown-container" ref={containerRef}>
      <button
        type="button"
        className={`${getStatusColor(status || '')} hover:bg-[var(--surfaceHover)] px-1 py-0.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-1`}
        onClick={() => setOpen(!isOpen)}
      >
        {formatStatus(status || '')}
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 min-w-[140px]">
          {editableStatusOptions.map((opt) => (
            <button
              key={opt}
              onClick={(e) => { e.stopPropagation(); onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--cardHover)] transition-colors first:rounded-t last:rounded-b ${
                status === opt ? 'bg-[var(--surfaceOverlay)]' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <StatusBadge status={opt} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectStatusDropdown;

