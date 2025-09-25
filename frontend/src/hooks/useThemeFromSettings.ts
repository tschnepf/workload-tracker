import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { setMode, setColorScheme } from '@/theme/themeManager';

export function useThemeFromSettings() {
  const auth = useAuth();

  useEffect(() => {
    // Apply theme when settings change after hydration
    if (auth.hydrating) return;
    const t = (auth.settings?.theme as 'light' | 'dark' | 'system' | undefined) || undefined;
    if (t) setMode(t);
  }, [auth.hydrating, auth.settings?.theme]);

  useEffect(() => {
    if (auth.hydrating) return;
    const s = (auth.settings?.colorScheme as string | undefined) || undefined;
    if (s) setColorScheme(s);
  }, [auth.hydrating, auth.settings?.colorScheme]);
}