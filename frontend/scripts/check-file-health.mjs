import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const FRONTEND_DIR = process.cwd();

const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md', '.json']);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

function hasBadChars(buf) {
  // U+FFFD replacement, U+FEFF BOM
  const s = buf.toString('utf8');
  if (s.includes('\uFFFD') || s.includes('\uFEFF')) return true;
  // Control chars except \n, \r, \t
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
  }
  return false;
}

function lineCount(s) {
  return s.split(/\n/).length - 1; // newlines count
}

let errors = [];

const target = join(FRONTEND_DIR, 'src');
const files = walk(target).filter((p) => exts.has(extname(p)));

for (const f of files) {
  const buf = readFileSync(f);
  const text = buf.toString('utf8');
  // Check single-line (≤ 1 newline)
  if (lineCount(text) <= 1) {
    errors.push(`${f}: single-line file (<=1 newline)`);
    continue;
  }
  // Extremely long lines (safety threshold)
  if (text.split(/\n/).some((ln) => ln.length > 4000)) {
    errors.push(`${f}: has a line > 4000 chars`);
  }
  // Bad chars
  if (hasBadChars(buf)) {
    errors.push(`${f}: contains BOM/FFFD or control characters`);
  }
}

if (errors.length > 0) {
  console.error('File health check FAILED:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
} else {
  console.log('File health check passed.');
}
