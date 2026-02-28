import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

type BudgetEntry = {
  baseline?: number;
  budget?: number;
  transitionBudget?: number;
};

type BudgetsFile = {
  metadata?: {
    measurementMode?: string;
    baselineCapturedAt?: string;
    updatedAt?: string;
    source?: string;
  };
  routes: Record<string, BudgetEntry | number>;
};

type ApiCall = {
  method: string;
  path: string;
  type: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  failureText?: string;
};

type RouteProbeResult = {
  route: string;
  totalApiCalls: number;
  uniqueApiEndpoints: number;
  failedApiCalls: number;
  durationMs: number;
  timedOutWaitingForIdle: boolean;
  endedOnLogin: boolean;
  endpointCounts: Array<{ endpoint: string; count: number }>;
  calls: ApiCall[];
};

const RUN_GATE = process.env.API_CALL_BUDGET_GATE === 'true';
const MEASUREMENT_MODE = process.env.API_CALL_BUDGET_MODE || 'production-build';
const BUDGETS_PATH = process.env.API_CALL_BUDGETS_FILE || 'tests/perf/api-call-budgets.json';
const OUTPUT_PREFIX = process.env.API_CALL_BUDGET_OUTPUT_PREFIX || 'tests/perf/playwright';

const MAX_ROUTE_WAIT_MS = Number(process.env.API_CALL_BUDGET_MAX_ROUTE_MS || 45_000);
const MIN_OBSERVE_MS = Number(process.env.API_CALL_BUDGET_MIN_OBSERVE_MS || 2_500);
const IDLE_MS = Number(process.env.API_CALL_BUDGET_IDLE_MS || 900);
const INTER_ROUTE_DELAY_MS = Number(process.env.API_CALL_BUDGET_INTER_ROUTE_DELAY_MS || 1_500);
const REFRESH_429_BACKOFF_MS = Number(process.env.API_CALL_BUDGET_REFRESH_429_BACKOFF_MS || 35_000);

function normalizePathname(input: string): string {
  const value = input.trim();
  if (!value) return '/';
  if (value === '/') return '/';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function loginForBudgetProbe(page: Page): Promise<void> {
  const username = process.env.PW_USERNAME || 'admin';
  const password = process.env.PW_PASSWORD || 'admin123';
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: MAX_ROUTE_WAIT_MS });
  await page.locator('input[type="text"], input[type="email"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await Promise.all([
    page.getByRole('button', { name: /sign in|login/i }).first().click(),
    page.waitForLoadState('domcontentloaded').catch(() => {}),
  ]);
  await page.waitForURL((u) => normalizePathname(u.pathname) !== '/login', { timeout: 20_000 });
}

function normalizeRoutePath(urlOrPath: string): string {
  try {
    const parsed = new URL(urlOrPath);
    return normalizePathname(parsed.pathname);
  } catch {
    return normalizePathname(urlOrPath);
  }
}

function toApiPath(urlOrPath: string): string {
  try {
    const parsed = new URL(urlOrPath);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return urlOrPath;
  }
}

function isApiRequest(url: string): boolean {
  return toApiPath(url).startsWith('/api/');
}

function isFetchLike(resourceType: string): boolean {
  return resourceType === 'fetch' || resourceType === 'xhr';
}

function summarizeEndpointCounts(calls: ApiCall[]): Array<{ endpoint: string; count: number }> {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const key = `${call.method} ${call.path}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([endpoint, count]) => ({ endpoint, count }));
}

class ApiCallTracker {
  private readonly idleMs: number;
  private readonly minObserveMs: number;
  private pending = 0;
  private startedAt = Date.now();
  private lastActivityAt = Date.now();
  private calls: ApiCall[] = [];
  private requestMeta = new WeakMap<any, { startedAt: number; method: string; path: string; type: string }>();

  constructor(idleMs: number, minObserveMs: number) {
    this.idleMs = idleMs;
    this.minObserveMs = minObserveMs;
  }

  attach(page: Page): void {
    page.on('request', (request) => {
      if (!isFetchLike(request.resourceType()) || !isApiRequest(request.url())) return;
      const startedAt = Date.now();
      this.pending += 1;
      this.lastActivityAt = startedAt;
      this.requestMeta.set(request, {
        startedAt,
        method: request.method(),
        path: toApiPath(request.url()),
        type: request.resourceType(),
      });
    });

    page.on('response', (response) => {
      const request = response.request();
      if (!isFetchLike(request.resourceType()) || !isApiRequest(request.url())) return;
      const now = Date.now();
      const meta = this.requestMeta.get(request) || {
        startedAt: now,
        method: request.method(),
        path: toApiPath(request.url()),
        type: request.resourceType(),
      };
      this.calls.push({
        method: meta.method,
        path: meta.path,
        type: meta.type,
        status: response.status(),
        ok: response.ok(),
        durationMs: Math.max(0, now - meta.startedAt),
      });
      this.requestMeta.delete(request);
      this.pending = Math.max(0, this.pending - 1);
      this.lastActivityAt = now;
    });

    page.on('requestfailed', (request) => {
      if (!isFetchLike(request.resourceType()) || !isApiRequest(request.url())) return;
      const now = Date.now();
      const meta = this.requestMeta.get(request) || {
        startedAt: now,
        method: request.method(),
        path: toApiPath(request.url()),
        type: request.resourceType(),
      };
      this.calls.push({
        method: meta.method,
        path: meta.path,
        type: meta.type,
        status: null,
        ok: false,
        failureText: request.failure()?.errorText || 'request failed',
        durationMs: Math.max(0, now - meta.startedAt),
      });
      this.requestMeta.delete(request);
      this.pending = Math.max(0, this.pending - 1);
      this.lastActivityAt = now;
    });
  }

  reset(): void {
    this.pending = 0;
    this.startedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.calls = [];
    this.requestMeta = new WeakMap();
  }

  getCalls(): ApiCall[] {
    return [...this.calls];
  }

  async waitForIdle(maxWaitMs: number): Promise<boolean> {
    const start = Date.now();
    while (true) {
      const now = Date.now();
      const observedFor = now - this.startedAt;
      const idleFor = now - this.lastActivityAt;
      if (observedFor >= this.minObserveMs && this.pending === 0 && idleFor >= this.idleMs) return true;
      if (now - start >= maxWaitMs) return false;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function routeBudgetValue(entry: BudgetEntry | number | undefined, kind: 'fresh' | 'transition'): number | null {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (!entry || typeof entry !== 'object') return null;
  if (kind === 'transition' && Number.isFinite(entry.transitionBudget)) return Number(entry.transitionBudget);
  if (Number.isFinite(entry.budget)) return Number(entry.budget);
  return null;
}

function parseBudgetsFile(): { path: string; data: BudgetsFile; routes: string[] } {
  const absPath = path.resolve(process.cwd(), BUDGETS_PATH);
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8')) as BudgetsFile;
  if (!raw.routes || typeof raw.routes !== 'object') {
    throw new Error(`Invalid budgets file at ${absPath}: missing routes map`);
  }

  const requestedRoutesRaw = process.env.API_CALL_BUDGET_ROUTES;
  const requested = requestedRoutesRaw
    ? requestedRoutesRaw.split(',').map((r) => r.trim()).filter(Boolean)
    : null;

  const routes = requested && requested.length > 0 ? requested : Object.keys(raw.routes);
  return { path: absPath, data: raw, routes };
}

function hasRefresh429(result: RouteProbeResult): boolean {
  return result.calls.some((c) => c.path === '/api/token/refresh/' && c.status === 429);
}

async function waitForRoutePath(page: Page, route: string): Promise<void> {
  const expected = normalizeRoutePath(route);
  await page.waitForURL(
    (u) => normalizePathname(u.pathname) === expected,
    { timeout: Math.min(MAX_ROUTE_WAIT_MS, 20_000) }
  );
}

async function measureRoute(
  page: Page,
  tracker: ApiCallTracker,
  route: string,
  navigate: () => Promise<void>
): Promise<RouteProbeResult> {
  const startedAt = Date.now();
  tracker.reset();
  await navigate();
  await waitForRoutePath(page, route);
  const idleReached = await tracker.waitForIdle(MAX_ROUTE_WAIT_MS);
  const endedOnLogin = normalizeRoutePath(page.url()) === '/login';
  const calls = tracker.getCalls();
  return {
    route,
    totalApiCalls: calls.length,
    uniqueApiEndpoints: new Set(calls.map((c) => `${c.method} ${c.path}`)).size,
    failedApiCalls: calls.filter((c) => !c.ok).length,
    durationMs: Date.now() - startedAt,
    timedOutWaitingForIdle: !idleReached,
    endedOnLogin,
    endpointCounts: summarizeEndpointCounts(calls),
    calls,
  };
}

async function measureFreshRoute(page: Page, tracker: ApiCallTracker, route: string): Promise<RouteProbeResult> {
  return measureRoute(page, tracker, route, async () => {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: MAX_ROUTE_WAIT_MS });
  });
}

async function measureTransitionRoute(page: Page, tracker: ApiCallTracker, route: string): Promise<RouteProbeResult> {
  return measureRoute(page, tracker, route, async () => {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: MAX_ROUTE_WAIT_MS });
  });
}

async function measureWithRefreshRetry(
  page: Page,
  tracker: ApiCallTracker,
  route: string,
  mode: 'fresh' | 'transition'
): Promise<RouteProbeResult> {
  const probeFn = mode === 'fresh' ? measureFreshRoute : measureTransitionRoute;
  let result = await probeFn(page, tracker, route);
  if (hasRefresh429(result)) {
    await page.waitForTimeout(REFRESH_429_BACKOFF_MS);
    result = await probeFn(page, tracker, route);
  }
  return result;
}

function ensureOutputDir(): void {
  const outputFile = path.resolve(process.cwd(), `${OUTPUT_PREFIX}.tmp`);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
}

function writeProbeOutput(kind: 'fresh' | 'transition', routeResults: Record<string, RouteProbeResult>): void {
  ensureOutputDir();
  const outputPath = path.resolve(process.cwd(), `${OUTPUT_PREFIX}.${kind}.json`);
  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      measurementMode: MEASUREMENT_MODE,
      kind,
      budgetsPath: BUDGETS_PATH,
      maxRouteWaitMs: MAX_ROUTE_WAIT_MS,
      minObserveMs: MIN_OBSERVE_MS,
      idleMs: IDLE_MS,
      interRouteDelayMs: INTER_ROUTE_DELAY_MS,
    },
    routes: routeResults,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function collectViolations(
  kind: 'fresh' | 'transition',
  budgets: BudgetsFile,
  routeResults: Record<string, RouteProbeResult>
): string[] {
  const violations: string[] = [];
  for (const [route, result] of Object.entries(routeResults)) {
    const budget = routeBudgetValue(budgets.routes[route], kind);
    if (budget == null) {
      violations.push(`${route}: missing ${kind} budget value`);
      continue;
    }
    if (result.totalApiCalls > budget) {
      violations.push(
        `${route}: ${kind} over budget by ${result.totalApiCalls - budget} (actual=${result.totalApiCalls}, budget=${budget})`
      );
    }
    if (result.timedOutWaitingForIdle) violations.push(`${route}: ${kind} probe timed out waiting for idle`);
    if (result.endedOnLogin) violations.push(`${route}: ${kind} ended on /login`);
    if (result.failedApiCalls > 0) violations.push(`${route}: ${kind} has ${result.failedApiCalls} failed API call(s)`);
  }
  return violations;
}

test.describe('API Call Budgets', () => {
  test.setTimeout(20 * 60 * 1000);

  test.skip(!RUN_GATE, 'API call budget gate disabled; set API_CALL_BUDGET_GATE=true to enable');
  test.skip(MEASUREMENT_MODE !== 'production-build', 'Budget gate only enforces in production-build mode');

  const parsed = parseBudgetsFile();
  const budgets = parsed.data;
  const routes = parsed.routes;

  test('fresh page-load API calls stay within budgets', async ({ page }) => {
    await loginForBudgetProbe(page);
    const context = page.context();

    const routeResults: Record<string, RouteProbeResult> = {};
    for (const route of routes) {
      const routePage = await context.newPage();
      const tracker = new ApiCallTracker(IDLE_MS, MIN_OBSERVE_MS);
      tracker.attach(routePage);
      routeResults[route] = await measureWithRefreshRetry(routePage, tracker, route, 'fresh');
      if (INTER_ROUTE_DELAY_MS > 0) await routePage.waitForTimeout(INTER_ROUTE_DELAY_MS);
      await routePage.close();
    }

    writeProbeOutput('fresh', routeResults);
    const violations = collectViolations('fresh', budgets, routeResults);
    expect(violations, `Fresh-load API budget violations:\n${violations.join('\n')}`).toEqual([]);
  });

  test('in-app route transition API calls stay within budgets', async ({ page }) => {
    await loginForBudgetProbe(page);
    const initialRoute = routes[0] || '/dashboard';
    await page.goto(initialRoute, { waitUntil: 'domcontentloaded' });
    const tracker = new ApiCallTracker(IDLE_MS, MIN_OBSERVE_MS);
    tracker.attach(page);

    const routeResults: Record<string, RouteProbeResult> = {};
    for (const route of routes) {
      routeResults[route] = await measureWithRefreshRetry(page, tracker, route, 'transition');
      if (INTER_ROUTE_DELAY_MS > 0) await page.waitForTimeout(INTER_ROUTE_DELAY_MS);
    }

    writeProbeOutput('transition', routeResults);
    const violations = collectViolations('transition', budgets, routeResults);
    expect(violations, `Route-transition API budget violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
