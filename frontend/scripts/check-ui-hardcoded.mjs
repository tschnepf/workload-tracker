import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, 'src', 'pages'),
  join(ROOT, 'src', 'components'),
];
const BASELINE_PATH = join(ROOT, 'scripts', 'ui-hardcoded-baseline.json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const FILE_EXTS = new Set(['.ts', '.tsx', '.css']);

const RULES = [
  {
    id: 'hex-color',
    regex: /#[0-9a-fA-F]{3,8}\b/g,
    message: 'Raw hex color found; use semantic tokens.',
  },
  {
    id: 'inline-box-shadow',
    regex: /boxShadow\s*:\s*['"`][^'"`]+['"`]/g,
    message: 'Inline boxShadow found; use elevation tokens.',
  },
  {
    id: 'inline-radius',
    regex: /borderRadius\s*:\s*['"`]?[0-9.]+(px|rem)?['"`]?/g,
    message: 'Inline borderRadius found; use radius tokens.',
  },
  {
    id: 'inline-spacing',
    regex: /\b(padding|margin|gap|rowGap|columnGap)\s*:\s*['"`]?[0-9.]+(px|rem)?['"`]?/g,
    message: 'Inline spacing value found; use spacing tokens/utilities.',
  },
  {
    id: 'tailwind-arbitrary-shadow',
    regex: /shadow-\[[^\]]+\]/g,
    message: 'Arbitrary shadow utility found; use elevation token class.',
  },
  {
    id: 'tailwind-arbitrary-radius',
    regex: /rounded-\[[^\]]+\]/g,
    message: 'Arbitrary radius utility found; use radius token class.',
  },
  {
    id: 'tailwind-arbitrary-spacing',
    regex: /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap)-\[[^\]]+\]/g,
    message: 'Arbitrary spacing utility found; use spacing scale tokens.',
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

const files = TARGET_DIRS.flatMap((d) => walk(d));
const violations = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const rule of RULES) {
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      const line = lineOfIndex(text, m.index);
      const lineText = lines[line - 1] || '';
      if (shouldIgnoreLine(lineText)) continue;
      violations.push({
        key: `${rel}:${line}:${rule.id}:${m[0]}`,
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

if (UPDATE_BASELINE) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), entries: violations.map((v) => v.key) }, null, 2) + '\n');
  console.log(`Updated baseline with ${violations.length} entries: scripts/ui-hardcoded-baseline.json`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('Missing scripts/ui-hardcoded-baseline.json. Run: node scripts/check-ui-hardcoded.mjs --update-baseline');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baselineSet = new Set(Array.isArray(baseline.entries) ? baseline.entries : []);
const newViolations = violations.filter((v) => !baselineSet.has(v.key));

if (newViolations.length > 0) {
  console.error(`UI hardcoded check failed: ${newViolations.length} new violation(s).`);
  for (const v of newViolations.slice(0, 200)) {
    console.error(` - ${v.file}:${v.line} [${v.rule}] ${v.sample}`);
  }
  if (newViolations.length > 200) {
    console.error(` ... and ${newViolations.length - 200} more`);
  }
  process.exit(1);
}

console.log(`UI hardcoded check passed (${violations.length} tracked baseline violations, 0 new).`);
