import React from 'react';
import type { Project } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';

export interface AddAssignmentRowProps {
  personId: number;
  weeks: WeekHeader[];
  gridTemplate: string;

  newProjectName: string;
  onSearchChange: (value: string) => void;

  projectSearchResults: Project[];
  selectedDropdownIndex: number;
  setSelectedDropdownIndex: React.Dispatch<React.SetStateAction<number>>;
  showProjectDropdown: boolean;
  setShowProjectDropdown: React.Dispatch<React.SetStateAction<boolean>>;

  selectedProject: Project | null;
  onProjectSelect: (project: Project) => void;
  onAddProject: (project: Project) => void;
  onAddSelected: () => void;
  onCancel: () => void;
}

const AddAssignmentRow: React.FC<AddAssignmentRowProps> = ({
  weeks,
  gridTemplate,
  newProjectName,
  onSearchChange,
  projectSearchResults,
  selectedDropdownIndex,
  setSelectedDropdownIndex,
  showProjectDropdown,
  setShowProjectDropdown,
  selectedProject,
  onProjectSelect,
  onAddProject,
  onAddSelected,
  onCancel,
}) => {
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [dropdownAbove, setDropdownAbove] = React.useState(false);
  const isDropdownOpen = showProjectDropdown && projectSearchResults.length > 0;

  React.useEffect(() => {
    if (!isDropdownOpen) return;
    const updatePlacement = () => {
      const el = searchInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dropdownHeight = 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropdownAbove(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isDropdownOpen, projectSearchResults.length]);

  return (
    <div className="grid gap-px p-1 bg-[var(--card)] border border-[var(--border)]" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2 relative">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (selectedDropdownIndex >= 0 && selectedDropdownIndex < projectSearchResults.length) {
                const proj = projectSearchResults[selectedDropdownIndex];
                onProjectSelect(proj);
                onAddProject(proj);
              } else if (selectedProject) {
                onAddSelected();
              }
            } else if (e.key === 'Escape') {
              onCancel();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (projectSearchResults.length > 0) {
                setShowProjectDropdown(true);
                setSelectedDropdownIndex((prev) => (prev < projectSearchResults.length - 1 ? prev + 1 : prev));
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (showProjectDropdown && projectSearchResults.length > 0) {
                setSelectedDropdownIndex((prev) => (prev > -1 ? prev - 1 : -1));
              }
            }
          }}
          placeholder="Search projects (name, client, number)..."
          className="w-full px-2 py-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
          autoFocus
          ref={searchInputRef}
        />
        {isDropdownOpen && (
          <div className={`absolute left-0 right-0 z-50 ${dropdownAbove ? 'bottom-full mb-1' : 'top-full mt-1'} bg-[var(--card)] border border-[var(--border)] rounded shadow-lg max-h-48 overflow-y-auto`}>
            {projectSearchResults.map((project, index) => (
              <button
                key={project.id}
                onClick={() => onProjectSelect(project)}
                className={`w-full text-left px-2 py-1 text-xs transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                  selectedDropdownIndex === index ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : 'hover:bg-[var(--surface)]'
                }`}
              >
                <div className="font-medium">{project.name}</div>
                <div className="text-[var(--muted)]">{[project.client, project.projectNumber].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          className="w-5 h-5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors flex items-center justify-center"
          title="Save assignment"
          onClick={onAddSelected}
          disabled={!selectedProject}
        >
          ✓
        </button>
        <button
          className="w-5 h-5 rounded bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] text-xs font-medium transition-colors flex items-center justify-center"
          title="Cancel"
          onClick={onCancel}
        >
          ✕
        </button>
      </div>
      <div></div>
      {weeks.map((week) => (
        <div key={week.date} className="flex items-center justify-center">
          <div className="w-12 h-6 flex items-center justify-center text-[var(--muted)] text-xs"></div>
        </div>
      ))}
    </div>
  );
};

export default AddAssignmentRow;
