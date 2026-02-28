#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BUDGETS = 'tests/perf/api-call-budgets.json';
const DEFAULT_ACTUAL = 'tests/perf/latest.json';

function parseArgs(argv) {
  const out = {
    budgets: DEFAULT_BUDGETS,
    actual: DEFAULT_ACTUAL,
    allowModeMismatch: false,
  };
  for (const arg of argv) {
    if (arg === '--allow-mode-mismatch') {
      out.allowModeMismatch = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq >= 0 ? arg.slice(eq + 1) : '';
    if (key === 'budgets' && value) out.budgets = value;
    if (key === 'actual' && value) out.actual = value;
  }
  return out;
}

function readJsonOrDie(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`missing file: ${abs}`);
  }
  return {
    abs,
    data: JSON.parse(fs.readFileSync(abs, 'utf8')),
  };
}

function readBudgetValue(entry) {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (!entry || typeof entry !== 'object') return null;
  const v = entry.budget ?? entry.goal ?? entry.target;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readActualValue(entry) {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (!entry || typeof entry !== 'object') return null;
  const v = entry.totalApiCalls ?? entry.totalCalls ?? entry.calls;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pad(text, width) {
  const s = String(text);
  if (s.length >= width) return s;
  return `${s}${' '.repeat(width - s.length)}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const budgets = readJsonOrDie(args.budgets);
  const actual = readJsonOrDie(args.actual);

  const budgetRoutes = budgets.data?.routes;
  const actualRoutes = actual.data?.routes;
  if (!budgetRoutes || typeof budgetRoutes !== 'object') {
    throw new Error(`invalid budgets routes object in ${budgets.abs}`);
  }
  if (!actualRoutes || typeof actualRoutes !== 'object') {
    throw new Error(`invalid actual routes object in ${actual.abs}`);
  }

  const expectedMode = budgets.data?.metadata?.measurementMode || null;
  const actualMode = actual.data?.metadata?.measurementMode || null;
  const violations = [];

  if (expectedMode && actualMode && expectedMode !== actualMode && !args.allowModeMismatch) {
    violations.push(`measurement mode mismatch: expected "${expectedMode}" but got "${actualMode}"`);
  }

  const rows = [];
  for (const route of Object.keys(budgetRoutes)) {
    const budget = readBudgetValue(budgetRoutes[route]);
    if (budget == null) {
      violations.push(`${route}: missing numeric budget value`);
      continue;
    }
    const actualValue = readActualValue(actualRoutes[route]);
    if (actualValue == null) {
      violations.push(`${route}: missing actual route data`);
      rows.push({ route, budget, actual: 'missing', delta: 'n/a', pass: 'FAIL' });
      continue;
    }
    const delta = actualValue - budget;
    const pass = delta <= 0 ? 'PASS' : 'FAIL';
    rows.push({ route, budget, actual: actualValue, delta, pass });
    if (delta > 0) {
      violations.push(`${route}: over budget by ${delta} call(s) (actual=${actualValue}, budget=${budget})`);
    }
    if (actualRoutes[route]?.timedOutWaitingForIdle) {
      violations.push(`${route}: probe timed out waiting for idle`);
    }
    if (actualRoutes[route]?.endedOnLogin) {
      violations.push(`${route}: ended on login page (not authenticated)`);
    }
  }

  process.stdout.write(
    `${pad('Route', 34)} ${pad('Budget', 7)} ${pad('Actual', 7)} ${pad('Delta', 7)} Result\n`
  );
  process.stdout.write(`${'-'.repeat(34)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(7)} ------\n`);
  for (const row of rows) {
    process.stdout.write(
      `${pad(row.route, 34)} ${pad(row.budget, 7)} ${pad(row.actual, 7)} ${pad(row.delta, 7)} ${row.pass}\n`
    );
  }

  if (violations.length > 0) {
    process.stderr.write('\n[assert-api-call-budgets] violations:\n');
    for (const violation of violations) {
      process.stderr.write(` - ${violation}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('\n[assert-api-call-budgets] all routes are within budget.\n');
}

main();
