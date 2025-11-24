import { useEffect, useSyncExternalStore } from 'react';
import * as store from '@/store/skillsFilter';

export function useSharedSkillsFilter() {
  useEffect(() => {
    store.ensureInitialized();
  }, []);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  return {
    skills: snapshot.skills,
    setSkills: store.setSkills,
    clearSkills: store.clearSkills,
  };
}

