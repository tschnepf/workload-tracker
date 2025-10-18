import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const FRONTEND_DIR = process.cwd();
const exts = new Set(['.ts', '.tsx']);
const target = join(FRONTEND_DIR, 'src/pages/Projects');

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

function hasBadChars(buf) {
  const s = buf.toString('utf8');
  if (s.includes('\uFFFD') || s.includes('\uFEFF')) return true;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
  }
  return false;
}

const files = walk(target).filter((p) => exts.has(extname(p)));
let errors = [];
for (const f of files) {
  const buf = readFileSync(f);
  const text = buf.toString('utf8');
  if (text.split(/\n/).length - 1 <= 1) errors.push(`${f}: single-line file (<=1 newline)`);
  if (text.split(/\n/).some((ln) => ln.length > 4000)) errors.push(`${f}: has a line > 4000 chars`);
  if (hasBadChars(buf)) errors.push(`${f}: contains BOM/FFFD or control characters`);
}

if (errors.length) {
  console.error('File health check (projects) FAILED:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
} else {
  console.log('File health check (projects) passed.');
}

