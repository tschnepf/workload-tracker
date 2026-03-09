from __future__ import annotations

import re
from typing import Any


AUTO_HOURS_DEFAULT_MILESTONE_KEYS = ["sd", "dd", "ifp", "ifc"]
AUTO_HOURS_DEFAULT_WEEKS_COUNT = 6
AUTO_HOURS_MAX_WEEKS_COUNT = 18
AUTO_HOURS_SOURCE_GLOBAL = "global"
AUTO_HOURS_SOURCE_TEMPLATE_LOCAL = "template_local"
_MILESTONE_KEY_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_milestone_key(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value


def is_valid_milestone_key(key: str) -> bool:
    return bool(_MILESTONE_KEY_RE.match(str(key or "")))


def normalize_phase_keys(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        key = normalize_milestone_key(item)
        if key and key not in out:
            out.append(key)
    return out


def coerce_weeks_count(raw: Any, *, default: int = AUTO_HOURS_DEFAULT_WEEKS_COUNT) -> int:
    try:
        value = int(raw)
    except Exception:
        value = default
    return max(0, min(AUTO_HOURS_MAX_WEEKS_COUNT, value))


def default_template_milestones(*, phase_label_by_key: dict[str, str] | None = None) -> list[dict[str, Any]]:
    labels = phase_label_by_key or {}
    out: list[dict[str, Any]] = []
    for idx, key in enumerate(AUTO_HOURS_DEFAULT_MILESTONE_KEYS):
        out.append(
            {
                "key": key,
                "label": str(labels.get(key) or key.upper()),
                "weeksCount": AUTO_HOURS_DEFAULT_WEEKS_COUNT,
                "sortOrder": idx,
                "sourceType": AUTO_HOURS_SOURCE_GLOBAL,
                "globalPhaseKey": key,
            }
        )
    return out


def milestones_from_legacy(
    *,
    phase_keys: Any,
    weeks_by_phase: Any,
    global_phase_keys: set[str] | None = None,
    phase_label_by_key: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    normalized_keys = normalize_phase_keys(phase_keys)
    weeks_map = weeks_by_phase if isinstance(weeks_by_phase, dict) else {}
    label_map = phase_label_by_key or {}
    global_keys = set(global_phase_keys or set())

    if not normalized_keys:
        return default_template_milestones(phase_label_by_key=label_map)

    out: list[dict[str, Any]] = []
    for idx, key in enumerate(normalized_keys):
        source_type = AUTO_HOURS_SOURCE_GLOBAL if (not global_keys or key in global_keys) else AUTO_HOURS_SOURCE_TEMPLATE_LOCAL
        row: dict[str, Any] = {
            "key": key,
            "label": str(label_map.get(key) or key.upper()),
            "weeksCount": coerce_weeks_count(weeks_map.get(key)),
            "sortOrder": idx,
            "sourceType": source_type,
        }
        if source_type == AUTO_HOURS_SOURCE_GLOBAL:
            row["globalPhaseKey"] = key
        out.append(row)
    return out


def milestones_to_legacy(milestones: list[dict[str, Any]]) -> tuple[list[str], dict[str, int]]:
    phase_keys: list[str] = []
    weeks_by_phase: dict[str, int] = {}
    for row in milestones or []:
        key = normalize_milestone_key(row.get("key"))
        if not key or key in phase_keys:
            continue
        phase_keys.append(key)
        weeks_by_phase[key] = coerce_weeks_count(row.get("weeksCount"))
    return phase_keys, weeks_by_phase


def normalize_milestones_payload(
    raw: Any,
    *,
    global_phase_keys: set[str] | None = None,
    phase_label_by_key: dict[str, str] | None = None,
    require_non_empty: bool = True,
) -> tuple[list[dict[str, Any]] | None, str | None]:
    if raw is None:
        return None, None
    if not isinstance(raw, list):
        return None, "milestones must be a list"
    if require_non_empty and not raw:
        return None, "milestones must include at least one milestone"

    label_map = phase_label_by_key or {}
    global_keys = set(global_phase_keys or set())
    sortable: list[tuple[int, int, dict[str, Any]]] = []
    for idx, row in enumerate(raw):
        if not isinstance(row, dict):
            return None, f"milestones[{idx}] must be an object"
        sort_order = row.get("sortOrder", idx)
        try:
            sort_val = int(sort_order)
        except Exception:
            sort_val = idx
        sortable.append((sort_val, idx, row))
    sortable.sort(key=lambda item: (item[0], item[1]))

    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for out_idx, (_, in_idx, row) in enumerate(sortable):
        key = normalize_milestone_key(row.get("key"))
        if not key:
            return None, f"milestones[{in_idx}].key is required"
        if not is_valid_milestone_key(key):
            return None, f"milestones[{in_idx}].key must be a normalized slug"
        if key in seen:
            return None, f"milestones[{in_idx}].key must be unique"
        seen.add(key)

        label = str(row.get("label") or "").strip() or str(label_map.get(key) or key.upper())
        weeks_count = coerce_weeks_count(row.get("weeksCount"))
        if str(row.get("weeksCount", "")).strip() != "":
            try:
                parsed_weeks = int(row.get("weeksCount"))
            except Exception:
                return None, f"milestones[{in_idx}].weeksCount must be an integer"
            if parsed_weeks < 0 or parsed_weeks > AUTO_HOURS_MAX_WEEKS_COUNT:
                return None, (
                    f"milestones[{in_idx}].weeksCount must be between 0 and {AUTO_HOURS_MAX_WEEKS_COUNT}"
                )

        source_type = str(row.get("sourceType") or "").strip().lower()
        if source_type not in {AUTO_HOURS_SOURCE_GLOBAL, AUTO_HOURS_SOURCE_TEMPLATE_LOCAL}:
            source_type = AUTO_HOURS_SOURCE_GLOBAL if key in global_keys else AUTO_HOURS_SOURCE_TEMPLATE_LOCAL

        global_phase_key = normalize_milestone_key(row.get("globalPhaseKey"))
        if source_type == AUTO_HOURS_SOURCE_GLOBAL:
            if not global_phase_key:
                global_phase_key = key
            if global_keys and global_phase_key not in global_keys:
                return None, f"milestones[{in_idx}].globalPhaseKey must match an existing global phase key"
        else:
            global_phase_key = ""

        item: dict[str, Any] = {
            "key": key,
            "label": label,
            "weeksCount": weeks_count,
            "sortOrder": out_idx,
            "sourceType": source_type,
        }
        if source_type == AUTO_HOURS_SOURCE_GLOBAL:
            item["globalPhaseKey"] = global_phase_key
        normalized.append(item)

    if require_non_empty and not normalized:
        return None, "milestones must include at least one milestone"
    return normalized, None
