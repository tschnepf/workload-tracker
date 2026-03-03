import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MAX_LINES = 750;

const targets = [
  'src/pages/Assignments/AssignmentGrid.tsx',
  'src/pages/Assignments/ProjectAssignmentsGrid.tsx',
  'src/pages/Projects/ProjectsList.tsx',
];

const countLines = (text) => text.split('\n').length;

const violations = [];
for (const relPath of targets) {
  const absPath = join(ROOT, relPath);
  const content = readFileSync(absPath, 'utf8');
  const lines = countLines(content);
  if (lines > MAX_LINES) {
    violations.push({ relPath, lines });
  }
}

if (violations.length > 0) {
  console.error(`Line-cap check failed (max ${MAX_LINES} lines):`);
  for (const item of violations) {
    console.error(` - ${item.relPath}: ${item.lines} lines`);
  }
  process.exit(1);
}

console.log(`Line-cap check passed (${MAX_LINES} max lines).`);
