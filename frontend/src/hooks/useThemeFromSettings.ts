import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

function applyTheme(theme: 'light' | 'dark' | 'system' | undefined) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldDark = theme === 'dark' || (theme === 'system' && prefersDark);
  if (shouldDark) root.classList.add('dark');
  else root.classList.remove('dark');
}

export function useThemeFromSettings() {
  const auth = useAuth();
  useEffect(() => {
    // Apply theme when settings change after hydration
    if (auth.hydrating) return;
    const t = (auth.settings?.theme as 'light' | 'dark' | 'system' | undefined) || undefined;
    applyTheme(t);
  }, [auth.hydrating, auth.settings?.theme]);
}

