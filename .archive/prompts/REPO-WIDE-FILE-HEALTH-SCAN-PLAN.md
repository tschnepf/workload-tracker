# Repo‑Wide File Health Scan Plan

Purpose: produce an authoritative list of files across the repo that contain encoding and formatting hazards (BOM/FFFD, single‑line files, extreme line lengths, control characters, CRLF), without modifying any code. Steps are phrased as prompts you can re‑feed to an AI agent. Follow lean programming; no shortcuts, no band‑aids, no risky bulk edits.

Editing Rules (apply to every step)
- Use apply_patch for all file changes. Preserve formatting and existing line endings.
- Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal `\r\n` sequences; let the patch handle newlines.
- Avoid bulk regex replacements; submit minimal, contextual patches only.
- After editing scripts/config, run `npx tsc --noEmit` (frontend if relevant) and dry‑run tooling. Stop on errors and correct before proceeding.
- Do not “fix” application code in this plan — only scan and report.

---

## Phase 0 — Baseline & Safety

Step 0.1 — Confirm clean state
- Prompt:
  - Ensure the working tree is clean. Create a feature branch for the scan tooling and reports.

Step 0.2 — Baseline checks (non‑blocking)
- Prompt:
  - From `frontend/`, run `npx tsc --noEmit` and `npm run lint:soft` to confirm the environment is healthy before adding scripts.

---

## Phase 1 — Add Repo‑Wide Scan Script (no code changes yet)

Step 1.1 — Add scripts/scan‑file‑health.mjs (repo root)
- Prompt:
  - Add `scripts/scan-file-health.mjs` at the repo root (not under `frontend/`). It must:
    - Recursively scan all tracked files under the repo, excluding: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.cache`.
    - Target extensions: `*.ts,*.tsx,*.js,*.jsx,*.css,*.scss,*.md,*.json,*.yml,*.yaml,*.html`.
    - Detect and record issues per file:
      - `BOM_FEFF`: file contains U+FEFF (BOM) or begins with `\uFEFF`.
      - `REPLACEMENT_CHAR_FFFD`: file contains U+FFFD.
      - `CTRL_CHARS`: contains control characters other than `\n`, `\r`, `\t`.
      - `SINGLE_LINE`: file has ≤ 1 newline.
      - `LINE_TOO_LONG`: any line > 4000 characters.
      - `CRLF_EOL`: detects CRLF line endings (Windows EOL) based on the presence of `\r\n` pairs.
    - Optional informational checks (do not fail, but record):
      - `SMART_QUOTES`: use of curly quotes `“”‘’` outside Markdown and localization files.
      - `TRAILING_WS`: trailing whitespace occurrences (count only).
    - Output two artifacts (create `reports/` if missing):
      - `reports/file-health-report.json`: structured JSON with issues grouped by type and severity.
      - `reports/file-health-report.md`: readable summary with tables and counts by type and path.
    - Exit with code 0 (this plan is report‑only; do not fail CI here).

Step 1.2 — Add npm script aliases at repo root package.json
- Prompt:
  - Add scripts:
    - `scan:health` → `node scripts/scan-file-health.mjs`
    - `scan:health:strict` → same script but with `--strict` to exit non‑zero when issues exist (for later CI usage; keep off by default).

---

## Phase 2 — Execute Scan & Generate Reports

Step 2.1 — Run scan (report‑only)
- Prompt:
  - Run `npm run scan:health` from repo root. Do not modify any application files.

Step 2.2 — Verify report artifacts
- Prompt:
  - Confirm `reports/file-health-report.json` and `reports/file-health-report.md` exist at repo root with:
    - Issue counts by type.
    - Per‑file entries with: `path`, `issueType`, `severity`, and short `context` sample.
  - Validate the JSON structure is stable and can be consumed by tooling.

---

## Phase 3 — Classify & Prioritize (no fixes)

Step 3.1 — Categorize by severity
- Prompt:
  - In the MD report, group issues into:
    - Critical: `REPLACEMENT_CHAR_FFFD`, `BOM_FEFF`, `CTRL_CHARS` (non‑whitespace).
    - High: `SINGLE_LINE`, `CRLF_EOL` in `*.ts,*.tsx,*.js,*.jsx`.
    - Medium: `LINE_TOO_LONG`.
    - Low: `SMART_QUOTES` (outside MD/i18n), `TRAILING_WS`.

Step 3.2 — Group by area
- Prompt:
  - Provide sections by top‑level folder (e.g., `frontend/src/components`, `frontend/src/pages`, `backend/...`) with per‑file counts.
  - Mark files touched by recent commits (last N days) for fast follow‑up.

---

## Phase 4 — Guardrails (prepare, do not enforce yet)

Step 4.1 — Pre‑commit (opt‑in staged subsets)
- Prompt:
  - Propose a staged rollout via `lint-staged` patterns (start with most risky areas like `src/pages/**/*.{ts,tsx}`) running:
    - `prettier --write`
    - `eslint --fix`
    - a scoped health script (like the existing frontend `check-file-health-projects.mjs`) to block: BOM/FFFD/CTRL, single‑line, extreme lines.
  - Do not enable for the entire repo at once to avoid churn.

Step 4.2 — CI gating (later switch)
- Prompt:
  - Add a non‑blocking CI job to run `npm run scan:health` and upload the artifacts.
  - Once the repo is remediated, switch to `scan:health:strict` to hard‑fail on regressions.

---

## Phase 5 — Fix Planning (defer actual fixes)

Step 5.1 — Produce a fix queue
- Prompt:
  - From the JSON report, generate a prioritized list of files to be remediated, ordered by severity and component criticality.
  - Output a `reports/file-health-fix-queue.md` with checkboxes per file and suggested fix type.

Step 5.2 — Define safe fix tactics
- Prompt:
  - For each issue type, document the safe tactic (to be executed later under a separate plan):
    - BOM/FFFD/CTRL: re‑encode to UTF‑8, remove BOM and control chars; verify diff minimal.
    - SINGLE_LINE: ensure LF line endings and add final newline; reformat with Prettier only if a formatter already governs that area.
    - CRLF: normalize to LF via `.gitattributes` and minimal patch if necessary.
    - LONG_LINES: split only where semantically safe; otherwise defer to maintainers.
    - SMART_QUOTES: replace with ASCII only in code or UI strings; allow in MD/i18n.
    - TRAILING_WS: remove via Prettier or minor edits.

---

## Phase 6 — Handoff & Sign‑off

Step 6.1 — Share report and fix queue
- Prompt:
  - Present the MD and JSON reports to maintainers, agree on scope and sequencing for the remediation pass.

Step 6.2 — Lock guardrails scope
- Prompt:
  - Decide whether to expand pre‑commit/CI enforcement beyond Projects and at what pace to limit PR friction.

