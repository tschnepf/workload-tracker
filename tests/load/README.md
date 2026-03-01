# Load Testing Suite

This directory contains the production-like concurrency load harness for 50-100 user simulation.

## Entry points

- `scripts/load/run-load.sh` runs an end-to-end isolated load test.
- `scripts/load/analyze-load.sh` generates `weak-points.md` from run artifacts.
- `scripts/load/compare-runs.sh` builds a baseline-vs-delta markdown comparison for A/B/C runs.
- `make load-test-quick` runs the quick ramp + burst profile.
- `make load-test-soak` runs the 60-minute confirmation soak profile.

## Generated artifacts

Each run writes to:

- `tests/load/reports/<timestamp>_<mode>_<run_id>/`
- Includes raw k6 output, summary, SQL diagnostics, docker/redis telemetry, backend logs, and `weak-points.md`.

Latest pointers:

- `tests/load/reports/latest` (symlink)
- `tests/load/reports/latest-summary.json`

## Inputs

- `tests/load/config/scenario.json`: stage timings, operation weights, thresholds.
- `tests/load/data/users.json`: manager/user credential pools (auto-generated per run).
- `tests/load/data/seed-data.json`: seeded IDs/week keys for deterministic operations (auto-generated per run).

Common tuning envs:

- `DRF_THROTTLE_TOKEN_OBTAIN`, `DRF_THROTTLE_TOKEN_REFRESH`
- `ASSIGNMENTS_PAGE_CACHE_TTL_SECONDS`, `GRID_SNAPSHOT_CACHE_TTL_SECONDS`, `SNAPSHOT_CACHE_SWR_SECONDS`
- `LOAD_SCENARIO_FILE_REL` to switch scenario profiles (for reproducible pass variants)

## Notes

- The runner starts an isolated compose project using production-style settings.
- A one-time source DB snapshot is stored at `tests/load/data/source_snapshot.sql.gz` and restored into the isolated DB.
- Test data is namespaced with `LT_<run_id>_` for cleanup/attribution.
