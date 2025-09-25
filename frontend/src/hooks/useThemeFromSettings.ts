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
  }, [auth.hydrating, auth.settings?.theme, auth.settings?.colorScheme]);\r\n\r\n  useEffect(() => {\r\n    if (auth.hydrating) return;\r\n    const s = (auth.settings?.colorScheme as string | undefined) || undefined;\r\n    if (s) setColorScheme(s);\r\n  }, [auth.hydrating, auth.settings?.colorScheme]);\r\n}\r\n