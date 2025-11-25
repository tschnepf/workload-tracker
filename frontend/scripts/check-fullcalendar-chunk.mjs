#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve(process.cwd(), 'dist', 'assets');
const LIMIT_BYTES = 250 * 1024; // 250 KB raw budget (~70 KB gzip)

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[fullcalendar-check] dist/assets not found at ${DIST_DIR}. Run "npm run build" first.`);
    process.exit(1);
  }
  const files = fs.readdirSync(DIST_DIR).filter((name) => /^fullcalendar\..+\.js$/i.test(name));
  if (!files.length) {
    console.warn('[fullcalendar-check] Skipping guard: no "fullcalendar.*.js" chunk emitted. Ensure FullCalendarWrapper is referenced before relying on this budget.');
    process.exit(0);
  }
  let maxBytes = 0;
  files.forEach((file) => {
    const size = fs.statSync(path.join(DIST_DIR, file)).size;
    maxBytes = Math.max(maxBytes, size);
    if (size > LIMIT_BYTES) {
      console.error(
        `[fullcalendar-check] Chunk ${file} exceeds ${formatBytes(LIMIT_BYTES)} (found ${formatBytes(size)}). Reduce dependencies or split further.`
      );
      process.exit(1);
    }
  });
  console.log(`[fullcalendar-check] Largest chunk ${formatBytes(maxBytes)} within ${formatBytes(LIMIT_BYTES)} budget.`);
}

main();
