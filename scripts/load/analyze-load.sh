#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOAD_ROOT="${ROOT_DIR}/tests/load"
REPORT_DIR=""

usage() {
  cat <<'EOF'
Usage: scripts/load/analyze-load.sh --report-dir <path>
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-dir) REPORT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${REPORT_DIR}" ]]; then
  usage
  exit 1
fi

if [[ ! -d "${REPORT_DIR}" ]]; then
  echo "Report directory not found: ${REPORT_DIR}" >&2
  exit 1
fi

python3 - "${REPORT_DIR}" "${LOAD_ROOT}" <<'PY'
import json
import math
import pathlib
import shutil
import sys
from datetime import datetime, timezone

report_dir = pathlib.Path(sys.argv[1]).resolve()
load_root = pathlib.Path(sys.argv[2]).resolve()
summary_path = report_dir / "k6-summary.json"
manifest_path = report_dir / "seed-manifest.json"
backend_counts_path = report_dir / "backend-status-counts.json"
endpoint_db_breakdown_path = report_dir / "endpoint-db-breakdown.json"
queue_recovery_path = report_dir / "queue-recovery.json"
lock_waits_path = report_dir / "sql" / "post" / "03_lock_waits.txt"
raw_path = report_dir / "k6-raw.json"
latest_summary_path = load_root / "reports" / "latest-summary.json"

if not summary_path.exists():
    raise SystemExit(f"k6 summary not found at {summary_path}")

required_files = [
    summary_path,
    raw_path,
    report_dir / "docker-stats.log",
    report_dir / "redis-queue-depth.log",
    backend_counts_path,
    endpoint_db_breakdown_path,
    queue_recovery_path,
]
missing_files = [str(path) for path in required_files if not path.exists()]

pre_sql = sorted((report_dir / "sql" / "pre").glob("*.txt"))
post_sql = sorted((report_dir / "sql" / "post").glob("*.txt"))
if not pre_sql:
    missing_files.append(str(report_dir / "sql" / "pre" / "*.txt"))
if not post_sql:
    missing_files.append(str(report_dir / "sql" / "post" / "*.txt"))
if missing_files:
    raise SystemExit("missing required artifacts: " + ", ".join(missing_files))

summary = json.loads(summary_path.read_text())
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
backend_counts = json.loads(backend_counts_path.read_text()) if backend_counts_path.exists() else {"statusCounts": {}}

metrics = summary.get("metrics", {})

def metric_value(metric_name: str, key: str, default=0.0):
    m = metrics.get(metric_name, {})
    if not isinstance(m, dict):
        return float(default)
    values = m.get("values", {})
    if isinstance(values, dict) and key in values:
        return float(values.get(key, default) or default)
    if key in m:
        return float(m.get(key, default) or default)
    if key == "rate" and "value" in m:
        return float(m.get("value", default) or default)
    return float(default)

error_rate = metric_value("http_errors", "rate", metric_value("http_req_failed", "rate", 0.0))
read_p95 = metric_value("read_latency_ms", "p(95)", 0.0)
write_p95 = metric_value("write_latency_ms", "p(95)", 0.0)
read_p99 = metric_value("read_latency_ms", "p(99)", 0.0)
write_p99 = metric_value("write_latency_ms", "p(99)", 0.0)

status_409 = int(metric_value("status_409", "count", 0.0))
status_412 = int(metric_value("status_412", "count", 0.0))
status_429 = int(metric_value("status_429", "count", 0.0))
status_5xx = int(metric_value("status_5xx", "count", 0.0))
expected_conflicts = int(metric_value("expected_conflicts", "count", 0.0))
auth_failures = int(metric_value("auth_failures", "count", 0.0))

op_status_counts: dict[tuple[str, str], int] = {}
op_durations: dict[str, list[float]] = {}
if raw_path.exists():
    with raw_path.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            if row.get("metric") != "http_reqs" or row.get("type") != "Point":
                if row.get("metric") == "http_req_duration" and row.get("type") == "Point":
                    tags = (row.get("data") or {}).get("tags") or {}
                    op = str(tags.get("op") or "<none>")
                    value = float((row.get("data") or {}).get("value") or 0.0)
                    op_durations.setdefault(op, []).append(value)
                continue
            tags = (row.get("data") or {}).get("tags") or {}
            op = str(tags.get("op") or "<none>")
            status = str(tags.get("status") or "<none>")
            op_status_counts[(op, status)] = op_status_counts.get((op, status), 0) + 1

top_failure_ops = sorted(
    (
        {"op": op, "status": status, "count": count}
        for (op, status), count in op_status_counts.items()
        if status and status[0].isdigit() and int(status) >= 400
    ),
    key=lambda item: item["count"],
    reverse=True,
)[:10]

def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    s = sorted(values)
    idx = (len(s) - 1) * (p / 100.0)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return s[lo]
    frac = idx - lo
    return s[lo] + (s[hi] - s[lo]) * frac

endpoint_rows: list[dict] = []
all_ops = set(op_durations.keys()) | {op for (op, _status) in op_status_counts.keys()}
for op in sorted(all_ops):
    durations = op_durations.get(op, [])
    total_reqs = sum(count for (candidate_op, _), count in op_status_counts.items() if candidate_op == op)
    failed_reqs = sum(
        count
        for (candidate_op, status), count in op_status_counts.items()
        if candidate_op == op and status and status[0].isdigit() and int(status) >= 400
    )
    success_reqs = total_reqs - failed_reqs
    endpoint_rows.append(
        {
            "op": op,
            "count": total_reqs,
            "successCount": success_reqs,
            "failCount": failed_reqs,
            "errorRate": (failed_reqs / total_reqs) if total_reqs else 0.0,
            "avgMs": (sum(durations) / len(durations)) if durations else 0.0,
            "p95Ms": percentile(durations, 95.0) if durations else 0.0,
            "p99Ms": percentile(durations, 99.0) if durations else 0.0,
        }
    )

endpoint_rows.sort(key=lambda row: (row["p95Ms"], row["count"]), reverse=True)
top_latency_ops = [row for row in endpoint_rows if row["count"] >= 100][:12]

threshold_error = 0.01
threshold_read = 1000.0
threshold_write = 1500.0

findings: list[dict] = []

def add_finding(priority: int, title: str, evidence: str, cause: str, options: str, impact: str):
    findings.append(
        {
            "priority": priority,
            "title": title,
            "evidence": evidence,
            "cause": cause,
            "options": options,
            "impact": impact,
        }
    )

if error_rate > threshold_error:
    add_finding(
        0,
        "Global error rate exceeded SLO gate",
        f"error_rate={error_rate:.4f} (gate<{threshold_error:.4f})",
        "Capacity saturation and/or endpoint-level contention under mixed load.",
        "Inspect status counters, hot endpoints in k6 output, and DB lock snapshots to identify failing paths.",
        "Direct reliability risk under concurrent usage.",
    )

if read_p95 > threshold_read:
    add_finding(
        1,
        "Read latency p95 exceeded gate",
        f"read_p95_ms={read_p95:.1f} (gate<{threshold_read:.1f})",
        "Read-heavy endpoint bottlenecks (query plan, cache misses, or API fan-out).",
        "Prioritize top pg_stat_statements entries by total and mean execution time and add endpoint-level profiling.",
        "User-visible slowness for list/snapshot routes.",
    )

if write_p95 > threshold_write:
    add_finding(
        1,
        "Write latency p95 exceeded gate",
        f"write_p95_ms={write_p95:.1f} (gate<{threshold_write:.1f})",
        "Write-path contention (row locks, transaction conflicts, or synchronous side effects).",
        "Profile bulk update and create/update endpoints; isolate lock-heavy SQL and reduce transaction scope.",
        "Higher save/update latency and potential timeout risk.",
    )

if status_429 > 0:
    add_finding(
        2,
        "Throttle saturation observed (429 responses)",
        f"status_429_count={status_429}",
        "User/scoped throttle rates reached under concurrent request bursts.",
        "Tune throttle scopes for tested endpoints and/or smooth client retry/backoff behavior.",
        "Can cause user-visible retries and failed operations during bursts.",
    )

if auth_failures > 0:
    add_finding(
        0,
        "Authentication instability under concurrency",
        f"auth_failures={auth_failures}",
        "Login/refresh endpoints are throttling or failing during ramp/burst, forcing repeated re-auth attempts.",
        "Increase auth throttle capacity for load profile, pre-warm sessions, and add backoff/jitter for token obtain/refresh retries.",
        "High risk of session churn, failed actions, and cascading retries at peak load.",
    )

if top_failure_ops:
    top = top_failure_ops[0]
    add_finding(
        0,
        "Dominant failing endpoint/op identified",
        f"top_failure={top['op']} status={top['status']} count={top['count']}",
        "A single endpoint/op dominates failure volume under concurrent load.",
        "Address this endpoint first; reducing this dominant class typically yields the largest reliability gain per change.",
        "Fastest path to reducing global error rate and user-visible failures.",
    )

if top_latency_ops:
    slowest = top_latency_ops[0]
    add_finding(
        1,
        "Slowest endpoint/op identified",
        f"slowest_op={slowest['op']} p95={slowest['p95Ms']:.1f}ms count={slowest['count']}",
        "This operation has the highest sustained tail latency under concurrent load.",
        "Prioritize SQL and payload optimization for this op first; then retest p95/p99 deltas.",
        "Largest expected latency reduction if optimized.",
    )

if status_5xx > 0:
    add_finding(
        1,
        "Server errors observed (5xx)",
        f"status_5xx_count={status_5xx}",
        "Unhandled errors or backend overload under concurrent pressure.",
        "Inspect backend.log around 5xx spikes and correlate with top SQL and resource metrics.",
        "Potential correctness and availability issue.",
    )

if status_412 > 0:
    add_finding(
        2,
        "ETag precondition conflicts observed",
        f"status_412_count={status_412}, expected_conflicts={expected_conflicts}",
        "Concurrent stale-write attempts against shared assignments during hotspot scenario.",
        "Keep optimistic concurrency; improve client merge/retry strategy and reduce stale-write windows.",
        "Conflict handling load is present; expected, but should remain bounded.",
    )

lock_lines = []
if lock_waits_path.exists():
    for raw in lock_waits_path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("(") and line.endswith("rows)"):
            continue
        if line.startswith("blocked_pid") or line.startswith("---"):
            continue
        lock_lines.append(line)
if lock_lines:
    add_finding(
        1,
        "Lock waits detected in DB snapshot",
        f"lock_wait_rows={len(lock_lines)}",
        "Concurrent writes contending on shared rows/indexes.",
        "Inspect blocking/blocked query pairs and reorder/partition write paths.",
        "Can amplify tail latency during bursts.",
    )

if not findings:
    add_finding(
        3,
        "No critical bottlenecks detected in this run",
        "All configured hard gates passed.",
        "Current load profile stayed within thresholds.",
        "Proceed with targeted tuning only if specific endpoints still feel slow in manual workflows.",
        "Residual risk remains for larger datasets or different traffic shapes.",
    )

findings.sort(key=lambda item: item["priority"])

previous = None
if latest_summary_path.exists():
    try:
        previous = json.loads(latest_summary_path.read_text())
    except Exception:
        previous = None

def previous_metric(metric_name: str, key: str, default=0.0):
    if not previous:
        return None
    m = previous.get("metrics", {}).get(metric_name, {})
    values = m.get("values", {})
    if key not in values:
        return None
    return float(values.get(key, default) or default)

prev_error = previous_metric("http_errors", "rate", previous_metric("http_req_failed", "rate", 0.0) or 0.0)
prev_read = previous_metric("read_latency_ms", "p(95)", 0.0)
prev_write = previous_metric("write_latency_ms", "p(95)", 0.0)

delta_lines = []
if prev_error is not None:
    delta_lines.append(f"- Error rate delta: {error_rate - prev_error:+.4f}")
if prev_read is not None:
    delta_lines.append(f"- Read p95 delta (ms): {read_p95 - prev_read:+.1f}")
if prev_write is not None:
    delta_lines.append(f"- Write p95 delta (ms): {write_p95 - prev_write:+.1f}")

status_counts = backend_counts.get("statusCounts", {}) if isinstance(backend_counts, dict) else {}
status_by_endpoint = backend_counts.get("statusByEndpoint", {}) if isinstance(backend_counts, dict) else {}
top_backend_endpoint_failures = []
if isinstance(status_by_endpoint, dict):
    rows = []
    for endpoint, codes in status_by_endpoint.items():
        if not isinstance(codes, dict):
            continue
        for code, count in codes.items():
            try:
                status_code = int(code)
                value = int(count)
            except Exception:
                continue
            if status_code >= 400:
                rows.append({"endpoint": endpoint, "status": status_code, "count": value})
    rows.sort(key=lambda row: row["count"], reverse=True)
    top_backend_endpoint_failures = rows[:10]

weak_points = report_dir / "weak-points.md"
lines = []
lines.append("# Weak Points Report")
lines.append("")
lines.append(f"- Generated at (UTC): {datetime.now(timezone.utc).isoformat()}")
lines.append(f"- Run ID: {manifest.get('runId', 'unknown')}")
lines.append(f"- Prefix: {manifest.get('prefix', 'n/a')}")
lines.append(f"- Report folder: `{report_dir}`")
lines.append("")
lines.append("## 1. Bottleneck Summary")
lines.append("")
lines.append(f"- Error rate: `{error_rate:.4f}` (gate `< {threshold_error:.4f}`)")
lines.append(f"- Read p95: `{read_p95:.1f} ms` (gate `< {threshold_read:.1f} ms`)")
lines.append(f"- Write p95: `{write_p95:.1f} ms` (gate `< {threshold_write:.1f} ms`)")
lines.append(f"- Read p99: `{read_p99:.1f} ms`")
lines.append(f"- Write p99: `{write_p99:.1f} ms`")
lines.append(f"- Status counters: 409={status_409}, 412={status_412}, 429={status_429}, 5xx={status_5xx}")
if status_counts:
    lines.append(f"- Backend log status counts: `{json.dumps(status_counts, sort_keys=True)}`")
if top_backend_endpoint_failures:
    lines.append("- Backend endpoint/status hotspots:")
    for row in top_backend_endpoint_failures[:5]:
        lines.append(f"  - `{row['endpoint']}` status `{row['status']}`: {row['count']} hits")
if auth_failures > 0:
    lines.append(f"- Auth failures: `{auth_failures}`")
if delta_lines:
    lines.append("")
    lines.append("### Latest Comparison")
    lines.extend(delta_lines)

lines.append("")
lines.append("## 2. Evidence")
lines.append("")
lines.append("- k6 summary: `k6-summary.json`")
lines.append("- k6 raw events: `k6-raw.json`")
lines.append("- Docker stats sample: `docker-stats.log`")
lines.append("- Redis queue depth sample: `redis-queue-depth.log`")
lines.append("- SQL diagnostics: `sql/pre/*.txt`, `sql/post/*.txt`")
lines.append("- Backend logs: `backend.log`")
lines.append("- Endpoint DB breakdown: `endpoint-db-breakdown.json`")
lines.append("- Queue recovery: `queue-recovery.json`")
if top_failure_ops:
    lines.append("")
    lines.append("### Top Failing Endpoint/Ops")
    for row in top_failure_ops:
        lines.append(f"- {row['op']} status {row['status']}: {row['count']} requests")
if top_latency_ops:
    lines.append("")
    lines.append("### Top Latency Endpoint/Ops")
    for row in top_latency_ops:
        lines.append(
            f"- {row['op']}: count={row['count']} fail={row['failCount']} "
            f"p95={row['p95Ms']:.1f}ms p99={row['p99Ms']:.1f}ms avg={row['avgMs']:.1f}ms"
        )

endpoint_json_path = report_dir / "endpoint-latency.json"
endpoint_json_path.write_text(json.dumps({"rows": endpoint_rows}, indent=2) + "\n")

lines.append("")
lines.append("## 3. Likely Root Causes")
lines.append("")
for idx, finding in enumerate(findings, start=1):
    lines.append(f"{idx}. **[P{finding['priority']}] {finding['title']}**")
    lines.append(f"   - Evidence: {finding['evidence']}")
    lines.append(f"   - Likely root cause: {finding['cause']}")

lines.append("")
lines.append("## 4. Concrete Fix Options")
lines.append("")
for idx, finding in enumerate(findings, start=1):
    lines.append(f"{idx}. {finding['options']}")

lines.append("")
lines.append("## 5. Expected Impact")
lines.append("")
for idx, finding in enumerate(findings, start=1):
    lines.append(f"{idx}. {finding['impact']}")

lines.append("")
lines.append("## 6. Retest Checklist")
lines.append("")
lines.append("1. Re-run quick baseline (`--mode quick`) with same run profile and compare p95 + error deltas.")
lines.append("2. Re-run soak profile (`--mode soak`) and verify queue recovery after burst intervals.")
lines.append("3. Confirm no regression in Playwright API-call probe outputs.")
lines.append("4. Verify lock-wait and top SQL diagnostics improve in post-change runs.")
lines.append("5. Keep `tests/load/reports/latest` pointer updated for side-by-side comparisons.")

weak_points.write_text("\n".join(lines) + "\n")

latest_link = load_root / "reports" / "latest"
if latest_link.exists() or latest_link.is_symlink():
    latest_link.unlink()
latest_link.symlink_to(report_dir, target_is_directory=True)
shutil.copyfile(summary_path, latest_summary_path)
PY

echo "Weak-points report written to ${REPORT_DIR}/weak-points.md"
