export type ApiCacheEntry<T> = { promise: Promise<T>; timestamp: number; data?: T };

const inflightRequests = new Map<string, ApiCacheEntry<any>>();
const responseCache = new Map<string, ApiCacheEntry<any>>();

export function readApiCachedData<T>(key: string, ttlMs: number, now = Date.now()): T | undefined {
  const cached = responseCache.get(key);
  if (!cached || cached.data === undefined) return undefined;
  if ((now - cached.timestamp) >= ttlMs) return undefined;
  return cached.data as T;
}

export function readApiInflightPromise<T>(key: string): Promise<T> | undefined {
  const inflight = inflightRequests.get(key);
  if (!inflight) return undefined;
  return inflight.promise as Promise<T>;
}

export function writeApiInflightPromise<T>(key: string, promise: Promise<T>, timestamp: number): void {
  inflightRequests.set(key, { promise, timestamp });
}

export function writeApiCachedData<T>(key: string, promise: Promise<T>, data: T, timestamp: number): void {
  responseCache.set(key, { promise, timestamp, data });
}

export function clearApiInflightPromise(key: string): void {
  inflightRequests.delete(key);
}

export function clearApiMemoryCaches(predicate?: (key: string) => boolean): void {
  if (!predicate) {
    responseCache.clear();
    inflightRequests.clear();
    return;
  }
  const cachedKeys = Array.from(responseCache.keys());
  for (const key of cachedKeys) {
    if (predicate(key)) responseCache.delete(key);
  }
  const inflightKeys = Array.from(inflightRequests.keys());
  for (const key of inflightKeys) {
    if (predicate(key)) inflightRequests.delete(key);
  }
}
