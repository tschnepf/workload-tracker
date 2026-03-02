"""Helpers for workload-aware token parsing and filtering."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
import re
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

from django.db.models import QuerySet, Sum

from assignments.models import AssignmentWeekHour
from core.search_tokens import Token
from core.week_utils import sunday_of_week


_COMPARATOR_RE = re.compile(r"^(<=|>=|<|>)(\d+(?:\.\d+)?)$")
_RANGE_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$")

_ALIAS_KEYWORDS = {
    "underloaded": "available",
    "overloaded": "overallocated",
}

_CANONICAL_KEYWORDS = {
    "available",
    "optimal",
    "full",
    "overallocated",
}


@dataclass(frozen=True)
class UtilizationBands:
    blue_min: float
    blue_max: float
    green_min: float
    green_max: float
    orange_min: float
    orange_max: float
    red_min: float


@dataclass(frozen=True)
class WorkloadClause:
    kind: str
    value: float | None = None
    lower: float | None = None
    upper: float | None = None


@dataclass(frozen=True)
class WorkloadExpression:
    canonical_term: str
    clauses: Tuple[WorkloadClause, ...]


def normalize_workload_keyword(term: str) -> str:
    lowered = (term or "").strip().lower()
    lowered = _ALIAS_KEYWORDS.get(lowered, lowered)
    return lowered


def parse_workload_expression(term: str, bands: UtilizationBands) -> WorkloadExpression | None:
    lowered = normalize_workload_keyword(term)
    if not lowered:
        return None

    if lowered in _CANONICAL_KEYWORDS:
        if lowered == "available":
            return WorkloadExpression(
                canonical_term=lowered,
                clauses=(WorkloadClause(kind="range", lower=bands.blue_min, upper=bands.blue_max),),
            )
        if lowered == "optimal":
            return WorkloadExpression(
                canonical_term=lowered,
                clauses=(WorkloadClause(kind="range", lower=bands.green_min, upper=bands.green_max),),
            )
        if lowered == "full":
            return WorkloadExpression(
                canonical_term=lowered,
                clauses=(WorkloadClause(kind="range", lower=bands.orange_min, upper=bands.orange_max),),
            )
        return WorkloadExpression(
            canonical_term=lowered,
            clauses=(WorkloadClause(kind="gte", value=bands.red_min),),
        )

    parts = [part.strip() for part in lowered.split(",") if part.strip()]
    if not parts:
        return None

    clauses: List[WorkloadClause] = []
    normalized_parts: List[str] = []
    for part in parts:
        comparator = _COMPARATOR_RE.match(part)
        if comparator:
            op = comparator.group(1)
            value = float(comparator.group(2))
            kind = {
                "<": "lt",
                "<=": "lte",
                ">": "gt",
                ">=": "gte",
            }[op]
            clauses.append(WorkloadClause(kind=kind, value=value))
            normalized_parts.append(f"{op}{_format_number(value)}")
            continue

        range_match = _RANGE_RE.match(part)
        if range_match:
            lower = float(range_match.group(1))
            upper = float(range_match.group(2))
            if lower > upper:
                return None
            clauses.append(WorkloadClause(kind="range", lower=lower, upper=upper))
            normalized_parts.append(f"{_format_number(lower)}-{_format_number(upper)}")
            continue

        return None

    if not clauses:
        return None
    return WorkloadExpression(
        canonical_term=", ".join(normalized_parts),
        clauses=tuple(clauses),
    )


def is_workload_expression(term: str, bands: UtilizationBands) -> bool:
    return parse_workload_expression(term, bands) is not None


def resolve_workload_window(
    *,
    week_start_raw: object | None,
    weeks_raw: object | None,
    today: date | None = None,
) -> tuple[date, int]:
    now = today or date.today()
    week_start = sunday_of_week(now)
    if isinstance(week_start_raw, str) and week_start_raw.strip():
        try:
            parsed = date.fromisoformat(week_start_raw.strip())
            week_start = sunday_of_week(parsed)
        except Exception:
            pass

    weeks = 1
    try:
        weeks = int(weeks_raw or 1)
    except Exception:
        weeks = 1
    weeks = max(1, min(52, weeks))
    return week_start, weeks


def week_window_dates(week_start: date, weeks: int) -> List[date]:
    return [week_start + timedelta(weeks=i) for i in range(max(1, int(weeks or 1)))]


def build_person_week_totals(
    *,
    assignments_qs: QuerySet,
    week_start: date,
    weeks: int,
) -> Dict[int, Dict[str, float]]:
    dates = week_window_dates(week_start, weeks)
    if not dates:
        return {}
    assignment_ids = assignments_qs.values("id")
    rows = (
        AssignmentWeekHour.objects
        .filter(
            assignment_id__in=assignment_ids,
            person_id__isnull=False,
            week_start__in=dates,
            assignment__is_active=True,
        )
        .values("person_id", "week_start")
        .annotate(total_hours=Sum("hours"))
    )
    out: Dict[int, Dict[str, float]] = {}
    for row in rows:
        person_id = row.get("person_id")
        week_key = row.get("week_start")
        if not person_id or not week_key:
            continue
        hours = round(float(row.get("total_hours") or 0.0), 2)
        person_map = out.setdefault(int(person_id), {})
        person_map[week_key.isoformat()] = hours
    return out


def matches_expression(hours: float, expression: WorkloadExpression) -> bool:
    value = float(hours or 0.0)
    for clause in expression.clauses:
        kind = clause.kind
        if kind == "lt":
            if not value < float(clause.value or 0.0):
                return False
            continue
        if kind == "lte":
            if not value <= float(clause.value or 0.0):
                return False
            continue
        if kind == "gt":
            if not value > float(clause.value or 0.0):
                return False
            continue
        if kind == "gte":
            if not value >= float(clause.value or 0.0):
                return False
            continue
        if kind == "range":
            lower = float(clause.lower or 0.0)
            upper = float(clause.upper or 0.0)
            if not (value >= lower and value <= upper):
                return False
            continue
        return False
    return True


def match_people_for_expression(
    person_week_totals: Mapping[int, Mapping[str, float]],
    expression: WorkloadExpression,
) -> Set[int]:
    matched: Set[int] = set()
    for person_id, week_map in person_week_totals.items():
        for hours in (week_map or {}).values():
            if matches_expression(float(hours or 0.0), expression):
                matched.add(int(person_id))
                break
    return matched


def combine_token_match_sets(
    *,
    tokens: Sequence[Token],
    token_sets: Sequence[Set[int]],
    universe: Iterable[int],
) -> Set[int]:
    token_list = list(tokens)
    match_sets = list(token_sets)
    universe_set = set(int(v) for v in universe)
    if not token_list:
        return universe_set

    acc_and: Set[int] = set(universe_set)
    acc_or: Set[int] = set()
    has_or = False

    for index, token in enumerate(token_list):
        op = str(token.get("op") or "or").lower()
        matches = set(match_sets[index] if index < len(match_sets) else set())
        if op == "not":
            acc_and -= matches
        elif op == "and":
            acc_and &= matches
        else:
            has_or = True
            acc_or |= matches

    if has_or:
        acc_and &= acc_or
    return acc_and


def _format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value}".rstrip("0").rstrip(".")
