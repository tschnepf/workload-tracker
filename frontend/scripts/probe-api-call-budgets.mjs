#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const DEFAULT_BUDGETS_PATH = 'tests/perf/api-call-budgets.json';
const DEFAULT_OUTPUT_PATH = 'tests/perf/latest.json';

const FALLBACK_ROUTES = [
  '/my-work',
  '/dashboard',
  '/people',
  '/projects',
  '/assignments',
  '/project-assignments',
  '/departments',
  '/departments/manager',
  '/departments/hierarchy',
  '/departments/reports',
  '/deliverables/calendar',
  '/deliverables/dashboard',
  '/settings',
  '/skills',
  '/performance',
  '/reports/role-capacity',
  '/reports/forecast',
  '/reports/person-experience',
];

function parseArgs(argv) {
  const out = {
    mode: 'production',
    output: DEFAULT_OUTPUT_PATH,
    budgets: DEFAULT_BUDGETS_PATH,
    baseUrl: DEFAULT_BASE_URL,
    username: process.env.PW_USERNAME || 'admin',
    password: process.env.PW_PASSWORD || 'admin123',
    headless: true,
    maxRouteSeconds: 40,
    idleMs: 900,
    minObserveMs: 2500,
    interRouteDelayMs: 1500,
    refresh429BackoffMs: 35000,
  };
  for (const arg of argv) {
    if (arg === '--headful') {
      out.headless = false;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq >= 0 ? arg.slice(eq + 1) : '';
    if (key === 'mode' && value) out.mode = value;
    if (key === 'output' && value) out.output = value;
    if (key === 'budgets' && value) out.budgets = value;
    if (key === 'base-url' && value) out.baseUrl = value;
    if (key === 'username' && value) out.username = value;
    if (key === 'password' && value) out.password = value;
    if (key === 'max-route-seconds' && value) out.maxRouteSeconds = Number(value) || out.maxRouteSeconds;
    if (key === 'idle-ms' && value) out.idleMs = Number(value) || out.idleMs;
    if (key === 'min-observe-ms' && value) out.minObserveMs = Number(value) || out.minObserveMs;
    if (key === 'inter-route-delay-ms' && value) out.interRouteDelayMs = Number(value) || out.interRouteDelayMs;
    if (key === 'refresh-429-backoff-ms' && value) out.refresh429BackoffMs = Number(value) || out.refresh429BackoffMs;
  }
  return out;
}

function toMeasurementMode(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'production' || normalized === 'production-build') return 'production-build';
  if (normalized === 'development' || normalized === 'dev' || normalized === 'dev-strictmode') return 'dev-strictmode';
  return normalized || 'production-build';
}

function loadRoutesFromBudgets(cwd, budgetsPath) {
  const abs = path.resolve(cwd, budgetsPath);
  if (!fs.existsSync(abs)) return FALLBACK_ROUTES;
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (raw && raw.routes && typeof raw.routes === 'object') {
      const keys = Object.keys(raw.routes);
      if (keys.length > 0) return keys;
    }
  } catch (err) {
    console.warn(`[probe-api-call-budgets] unable to parse budgets at ${abs}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return FALLBACK_ROUTES;
}

function isApiRequest(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/api/');
  } catch {
    return url.includes('/api/');
  }
}

function isFetchLike(request) {
  const t = request.resourceType();
  return t === 'fetch' || t === 'xhr';
}

function normalizePath(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function summarizeEndpointCounts(calls) {
  const counts = new Map();
  for (const call of calls) {
    const key = `${call.method} ${call.path}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([endpoint, count]) => ({ endpoint, count }));
}

class ApiCallTracker {
  constructor(idleMs, minObserveMs) {
    this.idleMs = idleMs;
    this.minObserveMs = minObserveMs;
    this.reset();
  }

  reset() {
    this.pending = 0;
    this.calls = [];
    this.startedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.requestMeta = new Map();
  }

  attach(page) {
    page.on('request', (request) => {
      if (!isFetchLike(request) || !isApiRequest(request.url())) return;
      const startedAt = Date.now();
      this.pending += 1;
      this.lastActivityAt = startedAt;
      this.requestMeta.set(request, {
        startedAt,
        method: request.method(),
        path: normalizePath(request.url()),
        type: request.resourceType(),
      });
    });

    page.on('response', (response) => {
      const request = response.request();
      if (!isFetchLike(request) || !isApiRequest(request.url())) return;
      const now = Date.now();
      const meta = this.requestMeta.get(request) || {
        startedAt: now,
        method: request.method(),
        path: normalizePath(request.url()),
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
      if (!isFetchLike(request) || !isApiRequest(request.url())) return;
      const now = Date.now();
      const meta = this.requestMeta.get(request) || {
        startedAt: now,
        method: request.method(),
        path: normalizePath(request.url()),
        type: request.resourceType(),
      };
      const failure = request.failure();
      this.calls.push({
        method: meta.method,
        path: meta.path,
        type: meta.type,
        status: null,
        ok: false,
        failureText: failure?.errorText || 'request failed',
        durationMs: Math.max(0, now - meta.startedAt),
      });
      this.requestMeta.delete(request);
      this.pending = Math.max(0, this.pending - 1);
      this.lastActivityAt = now;
    });
  }

  async waitForIdle(maxWaitMs) {
    const start = Date.now();
    while (true) {
      const now = Date.now();
      const observeFor = now - this.startedAt;
      const idleFor = now - this.lastActivityAt;
      if (observeFor >= this.minObserveMs && this.pending === 0 && idleFor >= this.idleMs) return true;
      if (now - start >= maxWaitMs) return false;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function uiLogin(page, username, password) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="text"], input[type="email"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await Promise.all([
    page.getByRole('button', { name: /sign in|login/i }).first().click(),
    page.waitForLoadState('domcontentloaded').catch(() => {}),
  ]);

  const movedOffLogin = await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (!movedOffLogin) {
    const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 500);
    throw new Error(`login failed or did not redirect from /login. body excerpt: ${bodyText}`);
  }
}

async function probeRoute(context, route, maxWaitMs, idleMs, minObserveMs) {
  const page = await context.newPage();
  const tracker = new ApiCallTracker(idleMs, minObserveMs);
  tracker.attach(page);

  const startedAt = Date.now();
  let gotoError = null;
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: maxWaitMs });
  } catch (err) {
    gotoError = err instanceof Error ? err.message : String(err);
  }

  const endedOnLogin = new URL(page.url()).pathname.startsWith('/login');
  const idleReached = await tracker.waitForIdle(maxWaitMs);
  const finishedAt = Date.now();

  const calls = tracker.calls;
  const result = {
    route,
    totalApiCalls: calls.length,
    uniqueApiEndpoints: new Set(calls.map((c) => `${c.method} ${c.path}`)).size,
    failedApiCalls: calls.filter((c) => c.ok === false).length,
    durationMs: finishedAt - startedAt,
    timedOutWaitingForIdle: !idleReached,
    endedOnLogin,
    gotoError,
    endpointCounts: summarizeEndpointCounts(calls),
    calls,
  };

  await page.close();
  return result;
}

function hasRefresh429(routeResult) {
  return (routeResult.calls || []).some(
    (call) => call.path === '/api/token/refresh/' && call.status === 429
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const measurementMode = toMeasurementMode(args.mode);
  const routes = loadRoutesFromBudgets(process.cwd(), args.budgets);
  const outputAbs = path.resolve(process.cwd(), args.output);
  fs.mkdirSync(path.dirname(outputAbs), { recursive: true });

  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({
    baseURL: args.baseUrl,
    ignoreHTTPSErrors: true,
  });

  try {
    const loginPage = await context.newPage();
    await uiLogin(loginPage, args.username, args.password);
    await loginPage.close();

    const maxWaitMs = Math.max(5_000, Math.floor(args.maxRouteSeconds * 1000));
    const routeResults = {};
    for (const route of routes) {
      process.stdout.write(`[probe-api-call-budgets] probing ${route}\n`);
      let routeResult = await probeRoute(context, route, maxWaitMs, args.idleMs, args.minObserveMs);
      if (hasRefresh429(routeResult)) {
        process.stdout.write(
          `[probe-api-call-budgets] ${route} hit refresh 429; backing off ${args.refresh429BackoffMs}ms and retrying once\n`
        );
        await new Promise((resolve) => setTimeout(resolve, args.refresh429BackoffMs));
        routeResult = await probeRoute(context, route, maxWaitMs, args.idleMs, args.minObserveMs);
      }
      routeResults[route] = routeResult;
      if (args.interRouteDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, args.interRouteDelayMs));
      }
    }

    const totals = {
      routesProbed: routes.length,
      apiCalls: Object.values(routeResults).reduce((sum, routeData) => sum + routeData.totalApiCalls, 0),
      failedApiCalls: Object.values(routeResults).reduce((sum, routeData) => sum + routeData.failedApiCalls, 0),
      routesTimedOutWaitingForIdle: Object.values(routeResults).filter((routeData) => routeData.timedOutWaitingForIdle).length,
      routesEndedOnLogin: Object.values(routeResults).filter((routeData) => routeData.endedOnLogin).length,
    };

    const payload = {
      metadata: {
        generatedAt: new Date().toISOString(),
        measurementMode,
        baseUrl: args.baseUrl,
        routeCount: routes.length,
        maxRouteSeconds: args.maxRouteSeconds,
        idleMs: args.idleMs,
        minObserveMs: args.minObserveMs,
        interRouteDelayMs: args.interRouteDelayMs,
      },
      routes: routeResults,
      totals,
    };

    fs.writeFileSync(outputAbs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`[probe-api-call-budgets] wrote ${outputAbs}\n`);
    process.stdout.write(`[probe-api-call-budgets] totals apiCalls=${totals.apiCalls} failed=${totals.failedApiCalls}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`[probe-api-call-budgets] failed: ${msg}\n`);
  process.exit(1);
});
