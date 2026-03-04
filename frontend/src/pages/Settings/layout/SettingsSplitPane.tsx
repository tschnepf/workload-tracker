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
const NAV_COLLAPSED_STORAGE_KEY = 'settings.navCollapsed';

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
  return '';
}

const SettingsSplitPane: React.FC<SettingsSplitPaneProps> = ({ sections }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
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
    return '';
  }, [filteredSections, selectedId]);

  useEffect(() => {
    if (!activeSectionId) return;
    window.localStorage.setItem(STORAGE_KEY, activeSectionId);
  }, [activeSectionId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, isNavCollapsed ? '1' : '0');
    } catch {
      // ignore persistence failures
    }
  }, [isNavCollapsed]);

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
    <div className={clsx(
      'flex flex-col gap-6 min-h-[480px] md:grid',
      isNavCollapsed ? 'md:grid-cols-[minmax(0,1fr)]' : 'md:grid-cols-[260px_minmax(0,1fr)]',
    )}>
      {!isNavCollapsed && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-[var(--muted)]">Sections</div>
            <button
              type="button"
              className="h-8 px-2 rounded border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
              onClick={() => setIsNavCollapsed(true)}
              title="Collapse settings sections"
            >
              Hide
            </button>
          </div>
          <Input
            label="Search"
            value={filter}
            onChange={e => setFilter((e.target as HTMLInputElement).value)}
            placeholder="Search sections…"
          />
          <nav role="tablist" aria-label="Settings sections" className="mt-4 space-y-1 overflow-auto">
            {filteredSections.map((section, index) => {
              const isActive = section.id === activeSectionId;
              return (
                <React.Fragment key={section.id}>
                  {section.separatorBefore && index > 0 && (
                    <div className="my-2 border-t border-[var(--border)]" aria-hidden />
                  )}
                  <button
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
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      )}
      <div role="tabpanel" aria-labelledby={activeSectionId}>
        {isNavCollapsed && (
          <div className="mb-3">
            <button
              type="button"
              className="h-8 px-3 rounded border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
              onClick={() => setIsNavCollapsed(false)}
              title="Expand settings sections"
            >
              Show Sections
            </button>
          </div>
        )}
        {filteredSections.length === 0 ? (
          <p className="text-[var(--muted)]">No sections match “{filter}”.</p>
        ) : !activeSectionId ? (
          <p className="text-[var(--muted)]">Select a settings section to load details.</p>
        ) : ActiveSection ? (
          <ActiveSection />
        ) : null}
      </div>
    </div>
  );
};

export default SettingsSplitPane;
