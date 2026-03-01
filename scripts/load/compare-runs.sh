#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOAD_REPORTS_DIR="${ROOT_DIR}/tests/load/reports"
RUNS_CSV=""
OUTPUT_FILE=""

usage() {
  cat <<'EOF'
Usage: scripts/load/compare-runs.sh --runs <report_dir[,report_dir...]> [--output <file>]

Examples:
  scripts/load/compare-runs.sh --runs tests/load/reports/20260301_071640_quick_PASSA01,tests/load/reports/20260301_074415_quick_PASSB01,tests/load/reports/20260301_075511_quick_PASSC01
  scripts/load/compare-runs.sh --runs 20260301_071640_quick_PASSA01,20260301_074415_quick_PASSB01
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs) RUNS_CSV="${2:-}"; shift 2 ;;
    --output) OUTPUT_FILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${RUNS_CSV}" ]]; then
  usage
  exit 1
fi

if [[ -z "${OUTPUT_FILE}" ]]; then
  mkdir -p "${LOAD_REPORTS_DIR}/comparisons"
  OUTPUT_FILE="${LOAD_REPORTS_DIR}/comparisons/$(date +%Y%m%d_%H%M%S)-comparison.md"
fi

python3 - "${RUNS_CSV}" "${LOAD_REPORTS_DIR}" "${OUTPUT_FILE}" <<'PY'
import json
import pathlib
import sys
from datetime import datetime, timezone


def metric(summary: dict, metric_name: str, key: str, default: float = 0.0) -> float:
    m = (summary.get("metrics") or {}).get(metric_name) or {}
    values = m.get("values") or {}
    if key in values:
        return float(values.get(key) or default)
    if key in m:
        return float(m.get(key) or default)
    if key == "rate" and "value" in m:
        return float(m.get("value") or default)
    return float(default)


def load_run(path: pathlib.Path) -> dict:
    summary_path = path / "k6-summary.json"
    if not summary_path.exists():
        raise FileNotFoundError(f"Missing k6 summary: {summary_path}")
    summary = json.loads(summary_path.read_text())
    endpoint_path = path / "endpoint-latency.json"
    endpoint_rows = []
    if endpoint_path.exists():
        endpoint_rows = (json.loads(endpoint_path.read_text()) or {}).get("rows") or []
    endpoint_rows = sorted(endpoint_rows, key=lambda row: float(row.get("p95Ms") or 0.0), reverse=True)
    slowest = endpoint_rows[0] if endpoint_rows else {}
    return {
        "name": path.name,
        "path": str(path),
        "error_rate": metric(summary, "http_errors", "rate", metric(summary, "http_req_failed", "rate", 0.0)),
        "read_p95_ms": metric(summary, "read_latency_ms", "p(95)", 0.0),
        "write_p95_ms": metric(summary, "write_latency_ms", "p(95)", 0.0),
        "status_412": int(metric(summary, "status_412", "count", 0.0)),
        "status_429": int(metric(summary, "status_429", "count", 0.0)),
        "auth_failures": int(metric(summary, "auth_failures", "count", 0.0)),
        "http_reqs": int(metric(summary, "http_reqs", "count", 0.0)),
        "slowest_op": slowest.get("op") or "",
        "slowest_p95_ms": float(slowest.get("p95Ms") or 0.0),
    }


runs_raw = [item.strip() for item in sys.argv[1].split(",") if item.strip()]
reports_root = pathlib.Path(sys.argv[2]).resolve()
output_path = pathlib.Path(sys.argv[3]).resolve()

runs = []
for run in runs_raw:
    candidate = pathlib.Path(run)
    if not candidate.is_absolute():
        candidate = pathlib.Path.cwd() / run
    if not candidate.exists():
        alt = reports_root / run
        if alt.exists():
            candidate = alt
    if not candidate.exists():
        raise FileNotFoundError(f"Run folder not found: {run}")
    runs.append(load_run(candidate.resolve()))

baseline = runs[0]

lines: list[str] = []
lines.append("# Load Run Comparison")
lines.append("")
lines.append(f"- Generated at (UTC): {datetime.now(timezone.utc).isoformat()}")
lines.append(f"- Baseline run: `{baseline['name']}`")
lines.append("")
lines.append("## Summary Metrics")
lines.append("")
lines.append("| Run | Error Rate | Read p95 (ms) | Write p95 (ms) | 412 | 429 | Auth Failures | HTTP Reqs | Slowest Op (p95 ms) |")
lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
for run in runs:
    lines.append(
        f"| `{run['name']}` | {run['error_rate']:.4f} | {run['read_p95_ms']:.1f} | "
        f"{run['write_p95_ms']:.1f} | {run['status_412']} | {run['status_429']} | {run['auth_failures']} | "
        f"{run['http_reqs']} | {run['slowest_op']} ({run['slowest_p95_ms']:.1f}) |"
    )

lines.append("")
lines.append("## Delta vs Baseline")
lines.append("")
lines.append("| Run | Error Rate Δ | Read p95 Δ (ms) | Write p95 Δ (ms) | 412 Δ | 429 Δ |")
lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
for run in runs:
    lines.append(
        f"| `{run['name']}` | {run['error_rate'] - baseline['error_rate']:+.4f} | "
        f"{run['read_p95_ms'] - baseline['read_p95_ms']:+.1f} | "
        f"{run['write_p95_ms'] - baseline['write_p95_ms']:+.1f} | "
        f"{run['status_412'] - baseline['status_412']:+d} | "
        f"{run['status_429'] - baseline['status_429']:+d} |"
    )

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text("\n".join(lines) + "\n")
print(str(output_path))
PY

echo "Comparison report written to ${OUTPUT_FILE}"
