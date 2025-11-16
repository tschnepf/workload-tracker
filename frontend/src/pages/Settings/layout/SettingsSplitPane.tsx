import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import clsx from 'clsx';
import Input from '@/components/ui/Input';
import type { SettingsSectionDefinition } from '../sections';
import { trackPerformanceEvent } from '@/utils/monitoring';

type SettingsSplitPaneProps = {
  sections: SettingsSectionDefinition[];
};

const STORAGE_KEY = 'settings.selectedSection';

function getInitialSection(
  sections: SettingsSectionDefinition[],
  locationSearch: string,
  locationHash: string,
): string {
  const searchParams = new URLSearchParams(locationSearch);
  const fromQuery = searchParams.get('section');
  if (fromQuery && sections.some(sec => sec.id === fromQuery)) {
    return fromQuery;
  }
  if (locationHash) {
    const hash = locationHash.replace('#', '');
    if (sections.some(sec => sec.id === hash)) {
      return hash;
    }
  }
  const fromStorage = window.localStorage.getItem(STORAGE_KEY);
  if (fromStorage && sections.some(sec => sec.id === fromStorage)) {
    return fromStorage;
  }
  return sections[0]?.id ?? '';
}

const SettingsSplitPane: React.FC<SettingsSplitPaneProps> = ({ sections }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(() =>
    getInitialSection(sections, location.search, location.hash),
  );

  const filteredSections = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return sections;
    return sections.filter(sec => sec.title.toLowerCase().includes(query));
  }, [filter, sections]);

  const activeSectionId = useMemo(() => {
    if (filteredSections.some(sec => sec.id === selectedId)) return selectedId;
    return filteredSections[0]?.id ?? '';
  }, [filteredSections, selectedId]);

  useEffect(() => {
    if (!activeSectionId) return;
    window.localStorage.setItem(STORAGE_KEY, activeSectionId);
  }, [activeSectionId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentParam = params.get('section');
    if (currentParam !== activeSectionId && activeSectionId) {
      params.set('section', activeSectionId);
      navigate({ search: params.toString() }, { replace: true });
    }
  }, [activeSectionId, location.search, navigate]);

  useEffect(() => {
    if (!location.hash) return;
    const hashId = location.hash.replace('#', '');
    if (sections.some(sec => sec.id === hashId)) {
      setSelectedId(hashId);
      const params = new URLSearchParams(location.search);
      params.set('section', hashId);
      navigate({ search: params.toString(), hash: '' }, { replace: true });
    }
  }, [location.hash, location.search, navigate, sections]);

  const ActiveSection = filteredSections.find(sec => sec.id === activeSectionId)?.component;

  return (
    <div className="flex flex-col gap-6 min-h-[480px] md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 flex flex-col">
        <Input
          label="Search"
          value={filter}
          onChange={e => setFilter((e.target as HTMLInputElement).value)}
          placeholder="Search sections…"
        />
        <nav role="tablist" aria-label="Settings sections" className="mt-4 space-y-1 overflow-auto">
          {filteredSections.map((section) => {
            const isActive = section.id === activeSectionId;
            return (
              <button
                key={section.id}
                role="tab"
                aria-selected={isActive}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded border',
                  isActive
                    ? 'bg-[var(--surfaceHover)] border-[var(--primary)] text-[var(--text)]'
                    : 'border-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]',
                )}
                onClick={() => {
                  setSelectedId(section.id);
                  trackPerformanceEvent('settings.section.select', 1, 'count', { section: section.id });
                }}
              >
                {section.title}
              </button>
            );
          })}
        </nav>
      </div>
      <div role="tabpanel" aria-labelledby={activeSectionId}>
        {filteredSections.length === 0 ? (
          <p className="text-[var(--muted)]">No sections match “{filter}”.</p>
        ) : ActiveSection ? (
          <ActiveSection />
        ) : null}
      </div>
    </div>
  );
};

export default SettingsSplitPane;
