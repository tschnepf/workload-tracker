import { useEffect, DependencyList } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function useAuthenticatedEffect(
  effect: () => void | (() => void),
  deps: DependencyList,
): void {
  const { accessToken } = useAuth();

  useEffect(() => {
    if (!accessToken) return;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, ...deps]);
}
