import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { getAccessToken } from '@/utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Create a typed OpenAPI client. Consumers can pass headers per call.
export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });

// Helper to include Authorization header for requests
export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Example usage (after generating schema):
// const res = await apiClient.GET('/people/', { headers: authHeaders() });
// if (res.data) { ... }

