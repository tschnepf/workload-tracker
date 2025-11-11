# Security Audit Runbook (v2) — Fact-Finding First, Fix Later

Purpose
- Deliver a rigorous, reproducible, non-destructive security audit of this repository.
- Phase 1 is fact-finding only: enumerate and document issues; do not remediate.
- All findings must be recorded in a separate report file and prioritized; a remediation plan is produced in Phase 2 (later).

Ground Rules
- Scope: static/dry review by default (no destructive testing). If dynamic checks are needed, request explicit approval and use mock/sandbox data only.
- No fabrication: if inputs/evidence are missing, state precisely what is needed.
- Redaction: never include raw secrets or PII in reports. Mask tokens, keys, and URLs.
- Encoding: all outputs are UTF-8, plain punctuation (no smart quotes).

Success Metrics (Phase 1)
- Top-30 validated findings with code/config evidence captured.
- >= 80% of tool noise triaged or suppressed with justification.
- 100% of authenticated update/delete endpoints sampled for object-level authorization.
- security-findings.json validates against schema and dedup rules.

Primary Deliverables (Phase 1)
- SECURITY-FINDINGS.md (human report): prioritized list with evidence, impact, and fixes-at-a-glance.
- security-findings.json (machine report): normalized JSON for CI dashboards and tracking.
- Threat model and inventory sections embedded at the top of SECURITY-FINDINGS.md.
- Commit `security/schema/security-findings.schema.json` and `security/tools/aggregate_findings.py`; use them to validate and aggregate tool outputs.

Severity & Risk Model (Unified)
- Risk Score = (Exploitability x Business Impact x Exposure) / (Detection x Mitigation)
  - Exploitability (1-5): Remote=5, Network=4, Local=3, Physical=2, Complex=1
  - Business Impact (1-5): Full compromise=5, Data breach=4, Service disruption=3, Info disclosure=2, Minor=1
  - Exposure (1-5): Internet-facing=5, Authenticated user=3, Admin-only=2, Internal network=2, Physical=1
  - Detection (1-5): No logging=1, Basic logs=2, Centralized monitoring=3, Alerts=4, Advanced detection=5
  - Mitigation (1-5): None=1, Basic=2, Standard=3, Defense-in-depth=4, Comprehensive=5
- Severity bands (deterministic): Critical >=15, High 10-14, Medium 5-9, Low <5
- Report raw factors and a confidence rating (high|medium|low) per finding.
- Worked examples:
  - Public reflected XSS without CSP: E=5, I=3, X=5, D=2, M=2 => (5x3x5)/(2x2)=18.75 => Critical (confidence: high if code excerpt shows sink)
  - IDOR on authenticated object update with logs present: E=4, I=4, X=3, D=3, M=2 => (4x4x3)/(3x2)=8 => Medium (confidence: medium if only static code evidence)

Output Schemas
- security-findings.json (array of objects):
  ```json
  {
    "id": "RULE_ID:path#Lline",
    "rule_id": "RULE_ID",
    "title": "...",
    "severity": "Critical|High|Medium|Low",
    "risk_score": 12.5,
    "factors": {"exploitability":4, "impact":4, "exposure":4, "detection":2, "mitigation":3},
    "confidence": "high|medium|low",
    "category": "authz|xss|secrets|config|supply-chain|...",
    "cwe": "CWE-639",
    "cvss": "(optional string)",
    "repo": "(optional repo name)",
    "path": "repo/path",
    "line": 123,
    "end_line": 125,
    "fingerprint": "sha256(normalized-location+snippet)",
    "owner": "team-or-user",
    "status": "open|triaged|accepted-risk|fixed",
    "tags": ["owasp-asvs:2.1.1","compliance:cis-18"],
    "evidence": "short excerpt or config snippet (redacted)",
    "attack_vector": "how it is exploited",
    "business_impact": "specific asset risk",
    "technical_impact": "e.g., IDOR, RCE, data access",
    "fix": "precise fix guidance or patch outline",
    "fix_prereqs": ["enable TLS before HSTS"],
    "references": ["https://owasp.org/ASVS/..."],
    "suppression": {"reason": "accepted risk", "approver": "sec-lead", "expires": "2025-12-31"},
    "first_seen": "2025-09-26T00:00:00Z"
  }
  ```
- JSON Schema: ensure this file validates via `jq` or `ajv` in CI (add schema to `security/schema/security-findings.schema.json`).

Dedupe & Noise Control
- Canonical ID: `rule_id + normalized_path + line_range`; include a snippet fingerprint.
- Suppress or merge overlapping tool hits; require justification for waivers.
- Noise budget: if untriaged Medium/Low > 30% of total, tune rules and rerun before proceeding.

Timeboxes & Stop Conditions (Scalable)
- Small repo: 0.5 day inventory, 0.5 day tooling, 1 day scans/triage, 1 day deep dives.
- Medium/Large: double the above; extend deep dives only with stakeholder approval.
- Always surface a Top-30 list first and confirm with stakeholders before deeper work.

---

## Phase 0 — Pre-flight & Inventory (Fact-Finding)
Goal
- Build a security-relevant inventory and confirm assumptions.

Steps
- [ ] Enumerate stacks, services, Dockerfiles/compose, CI/CD configs, environment samples.
- [ ] Map entry points (web UI, APIs, admin surfaces) and trust boundaries.
- [ ] Capture dependency baselines (Python, Node, images) and SBOM generation plan.
- [ ] Create `security/artifacts/` and place all outputs there (UTF-8 JSON).
- [ ] Public surfaces: document unauthenticated endpoints and their outputs.
  - Gate `api/capabilities` behind auth or minimize data; avoid exposing rollout/toggle details anonymously.
  - Remove environment/DEBUG values from unauthenticated `health` output (only status + service).
- [ ] Storage exposure: confirm user-uploaded imports are saved to a private, non-web-served path (not MEDIA).
- [ ] Prod baselines: `DEBUG=false`, unique `SECRET_KEY`, minimal `ALLOWED_HOSTS`, `CSP_ENABLED=true`, `CSP_REPORT_ONLY=false`.
- [ ] Auth mode: in production, enforce cookie-refresh (`COOKIE_REFRESH_AUTH=true` and `VITE_COOKIE_REFRESH_AUTH=true`) and align CORS/CSRF origins.
- [ ] Cookie SameSite: plan for `SESSION_COOKIE_SAMESITE='Lax'` and `CSRF_COOKIE_SAMESITE='Lax'` in prod.
- [ ] Container security inventory: record for each container: non-root user, dropped capabilities, read-only rootfs, mounted volumes (RO/RW), published ports, and network topology.
- [ ] Redis posture: ensure no host exposure in prod, authentication required, and in-network access only; document dev exposure risks.
- [ ] Database posture: document DB users/privileges, SSL/TLS in transit, and audit logging availability.
- [ ] Secrets audit: inventory all secrets, storage method (env/CI/vault), rotation cadence, and access controls.
- [ ] Data flow analysis: map flows of sensitive data (credentials, tokens, PII), retention windows, and residency constraints.

Stop when
- Primary stacks and auth method are known, and inventory is recorded in SECURITY-FINDINGS.md (Threat Model section).

---

## Phase 1 — Automated Scans (Non-destructive)
Runbooks (copy-paste; write outputs to `security/artifacts/`)
- Secrets
  - `gitleaks detect --no-git --report-format json --report-path security/artifacts/gitleaks.json || true`
  - History (optional): `gitleaks detect --report-format json --report-path security/artifacts/gitleaks-history.json`
- Python (backend)
  - `bandit -r backend -x backend/**/migrations,backend/**/tests -f json -o security/artifacts/bandit.json`
  - `pip-audit -r backend/requirements.txt -f json -o security/artifacts/pip-audit.json`
  - `safety check -r backend/requirements.txt --json > security/artifacts/safety.json`
- JS/TS (frontend)
  - `npm --prefix frontend audit --omit=dev --json > security/artifacts/npm-audit.json || true`
  - `semgrep --error --json --config p/ci --config p/react --config p/ts --config p/python --config p/django --config p/security-audit --config p/secrets > security/artifacts/semgrep.json`
- Containers & Config
  - `trivy image --format json -o security/artifacts/trivy-image.json <image>`
  - `trivy config --format json -o security/artifacts/trivy-config.json .`
- Optional: build images with deterministic tags (e.g., `backend:ci-$GITHUB_SHA`) and scan those tags to ensure reproducible results.
- IaC/Cloud (if present)
  - Run tfsec/checkov/kics; save JSON to `security/artifacts/`.
- SBOM (optional but recommended)
  - `syft . -o cyclonedx-json > security/artifacts/sbom.cdx.json`

- Deploy checks (backend)
  - `python backend/manage.py check --deploy > security/artifacts/django-check-deploy.txt`

Optional/Advanced (approval required)
- Historical secrets: `trufflehog filesystem --json . > security/artifacts/trufflehog.json` (or run `gitleaks` over full history).
- Second image scanner: `grype <image> -o json > security/artifacts/grype.json` (complements Trivy for broader coverage).
- Network surface scan: `nmap` against staging host to enumerate open ports/services (non-destructive; do not run in prod without change approval).

Normalization & Dedupe
- Convert tool outputs into a single `security-findings.json` using the schema.
- Dedupe by canonical ID and snippet fingerprint; suppress exact duplicates.
- If untriaged Medium/Low > 30%, tune rules and rerun.

Aggregator (repo-provided)
- `python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json`
- Validate: `npx ajv validate -s security/schema/security-findings.schema.json -d security/security-findings.json`

Stop when
- Tools ran (N/A acceptable with note), `security-findings.json` validates, and Top-30 are documented in SECURITY-FINDINGS.md.

---

## Phase 2 — Manual Deep Dives (Code-aware)
Focus Areas (stack-specific)
- Django/DRF
  - Settings: `DEBUG`, `ALLOWED_HOSTS`, HSTS, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `CSRF_TRUSTED_ORIGINS`, CORS policy.
  - Cookie SameSite: confirm `SESSION_COOKIE_SAMESITE` and `CSRF_COOKIE_SAMESITE` set to `Lax` in prod.
  - DRF default `permission_classes` and object-level authZ: IDOR checks on endpoints (`/projects`, `/assignments`, `/people`).
  - JWT lifecycle: refresh rotation, blacklist/invalidate on logout, token lifetimes, cookie flags (if cookie mode), localStorage XSS risk.
  - Session controls: define idle timeout behavior and optional concurrent session limits using JWT blacklist/introspection strategies.
  - JWT access token lifetime target: 15-30 minutes in prod; keep refresh rotation/blacklist enabled.
  - File uploads: type/size validation, storage isolation, signed URLs.
  - OpenAPI exposure: ensure no sensitive admin endpoints exposed unauthenticated; gate `/api/schema` and `/api/schema/swagger/` behind auth/admin in prod.
- React/TS Frontend
  - XSS sinks: `dangerouslySetInnerHTML`, user-controlled `href/src/style`, template injection.
  - CSP headers alignment, SRI for third-party scripts, error redaction.
  - AuthN/AuthZ on routes: route guards, admin surfaces, leakage via query params.
- Web/Headers/NGINX
  - CSP, HSTS, Referrer-Policy, X-Content-Type-Options, X-Frame-Options; per-route cache and size/time limits.
  - Remove deprecated `X-XSS-Protection`; add conservative `Permissions-Policy` in prod.
  - Ensure large upload routes (e.g., `/api/backups/upload-restore/`) have appropriate `client_max_body_size` overrides.
- Supply Chain
  - Pinning, Renovate cadence, SBOM (CycloneDX), license policy.
- Containers & Networking
  - Containers run as non-root; minimal capabilities; read-only rootfs; least-privileged volume mounts and ports.
  - Docker network segmentation: avoid unnecessary host port exposure; ensure intra-network isolation; prefer private networks.
- Data/DB & Redis
  - Database TLS in transit; separate DB users/roles with least privilege; enable/assess audit logging.
  - Redis: authentication required, no host exposure in prod; consider TLS where feasible.

Heuristics (Detection/Mitigation)
- Detection: look for structured logging, auth event logs, error handling paths, and monitoring hooks.
- Mitigation: presence of defense-in-depth controls (rate limiting, input validation layers, security headers, WAF/CDN rules).

How to Document
- For each issue: capture a minimal code excerpt (<=12 lines), explain the attack vector, compute Risk Score with raw factors and confidence, and propose an idiomatic fix.
- Add to SECURITY-FINDINGS.md and security-findings.json.

Executable Checks (repo-specific)
- Enumerate DRF endpoints via `api/schema` and assert that write operations require intended roles (object-level auth sampling on `/people`, `/projects`, `/assignments`).
- Verify public info surfaces: `api/capabilities` is authenticated; `health` does not leak environment/DEBUG.
- For uploads: ensure People/Projects imports enforce MIME and size limits and save to a private, non-web-served path.
- Exports (CSV/XLSX): escape formula-leading characters (`= + - @`) and control chars to prevent Excel formula injection.
- JWT/CSRF alignment in prod (cookie mode): refresh cookie flags (httponly/secure/samesite), `CORS_ALLOW_CREDENTIALS` only when cookie mode is on, `CSRF_TRUSTED_ORIGINS` set.
- CSP rollout in prod: remove `unsafe-inline` for styles (or use nonces/hashes) and turn report-only off when stable.
- External resources & CSP: either self-host fonts/scripts or explicitly allow only the minimal required origins; remove unused preconnects.
- Swagger/OpenAPI: require auth/admin for `/api/schema` and `/api/schema/swagger/` in prod.
- Headers: remove deprecated `X-XSS-Protection`; ensure `Permissions-Policy` is set; align Django dev headers with prod where feasible.
- Nginx: set route-specific `client_max_body_size` for large upload paths (e.g., backups upload/restore).
- Logging: structured JSON with basic redaction for sensitive values passed via `extra`.
- Config hygiene: detect and resolve duplicated/conflicting settings (e.g., repeated `CORS_ALLOW_CREDENTIALS`).
- Privilege escalation: test vertical/horizontal role escalation beyond IDOR (e.g., user->manager->admin access attempts).
- Throttling bypass: attempt multi-endpoint and parameter-variant requests to detect per-endpoint throttle evasion.
- XLSX hardening: reject macro-enabled formats; verify XLSX/ZIP structure; apply ceilings on worksheets/cells to mitigate zip-bomb style payloads.
- Input/Unicode: probe Unicode normalization/bidi/homograph edge cases on user-visible fields; enforce normalization rules where needed.
- Client-side storage & caching: verify no sensitive data cached; confirm no secrets in localStorage when cookie refresh is enabled.
- Optional AV scan: if infra available, scan uploaded files prior to processing.

Stop when
- Top-30 are validated with code excerpts and at least 30 total findings are triaged (or fewer if the repo is small).

---

## Phase 3 — Executive Summary & Hand-off (Still Fact-Finding)
Outputs
- Top-30 risks with asset impact and quick wins (1–2 line fixes).
- 30/60/90-day hardening roadmap (bulleted; to be expanded in Phase 2 remediation plan).
- Compliance mapping (ASVS/CIS) for Top-30 only (or at least Top-10 if timeboxed).

## Phase 4 — Remediation Plan Stub (Fix Later)
Outputs
- Remediation backlog with owner, severity, target date, dependencies, acceptance criteria, and verification method for each item.
- SLA targets by severity (e.g., Critical: immediate, High: 48h, Medium: 7 days, Low: backlog).

---

## Templates

SECURITY-FINDINGS.md (skeleton)
```
# Security Findings (Fact-Finding Report)

## Threat Model & Inventory (Summary)
- Stacks: Django/DRF, React/TS, Docker/Compose ...
- Trust Boundaries: Internet -> Web/API, AuthN/AuthZ, Admin surfaces ...
- Critical Assets: Credentials, Tokens, People/Assignments/Projects data ...

## Top-30 Findings (At a Glance)
1. [Severity] Title — Risk Score X.X — Where: path:line
   - Vector: ...
   - Impact: ...
   - Fix: ...

## All Findings
### [ID] [Severity] Title — Risk Score X.X
- Where: repo/path:line
- Evidence: short excerpt
- Vector: ...
- Business Impact: ...
- Technical Impact: ...
- Factors: E=?, I=?, X=?, D=?, M=?
- Fix: ...
- References: ...
```

---

## Governance & Hygiene
- Redaction policy: mask tokens/URLs; never publish raw secrets.
- Artifact retention: store tool JSON for 90 days, then purge.
- CI integration: upload SARIF/JSON; set fail-threshold at High (prefer baseline so only new High/Critical fail).
- SIEM/log shipping: forward structured JSON logs to centralized storage with immutability/retention; implement basic security detections (excessive 401/429/5xx).
- Incident response: outline triage, containment, and notification procedures (who/when/how), and practice with tabletop drills.
- Third-party risk & dependencies: review external services/dependencies for security and SLA posture.
- Privacy & compliance: perform privacy impact assessment (PIA) where applicable; document data subject rights handling and residency constraints.
- Data lifecycle: define encryption at rest strategy (DB volumes/backups), and secure deletion procedures for retired data/media.

- CI integration: upload SARIF/JSON; fail-threshold High (prefer baseline so only new High/Critical fail).

## CI/CD Integration (sample)
- GitHub Actions: run Gitleaks, Bandit, pip-audit, npm audit (--omit=dev), Semgrep (python/django/react/ts/security-audit/secrets), Trivy (config + built image), Syft SBOM; upload SARIF/JSON; fail on new High/Critical (prefer baseline diff so only "new" fails the build). Store artifacts under `security/artifacts/`.

---

## Repo-Specific Quick Wins (Applied)
- Gate `api/capabilities` behind authentication.
- Remove `environment` from unauthenticated `health` response to avoid info disclosure.
- People import: enforce MIME/size checks and persist uploads to a private, non-web-served path (under `BACKUPS_DIR`).

## References
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CIS Controls: https://www.cisecurity.org/controls
