import React from 'react';
import Modal from '@/components/ui/Modal';
import { personSkillsApi } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { PersonSkill } from '@/types/models';

interface MobileSkillsFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSkills: string[];
  onChange: (skills: string[]) => void;
}

const MobileSkillsFilterDrawer: React.FC<MobileSkillsFilterDrawerProps> = ({
  isOpen,
  onClose,
  selectedSkills,
  onChange,
}) => {
  const [search, setSearch] = React.useState('');
  const debounced = useDebounce(search, 200);
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSuggestions([]);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const fetchSuggestions = async () => {
      try {
        setLoading(true);
        const response = await personSkillsApi.list({
          skill_type: 'strength',
          search: debounced || undefined,
          page_size: 50,
        });
        if (!active) return;
        const names = new Set<string>();
        (response.results || []).forEach((skill: PersonSkill) => {
          const label = skill.skillTagName || '';
          if (label) names.add(label);
        });
        setSuggestions(Array.from(names));
      } catch {
        if (active) setSuggestions([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchSuggestions();
    return () => {
      active = false;
    };
  }, [debounced, isOpen]);

  const addSkill = (skill: string) => {
    if (!skill.trim()) return;
    if (selectedSkills.includes(skill)) return;
    onChange([...selectedSkills, skill]);
    setSearch('');
  };

  const removeSkill = (skill: string) => {
    onChange(selectedSkills.filter((s) => s !== skill));
  };

  const clearAll = () => onChange([]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filter by skills"
      width="min(640px, 95vw)"
    >
      <div className="space-y-4 text-[var(--text)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search strengths..."
            className="flex-1 px-3 py-2 rounded border border-[var(--border)] bg-[var(--surface)] text-sm focus:border-[var(--focus)] focus:outline-none"
          />
          <button
            type="button"
            className="px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
            onClick={clearAll}
            disabled={selectedSkills.length === 0}
          >
            Clear
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Active filters</div>
          {selectedSkills.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">No skills selected.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/30"
                >
                  {skill}
                  <button
                    type="button"
                    className="hover:text-blue-100"
                    onClick={() => removeSkill(skill)}
                    aria-label={`Remove ${skill}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Suggestions</div>
          <div className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-lg">
            {loading ? (
              <div className="px-3 py-4 text-sm text-[var(--muted)]">Searching skills…</div>
            ) : suggestions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-[var(--muted)]">
                {debounced ? 'No skills match this search.' : 'Start typing to search skills.'}
              </div>
            ) : (
              suggestions.map((skill) => (
                <button
                  key={`suggestion-${skill}`}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surfaceHover)]"
                  onClick={() => addSkill(skill)}
                >
                  {skill}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MobileSkillsFilterDrawer;

