from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import Q

from projects.models import Project

VISIBILITY_SCOPE_CATALOG: tuple[dict[str, str], ...] = (
    {"key": "report.network_graph", "label": "Network Graph", "group": "Reports"},
    {"key": "report.person_report", "label": "Person Report", "group": "Reports"},
    {"key": "report.role_capacity", "label": "Role Capacity", "group": "Reports"},
    {"key": "report.team_forecast", "label": "Team Forecast", "group": "Reports"},
    {"key": "report.forecast_planner", "label": "Forecast Planner", "group": "Reports"},
    {"key": "dashboard.executive", "label": "Executive Dashboard", "group": "Dashboards"},
    {"key": "dashboard.manager", "label": "Manager Dashboard", "group": "Dashboards"},
    {"key": "dashboard.heatmap", "label": "Capacity Heat Map", "group": "Dashboards"},
    {"key": "analytics.by_client", "label": "Assigned Hours by Client", "group": "Analytics"},
    {"key": "analytics.client_projects", "label": "Assigned Hours by Client Projects", "group": "Analytics"},
    {"key": "analytics.status_timeline", "label": "Assigned Hours Status Timeline", "group": "Analytics"},
    {"key": "analytics.deliverable_timeline", "label": "Assigned Hours Deliverable Timeline", "group": "Analytics"},
    {"key": "analytics.role_capacity", "label": "Role Capacity Timeline", "group": "Analytics"},
)
VISIBILITY_SCOPE_KEYS: set[str] = {item["key"] for item in VISIBILITY_SCOPE_CATALOG}


@dataclass(frozen=True)
class ScopeKeywords:
    project_keywords: list[str]
    client_keywords: list[str]


def _normalize_keywords(raw: Any) -> list[str]:
    if not isinstance(raw, (list, tuple)):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        token = " ".join(str(item or "").strip().lower().split())
        if not token or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def default_visibility_config() -> dict[str, dict[str, list[str]]]:
    config = {
        scope: {"projectKeywords": [], "clientKeywords": []}
        for scope in VISIBILITY_SCOPE_KEYS
    }
    for scope in ("report.network_graph", "report.person_report"):
        config[scope] = {
            "projectKeywords": ["overhead"],
            "clientKeywords": ["smc"],
        }
    return config


def normalize_visibility_config(raw: Any) -> dict[str, dict[str, list[str]]]:
    normalized = default_visibility_config()
    if not isinstance(raw, dict):
        return normalized
    for scope_key, scope_value in raw.items():
        if scope_key not in VISIBILITY_SCOPE_KEYS or not isinstance(scope_value, dict):
            continue
        project_keywords = _normalize_keywords(
            scope_value.get("projectKeywords", scope_value.get("project_keywords", []))
        )
        client_keywords = _normalize_keywords(
            scope_value.get("clientKeywords", scope_value.get("client_keywords", []))
        )
        normalized[scope_key] = {
            "projectKeywords": project_keywords,
            "clientKeywords": client_keywords,
        }
    return normalized


def resolve_visibility_scope(raw: str | None, default_scope: str) -> str:
    candidate = str(raw or "").strip().lower()
    if candidate in VISIBILITY_SCOPE_KEYS:
        return candidate
    return default_scope


def get_scope_keywords(scope_key: str) -> ScopeKeywords:
    from core.models import ProjectVisibilitySettings

    obj = ProjectVisibilitySettings.get_active()
    config = normalize_visibility_config(getattr(obj, "config_json", None))
    entry = config.get(scope_key, {"projectKeywords": [], "clientKeywords": []})
    return ScopeKeywords(
        project_keywords=list(entry.get("projectKeywords") or []),
        client_keywords=list(entry.get("clientKeywords") or []),
    )


def get_hidden_project_ids_for_scope(scope_key: str) -> set[int]:
    keywords = get_scope_keywords(scope_key)
    if not keywords.project_keywords and not keywords.client_keywords:
        return set()
    query = Q()
    for keyword in keywords.project_keywords:
        query |= Q(name__icontains=keyword)
    for keyword in keywords.client_keywords:
        query |= Q(client__icontains=keyword)
    return set(Project.objects.filter(query).values_list("id", flat=True))


def visibility_cache_token(scope_key: str) -> str:
    from core.models import ProjectVisibilitySettings

    obj = ProjectVisibilitySettings.get_active()
    timestamp = obj.updated_at.isoformat() if getattr(obj, "updated_at", None) else "none"
    return f"{scope_key}:{timestamp}"


def apply_project_visibility_filters(
    queryset,
    *,
    scope_key: str,
    project_id_field: str,
    project_name_field: str | None = None,
    client_field: str | None = None,
    extra_project_ids: set[int] | None = None,
):
    keywords = get_scope_keywords(scope_key)
    hidden_ids = set(extra_project_ids or set())
    hidden_ids.update(get_hidden_project_ids_for_scope(scope_key))

    query = Q()
    if hidden_ids:
        query |= Q(**{f"{project_id_field}__in": sorted(hidden_ids)})
    if project_name_field:
        for keyword in keywords.project_keywords:
            query |= Q(**{f"{project_name_field}__icontains": keyword})
    if client_field:
        for keyword in keywords.client_keywords:
            query |= Q(**{f"{client_field}__icontains": keyword})
    if not query.children:
        return queryset
    return queryset.exclude(query)
