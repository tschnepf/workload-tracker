import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, 'src', 'pages'),
  join(ROOT, 'src', 'components'),
  join(ROOT, 'src', 'features'),
];
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'ui-hardcoded-allowlist.json');
const REPORT_MODE = process.argv.includes('--report');

const FILE_EXTS = new Set(['.ts', '.tsx', '.css']);
const EXCLUDED_RELATIVE_PATHS = new Set([
  'src/features/fullcalendar/fullcalendar-base.css',
]);

const RULES = [
  {
    id: 'hex-color',
    regex: /#[0-9a-fA-F]{3,8}\b/g,
    message: 'Raw hex color found; use semantic tokens.',
  },
  {
    id: 'inline-box-shadow',
    regex: /boxShadow\s*:\s*['"`](?!var\(--elevation-)[^'"`]+['"`]/g,
    message: 'Inline boxShadow found; use elevation tokens.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
  {
    id: 'inline-radius',
    regex: /borderRadius\s*:\s*['"`]?[0-9.]+(px|rem)?['"`]?/g,
    message: 'Inline borderRadius found; use radius tokens.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
  {
    id: 'inline-spacing',
    regex: /\b(padding|margin|gap|rowGap|columnGap)\s*:\s*['"`]?[0-9.]+(px|rem)?['"`]?/g,
    message: 'Inline spacing value found; use spacing tokens/utilities.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
  {
    id: 'tailwind-arbitrary-shadow',
    // Allow tokenized shadows, block ad hoc values.
    regex: /shadow-\[(?!var\(--elevation-)[^\]]+\]/g,
    message: 'Arbitrary shadow utility found; use elevation token class.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
  {
    id: 'tailwind-arbitrary-radius',
    // Allow tokenized radii, block ad hoc values.
    regex: /rounded-\[(?!var\(--radius-)[^\]]+\]/g,
    message: 'Arbitrary radius utility found; use radius token class.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
  {
    id: 'tailwind-arbitrary-spacing',
    // Allow tokenized spacing vars, block ad hoc values.
    regex: /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap)-\[(?!var\(--space-)[^\]]+\]/g,
    message: 'Arbitrary spacing utility found; use spacing scale tokens.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
  {
    id: 'focus-outline-none',
    regex: /focus:outline-none/g,
    message: 'focus:outline-none found without tokenized visible focus guidance.',
    fileTypes: new Set(['.ts', '.tsx']),
  },
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'mockup') continue;
      out.push(...walk(p));
      continue;
    }
    if (!FILE_EXTS.has(extname(p))) continue;
    out.push(p);
  }
  return out;
}

function lineOfIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function shouldIgnoreLine(line) {
  return line.includes('ui-hardcoded: allow');
}

function hasTokenizedVisibleFocusNearMatch(text, index) {
  const snippet = text.slice(Math.max(0, index - 220), index + 220);
  if (snippet.includes('focus-visible:ring-[var(--color-focus-ring)]')) return true;
  if (snippet.includes('focus-visible:border-[var(--color-focus-ring)]')) return true;
  if (snippet.includes('focus-visible:outline-[var(--color-focus-ring)]')) return true;
  if (snippet.includes('focus:ring-[var(--color-focus-ring)]')) return true;
  if (snippet.includes('focus:border-[var(--color-focus-ring)]')) return true;
  if (snippet.includes('focus-visible:ring-2')) return true;
  return false;
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function wildcardToRegex(pattern) {
  const escaped = pattern.split('*').map(escapeRegex).join('.*');
  return new RegExp(`^${escaped}$`);
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) {
    return [];
  }
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return entries.map((entry) => {
    const fileMatcher = entry.file
      ? (file) => file === entry.file
      : entry.filePattern
        ? (file) => wildcardToRegex(entry.filePattern).test(file)
        : () => true;
    const sampleMatcher = entry.sample
      ? (sample) => sample === entry.sample
      : entry.samplePattern
        ? (sample) => new RegExp(entry.samplePattern).test(sample)
        : () => true;
    return {
      id: String(entry.id || ''),
      rule: entry.rule ? String(entry.rule) : null,
      fileMatcher,
      sampleMatcher,
      reason: String(entry.reason || ''),
    };
  });
}

function makeStableKey(v) {
  return `${v.file}:${v.rule}:${v.sample}`;
}

const files = TARGET_DIRS.flatMap((d) => walk(d));
const allowlist = loadAllowlist();
const violations = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (EXCLUDED_RELATIVE_PATHS.has(rel)) continue;
  const ext = extname(file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const rule of RULES) {
    if (rule.fileTypes && !rule.fileTypes.has(ext)) continue;
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      const line = lineOfIndex(text, m.index);
      const lineText = lines[line - 1] || '';
      if (shouldIgnoreLine(lineText)) continue;

      if (rule.id === 'focus-outline-none' && hasTokenizedVisibleFocusNearMatch(text, m.index)) {
        continue;
      }

      violations.push({
        key: makeStableKey({ file: rel, rule: rule.id, sample: m[0] }),
        file: rel,
        line,
        rule: rule.id,
        sample: m[0],
        message: rule.message,
      });
    }
  }
}

violations.sort((a, b) => a.key.localeCompare(b.key));

const nonAllowlisted = violations.filter((v) => {
  return !allowlist.some((entry) => {
    if (entry.rule && entry.rule !== v.rule) return false;
    if (!entry.fileMatcher(v.file)) return false;
    if (!entry.sampleMatcher(v.sample)) return false;
    return true;
  });
});

if (REPORT_MODE) {
  console.log(`UI hardcoded report: ${violations.length} total, ${nonAllowlisted.length} non-allowlisted.`);
  for (const v of violations.slice(0, 500)) {
    const allowed = nonAllowlisted.find((n) => n.key === v.key) ? 'BLOCK' : 'ALLOW';
    console.log(`${allowed} ${v.file}:${v.line} [${v.rule}] ${v.sample}`);
  }
}

if (nonAllowlisted.length > 0) {
  console.error(`UI hardcoded check failed: ${nonAllowlisted.length} non-allowlisted violation(s).`);
  for (const v of nonAllowlisted.slice(0, 300)) {
    console.error(` - ${v.file}:${v.line} [${v.rule}] ${v.sample}`);
  }
  if (nonAllowlisted.length > 300) {
    console.error(` ... and ${nonAllowlisted.length - 300} more`);
  }
  process.exit(1);
}

console.log(`UI hardcoded check passed (${violations.length} findings, all allowlisted or compliant).`);
