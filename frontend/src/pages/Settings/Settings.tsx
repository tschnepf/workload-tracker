import React, { useMemo } from 'react';
import Loader from '@/components/ui/Loader';
import { SettingsDataProvider, useSettingsData } from './SettingsDataContext';
import { settingsSections } from './sections';
import SettingsSplitPane from './layout/SettingsSplitPane';
import Layout from '@/components/layout/Layout';
import { useMobileUiFlag } from '@/mobile/mobileFlags';

const SettingsContent: React.FC = () => {
  const { auth, capsQuery } = useSettingsData();
  const splitPaneEnabled = (import.meta.env.VITE_SETTINGS_SPLITPANE ?? 'true') !== 'false';
  const mobileSettingsEnabled = useMobileUiFlag('settings');

  const visibleSections = useMemo(() => {
    return settingsSections.filter(section => {
      if (section.requiresAdmin && !auth.user?.is_staff) return false;
      if (section.featureFlag && !section.featureFlag(capsQuery.data)) return false;
      return true;
    });
  }, [auth.user?.is_staff, capsQuery.data]);

  if (capsQuery.isLoading) {
    return (
      <Layout>
        <div
          className="p-4 sm:p-6"
          data-mobile-ui={mobileSettingsEnabled ? 'true' : 'false'}
        >
          <div className="max-w-[1800px] mx-auto">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <div className="py-10">
                <div className="max-w-md mx-auto">
                  <Loader inline message="Loading settings..." />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const sequentialView = (
    <>
      {visibleSections.length > 0 && (
        <div className="mb-4 text-sm text-[var(--muted)] flex flex-wrap gap-2">
          <span>Sections:</span>
          {visibleSections.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-[var(--text)] hover:text-[var(--text)]"
            >
              {section.title}
            </a>
          ))}
        </div>
      )}
      {visibleSections.map(({ id, component: Section }) => (
        <Section key={id} />
      ))}
    </>
  );

  const body = visibleSections.length === 0
    ? <div className="text-[var(--muted)]">No settings sections available for your role.</div>
    : splitPaneEnabled
      ? <SettingsSplitPane sections={visibleSections} />
      : sequentialView;
  return (
    <Layout>
      <div
        className="p-4 sm:p-6"
        data-mobile-ui={mobileSettingsEnabled ? 'true' : 'false'}
      >
        <div className="max-w-[1800px] mx-auto">
          <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Settings</h1>
          {body}
        </div>
      </div>
    </Layout>
  );
};

const Settings: React.FC = () => (
  <SettingsDataProvider>
    <SettingsContent />
  </SettingsDataProvider>
);

export default Settings;
