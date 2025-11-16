import React, { createContext, useContext } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities, type Capabilities } from '@/hooks/useCapabilities';

type SettingsDataContextValue = {
  auth: ReturnType<typeof useAuth>;
  capsQuery: ReturnType<typeof useCapabilities>;
  caps: Capabilities | undefined;
};

const SettingsDataContext = createContext<SettingsDataContextValue | undefined>(undefined);

export const SettingsDataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const auth = useAuth();
  const capsQuery = useCapabilities();

  const value: SettingsDataContextValue = {
    auth,
    capsQuery,
    caps: capsQuery.data,
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

