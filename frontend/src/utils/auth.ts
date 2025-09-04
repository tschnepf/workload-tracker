import { getState, refreshAccessToken } from '@/store/auth';

export function getAccessToken(): string | null {
  try {
    return getState().accessToken;
  } catch {
    return null;
  }
}

export { refreshAccessToken };

