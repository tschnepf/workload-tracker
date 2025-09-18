import { getState, refreshAccessToken, waitForAuthReady } from '@/store/auth';

export function getAccessToken(): string | null {
  try {
    return getState().accessToken;
  } catch {
    return null;
  }
}

export { refreshAccessToken, waitForAuthReady };



