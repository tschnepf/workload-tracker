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
const NAV_EXPANDED_GROUPS_STORAGE_KEY = 'settings.navExpandedGroups';
const GROUP_ORDER: SettingsSectionDefinition['group'][] = ['company', 'projects', 'admin'];
const GROUP_LABELS: Record<SettingsSectionDefinition['group'], string> = {
  company: 'Company',
  projects: 'Projects',
  admin: 'Admin',
};

type GroupExpandedState = Record<SettingsSectionDefinition['group'], boolean>;

const DEFAULT_EXPANDED_GROUPS: GroupExpandedState = {
  company: true,
  projects: true,
  admin: true,
};

function getInitialExpandedGroups(): GroupExpandedState {
  try {
    const raw = window.localStorage.getItem(NAV_EXPANDED_GROUPS_STORAGE_KEY);
    if (!raw) return DEFAULT_EXPANDED_GROUPS;
    const parsed = JSON.parse(raw) as Partial<GroupExpandedState>;
    return {
      company: parsed.company ?? DEFAULT_EXPANDED_GROUPS.company,
      projects: parsed.projects ?? DEFAULT_EXPANDED_GROUPS.projects,
      admin: parsed.admin ?? DEFAULT_EXPANDED_GROUPS.admin,
    };
  } catch {
    return DEFAULT_EXPANDED_GROUPS;
  }
}

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
  const [expandedGroups, setExpandedGroups] = useState<GroupExpandedState>(getInitialExpandedGroups);
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

  const groupedSections = useMemo(() => {
    const groups: Record<SettingsSectionDefinition['group'], SettingsSectionDefinition[]> = {
      company: [],
      projects: [],
      admin: [],
    };
    filteredSections.forEach((section) => {
      groups[section.group].push(section);
    });
    return GROUP_ORDER
      .map((groupKey) => ({ groupKey, label: GROUP_LABELS[groupKey], items: groups[groupKey] }))
      .filter((group) => group.items.length > 0);
  }, [filteredSections]);

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
    try {
      window.localStorage.setItem(NAV_EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(expandedGroups));
    } catch {
      // ignore persistence failures
    }
  }, [expandedGroups]);

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

  useEffect(() => {
    if (!activeSectionId) return;
    const activeSection = sections.find((section) => section.id === activeSectionId);
    if (!activeSection) return;
    setExpandedGroups((previous) => {
      if (previous[activeSection.group]) return previous;
      return { ...previous, [activeSection.group]: true };
    });
  }, [activeSectionId, sections]);

  const ActiveSection = filteredSections.find(sec => sec.id === activeSectionId)?.component;
  const isFiltering = filter.trim().length > 0;

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
          <nav aria-label="Settings sections" className="mt-4 space-y-2 overflow-auto">
            {groupedSections.map(({ groupKey, label, items }) => {
              const isExpanded = isFiltering || expandedGroups[groupKey];
              return (
                <section
                  key={groupKey}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)]/60"
                  aria-label={`${label} settings sections`}
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surfaceHover)] rounded-t-md"
                    aria-expanded={isExpanded}
                    onClick={() => {
                      if (isFiltering) return;
                      setExpandedGroups((previous) => ({
                        ...previous,
                        [groupKey]: !previous[groupKey],
                      }));
                    }}
                  >
                    <span>{label}</span>
                    <span className="text-xs text-[var(--muted)]" aria-hidden>
                      {isExpanded ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-2 pb-2 space-y-1">
                      {items.map((section) => {
                        const isActive = section.id === activeSectionId;
                        return (
                          <button
                            key={section.id}
                            aria-pressed={isActive}
                            className={clsx(
                              'w-full text-left px-3 py-2 rounded border',
                              isActive
                                ? 'bg-[var(--surfaceHover)] border-[var(--primary)] text-[var(--text)]'
                                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]',
                            )}
                            onClick={() => {
                              setSelectedId(section.id);
                              setExpandedGroups((previous) => ({
                                ...previous,
                                [section.group]: true,
                              }));
                              trackPerformanceEvent('settings.section.select', 1, 'count', { section: section.id });
                            }}
                          >
                            {section.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </nav>
        </div>
      )}
      <div className="[&_.settings-section-frame:first-child]:mt-0">
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
