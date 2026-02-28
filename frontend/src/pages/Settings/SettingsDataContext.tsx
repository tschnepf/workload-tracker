import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities, type Capabilities } from '@/hooks/useCapabilities';
import { getFlag } from '@/lib/flags';
import { useUiSettingsPageSnapshot } from '@/hooks/useUiPageSnapshots';

type SettingsDataContextValue = {
  auth: ReturnType<typeof useAuth>;
  capsQuery: ReturnType<typeof useCapabilities>;
  caps: Capabilities | undefined;
  settingsShellQuery: ReturnType<typeof useUiSettingsPageSnapshot>;
  visibleSectionIds?: string[];
  visibleSectionMeta?: Array<{ id: string; title: string }>;
};

const SettingsDataContext = createContext<SettingsDataContextValue | undefined>(undefined);

export const SettingsDataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const auth = useAuth();
  const snapshotsEnabled = getFlag('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', true);
  const [snapshotFallbackEnabled, setSnapshotFallbackEnabled] = useState(false);
  const settingsShellQuery = useUiSettingsPageSnapshot({
    enabled: snapshotsEnabled && !snapshotFallbackEnabled,
  });

  useEffect(() => {
    if (!snapshotsEnabled) return;
    if (!settingsShellQuery.isError) return;
    setSnapshotFallbackEnabled(true);
  }, [settingsShellQuery.isError, snapshotsEnabled]);

  const capsQuery = useCapabilities({
    enabled: !snapshotsEnabled || snapshotFallbackEnabled,
  });
  const caps = settingsShellQuery.data?.capabilities ?? capsQuery.data;

  const value: SettingsDataContextValue = {
    auth,
    capsQuery,
    caps,
    settingsShellQuery,
    visibleSectionIds: settingsShellQuery.data?.visibleSections,
    visibleSectionMeta: settingsShellQuery.data?.visibleSectionMeta,
  };

  return (
    <SettingsDataContext.Provider value={value}>
      {children}
    </SettingsDataContext.Provider>
  );
};

export function useSettingsData(): SettingsDataContextValue {
  const ctx = useContext(SettingsDataContext);
  if (!ctx) {
    throw new Error('useSettingsData must be used within SettingsDataProvider');
  }
  return ctx;
}
