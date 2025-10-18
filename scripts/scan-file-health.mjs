// Repo-wide file health scan (report-only)
// - Scans textual files and reports encoding/formatting hazards.
// - Writes JSON and Markdown reports under reports/.
// - Does NOT modify any files and always exits 0 (unless an unexpected error occurs).

import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = join(ROOT, 'reports');

const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache',
  '.venv', '__pycache__', '.pytest_cache', '.idea', '.vscode', 'reports'
]);

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yml', '.yaml',
  '.css', '.scss', '.md', '.mdx', '.html', '.py'
]);

const INFO_EXTS_ALLOW_SMART_QUOTES = new Set(['.md', '.mdx']);

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || EXCLUDE_DIRS.has(e.name)) continue;
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function hasAnyCRLF(s) {
  return s.includes('\r\n');
}
function hasReplacementChar(s) {
  return s.includes('\uFFFD');
}
function hasBOM(s) {
  return s.includes('\uFEFF') || (s.length > 0 && s.charCodeAt(0) === 0xFEFF);
}
function hasControlChars(s) {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
  }
  return false;
}
function countTrailingWhitespaceLines(lines) {
  let count = 0;
  for (const ln of lines) {
    if (/[ \t]+$/.test(ln)) count++;
  }
  return count;
}
function anyLineTooLong(lines, limit = 4000) {
  return lines.some((ln) => ln.length > limit);
}
function longestLineLen(lines) {
  let max = 0;
  for (const ln of lines) { if (ln.length > max) max = ln.length; }
  return max;
}
function hasSmartQuotes(s) {
  return /[“”‘’]/.test(s);
}

function classifyIssues(filePath, text) {
  const ext = extname(filePath).toLowerCase();
  const lines = text.split('\n');
  const issues = [];

  if (hasBOM(text)) issues.push({ type: 'BOM_FEFF', severity: 'critical' });
  if (hasReplacementChar(text)) issues.push({ type: 'REPLACEMENT_CHAR_FFFD', severity: 'critical' });
  if (hasControlChars(text)) issues.push({ type: 'CTRL_CHARS', severity: 'critical' });

  const newlineCount = lines.length - 1; // number of \n
  if (newlineCount <= 1) issues.push({ type: 'SINGLE_LINE', severity: 'high' });
  if (hasAnyCRLF(text)) {
    const sev = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext) ? 'high' : 'medium';
    issues.push({ type: 'CRLF_EOL', severity: sev });
  }
  if (anyLineTooLong(lines)) issues.push({ type: 'LINE_TOO_LONG', severity: 'medium' });

  const trailingCount = countTrailingWhitespaceLines(lines);
  if (trailingCount > 0) issues.push({ type: 'TRAILING_WS', severity: 'low', count: trailingCount });

  if (!INFO_EXTS_ALLOW_SMART_QUOTES.has(ext) && hasSmartQuotes(text)) {
    issues.push({ type: 'SMART_QUOTES', severity: 'low' });
  }
  return issues;
}

function ensureReportDir() {
  try { mkdirSync(REPORT_DIR, { recursive: true }); } catch {}
}

function main() {
  const start = Date.now();
  const files = walk(ROOT);
  /** @type {{ path: string, issues: any[] }[]} */
  const results = [];
  /** @type {string[]} */
  const emptyFiles = [];
  /** @type {Record<string, number>} */
  const countsByIssue = {};

  for (const absPath of files) {
    const ext = extname(absPath).toLowerCase();
    if (!TEXT_EXTS.has(ext)) continue;
    // Exclude Markdown files from results to avoid churn on docs
    if (ext === '.md' || ext === '.mdx') continue;
    const rel = relative(ROOT, absPath).replace(/\\/g, '/');
    let text;
    try {
      const st = statSync(absPath);
      if (st.size === 0) { emptyFiles.push(rel); continue; }
      const buf = readFileSync(absPath);
      text = buf.toString('utf8');
    } catch {
      continue;
    }
    const issues = classifyIssues(absPath, text);
    const lines = text.split('\n');
    const maxLen = longestLineLen(lines);
    if (issues.length > 0) {
      results.push({ path: rel, issues, maxLen });
      for (const it of issues) {
        countsByIssue[it.type] = (countsByIssue[it.type] || 0) + 1;
      }
    }
  }

  // Build JSON report
  const filesOver150 = results.filter((r) => (r.maxLen || 0) > 150);
  const jsonReport = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    totalFilesWithIssues: results.length,
    countsByIssue,
    files: results,
    emptyFiles,
    longLineThreshold: 150,
    filesOver150: filesOver150.map(({ path, maxLen }) => ({ path, maxLen })),
  };

  // Build Markdown summary
  const mdParts = [];
  mdParts.push('# File Health Report');
  mdParts.push('');
  mdParts.push(`Generated: ${jsonReport.generatedAt}`);
  mdParts.push('');
  mdParts.push('## Summary');
  mdParts.push('');
  mdParts.push(`- Files with issues: ${jsonReport.totalFilesWithIssues}`);
  const issueKeys = Object.keys(countsByIssue).sort();
  if (issueKeys.length === 0) {
    mdParts.push('- No issues found.');
  } else {
    for (const k of issueKeys) mdParts.push(`- ${k}: ${countsByIssue[k]}`);
  }
  mdParts.push('');
  mdParts.push('## Files (> 150 columns)');
  mdParts.push('');
  mdParts.push(`- Threshold: 150`);
  mdParts.push(`- Count: ${filesOver150.length}`);
  mdParts.push('');
  if (filesOver150.length > 0) {
    for (const item of filesOver150) {
      mdParts.push(`- \`${item.path}\` (maxLen=${item.maxLen})`);
    }
  } else {
    mdParts.push('- None');
  }
  if (typeof emptyFiles !== 'undefined' && emptyFiles.length > 0) {
    mdParts.push('');
    mdParts.push(`> Note: ${emptyFiles.length} zero-byte files were ignored to reduce noise.`);
  }

  ensureReportDir();
  const jsonPath = join(REPORT_DIR, 'file-health-report.json');
  const mdPath = join(REPORT_DIR, 'file-health-report.md');
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');
  writeFileSync(mdPath, mdParts.join('\n'), 'utf8');

  // Build prioritized fix queue
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  function worstSeverity(issues) {
    return issues.reduce((acc, it) => Math.min(acc, sevOrder[it.severity] ?? 3), 3);
  }
  const sorted = [...results].sort((a, b) => {
    const wa = worstSeverity(a.issues);
    const wb = worstSeverity(b.issues);
    if (wa !== wb) return wa - wb;
    return a.path.localeCompare(b.path);
  });

  const fixHint = {
    BOM_FEFF: 'Re-encode to UTF-8 without BOM; remove BOM characters.',
    REPLACEMENT_CHAR_FFFD: 'Replace replacement chars with correct text; fix source encoding.',
    CTRL_CHARS: 'Remove non-whitespace control characters; ensure UTF-8 text only.',
    SINGLE_LINE: 'Ensure LF line endings and add a final newline; format if governed.',
    CRLF_EOL: 'Normalize to LF (consistent with .gitattributes).',
    LINE_TOO_LONG: 'Split overly long lines where safe; otherwise defer to maintainers.',
    SMART_QUOTES: 'Replace curly quotes with ASCII in code/UI strings; allow in Markdown.',
    TRAILING_WS: 'Remove trailing whitespace (formatter or minimal edit).',
  };

  const q = [];
  q.push('# File Health Fix Queue');
  q.push('');
  q.push(`Generated: ${jsonReport.generatedAt}`);
  q.push('');
  q.push('Items are grouped by severity (critical -> low).');
  q.push('');
  let lastBucket = -1;
  for (const item of sorted) {
    const bucket = worstSeverity(item.issues);
    if (bucket !== lastBucket) {
      const title = Object.entries(sevOrder).find(([, v]) => v === bucket)?.[0] ?? 'low';
      q.push('');
      q.push(`## ${title.charAt(0).toUpperCase()}${title.slice(1)}`);
      q.push('');
      lastBucket = bucket;
    }
    const issueList = item.issues.map((i) => i.type).join(', ');
    const linkTarget = `../${item.path}`;
    q.push(`- [ ] [\`${item.path}\`](${linkTarget}) - ${issueList}`);
    for (const it of item.issues) {
      const hint = fixHint[it.type] || '';
      q.push(`  - ${it.type}: ${hint}`);
    }
  }

  const queuePath = join(REPORT_DIR, 'file-health-fix-queue.md');
  writeFileSync(queuePath, q.join('\n'), 'utf8');

  const tookMs = Date.now() - start;
  console.log(`Scan complete in ${tookMs}ms.`);
  console.log(`Report JSON: ${jsonPath}`);
  console.log(`Report MD:   ${mdPath}`);
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error('scan-file-health failed:', err);
  // Still exit 0 per plan (report-only), but surface the error in logs.
  process.exit(0);
}
