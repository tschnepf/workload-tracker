import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, 'src', 'pages'),
  join(ROOT, 'src', 'components'),
  join(ROOT, 'src', 'App.tsx'),
  join(ROOT, 'src', 'index.css'),
];

const FILE_EXTS = new Set(['.ts', '.tsx', '.css']);

const TEXT_REPLACEMENTS = [
  [/bg-\[#2d2d30\]/g, 'bg-[var(--color-surface-elevated)]'],
  [/border-\[#3e3e42\]/g, 'border-[var(--color-border)]'],
  [/bg-\[#1e1e1e\]/g, 'bg-[var(--color-bg)]'],
  [/text-\[#cccccc\]/g, 'text-[var(--color-text-primary)]'],
  [/text-\[#969696\]/g, 'text-[var(--color-text-secondary)]'],
  [/bg-\[#007acc\]/g, 'bg-[var(--color-action-primary)]'],
  [/hover:bg-\[#005a99\]/g, 'hover:bg-[var(--color-action-primary-hover)]'],
  [/Loadingâ€¦/g, 'Loading…'],
  [/Savingâ€¦/g, 'Saving…'],
  [/â€”/g, '—'],
  [/milestoneâ€¦/g, 'milestone…'],
];

function walk(path) {
  if (!existsSync(path)) return [];
  const st = statSync(path);
  if (st.isFile()) return [path];

  const files = [];
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const est = statSync(full);
    if (est.isDirectory()) {
      if (entry === '__tests__' || entry === 'mockup') continue;
      files.push(...walk(full));
      continue;
    }
    if (FILE_EXTS.has(extname(full))) files.push(full);
  }
  return files;
}

const files = TARGET_DIRS.flatMap((p) => walk(p));
let changedFiles = 0;
let changedCount = 0;

for (const file of files) {
  let text = readFileSync(file, 'utf8');
  const before = text;
  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  if (text !== before) {
    writeFileSync(file, text);
    changedFiles += 1;
    changedCount += 1;
  }
}

console.log(`Autofix completed. Updated ${changedFiles} file(s).`);
if (changedCount === 0) {
  console.log('No changes were needed.');
}
