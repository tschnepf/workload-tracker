export function friendlyErrorMessage(status: number, data: any, fallback: string): string {
  const detail = typeof data === 'object' && data ? (data.detail || (data as any).message || (data as any).error) : null;
  const nonField = Array.isArray((data as any)?.non_field_errors) ? (data as any).non_field_errors[0] : null;
  const firstFieldError = (() => {
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data as any)) {
        if (k === 'detail' || k === 'message' || k === 'non_field_errors') continue;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0] as string;
      }
    }
    return null;
  })();
  switch (status) {
    case 0:
      return 'Network error - unable to reach the server.';
    case 400:
      return nonField || firstFieldError || detail || 'Please check the form for errors and try again.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'We could not find what you were looking for.';
    case 409:
      return 'A conflict occurred. Please refresh and try again.';
    case 412:
      return 'This record changed since you loaded it. Refresh and retry.';
    case 413:
      return 'The request is too large. Try narrowing your selection.';
    case 429:
      return 'Too many requests. Please slow down and try again soon.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Something went wrong on our side. Please try again.';
    default:
      return detail || fallback;
  }
}

