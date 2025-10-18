// Generate a filtered report of files whose maximum line length exceeds a threshold (default 150).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = join(ROOT, 'reports');
const JSON_PATH = join(REPORT_DIR, 'file-health-report.json');
const OUT_PATH = join(REPORT_DIR, 'file-health-report-gt150.md');
const THRESH = 150;

function longestLineLen(text) {
  let max = 0;
  const lines = text.split('\n');
  for (const ln of lines) if (ln.length > max) max = ln.length;
  return max;
}

try {
  const raw = readFileSync(JSON_PATH, 'utf8');
  const report = JSON.parse(raw);
  let entries = [];
  if (Array.isArray(report.filesOver150) && report.filesOver150.length > 0) {
    entries = report.filesOver150.map(({ path, maxLen }) => ({ path, maxLen }));
  } else if (Array.isArray(report.files)) {
    // Fallback: compute max length on the fly from listed files
    for (const f of report.files) {
      try {
        const text = readFileSync(join(ROOT, f.path), 'utf8');
        const maxLen = longestLineLen(text);
        if (maxLen > THRESH) entries.push({ path: f.path, maxLen });
      } catch {}
    }
  }

  entries.sort((a, b) => (b.maxLen || 0) - (a.maxLen || 0) || a.path.localeCompare(b.path));

  const md = [];
  md.push('# Files Exceeding 150 Columns');
  md.push('');
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push('');
  md.push(`- Threshold: ${THRESH}`);
  md.push(`- Count: ${entries.length}`);
  md.push('');
  if (entries.length === 0) {
    md.push('- None');
  } else {
    for (const e of entries) md.push(`- \`${e.path}\` (maxLen=${e.maxLen})`);
  }
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, md.join('\n'), 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
} catch (err) {
  console.error('Failed to generate long-lines report:', err.message);
  process.exit(1);
}

