from __future__ import annotations

import hashlib
import json
import logging
import math
from time import perf_counter
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.db.utils import OperationalError, ProgrammingError
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer

from accounts.permissions import IsAdminOrManager, is_admin_or_manager
from core.models import AutoHoursTemplate
from core.project_visibility import resolve_visibility_scope, visibility_cache_token
from departments.models import Department
from departments.serializers import DepartmentSerializer
from projects.status_definitions import get_status_definition_index
from roles.models import Role

from .forecast_planner import (
    build_scope,
    clamp_weeks,
    evaluate_forecast_planner,
    get_default_status_keys,
    normalize_status_keys,
    parse_int,
)
from .models import ForecastScenario

logger = logging.getLogger(__name__)


def _is_planner_enabled() -> bool:
    return bool(settings.FEATURES.get("FORECAST_PLANNER_V2", True))


def _feature_flag_guard() -> Response | None:
    if _is_planner_enabled():
        return None
    return Response({"detail": "Forecast Planner V2 is disabled"}, status=status.HTTP_404_NOT_FOUND)


def _parse_scope_from_request(request) -> tuple[int, int | None, bool, int | None]:
    weeks = clamp_weeks(request.query_params.get("weeks"), 26)
    department = parse_int(request.query_params.get("department"), None)
    include_children = str(request.query_params.get("include_children") or "").strip().lower() in {"1", "true", "yes", "on"}
    vertical = parse_int(request.query_params.get("vertical"), None)
    return weeks, department, include_children, vertical


def _serialize_status_definitions() -> list[dict[str, Any]]:
    rows = list(get_status_definition_index().values())
    rows.sort(key=lambda item: (int(item.get("sortOrder") or 0), str(item.get("label") or ""), str(item.get("key") or "")))
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "key": row.get("key"),
                "label": row.get("label"),
                "colorHex": row.get("colorHex"),
                "includeInAnalytics": bool(row.get("includeInAnalytics", False)),
                "treatAsCaWhenNoDeliverable": bool(row.get("treatAsCaWhenNoDeliverable", False)),
                "isSystem": bool(row.get("isSystem", False)),
                "isActive": bool(row.get("isActive", True)),
                "sortOrder": int(row.get("sortOrder") or 0),
            }
        )
    return out


def _serialize_templates() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for template in AutoHoursTemplate.objects.filter(is_active=True).order_by("name").only(
        "id",
        "name",
        "description",
        "is_active",
        "phase_keys",
        "weeks_by_phase",
    ):
        out.append(
            {
                "id": int(template.id),
                "name": template.name,
                "description": template.description or "",
                "isActive": bool(template.is_active),
                "phaseKeys": template.phase_keys or [],
                "weeksByPhase": template.weeks_by_phase or {},
            }
        )
    return out


def _serialize_roles() -> list[dict[str, Any]]:
    return [{"id": int(role.id), "name": role.name} for role in Role.objects.filter(is_active=True).order_by("sort_order", "name").only("id", "name")]


def _scenario_response_payload(item: ForecastScenario) -> dict[str, Any]:
    def _sanitize_json(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return value if math.isfinite(value) else None
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return [_sanitize_json(v) for v in value]
        if isinstance(value, dict):
            return {str(k): _sanitize_json(v) for k, v in value.items()}
        return str(value)

    return {
        "id": int(item.id or 0),
        "name": item.name,
        "description": item.description or "",
        "ownerId": int(item.owner_id or 0),
        "isShared": bool(item.is_shared),
        "sharedToken": item.shared_token if item.is_shared else None,
        "scenarioConfig": _sanitize_json(item.scenario_config or {}),
        "lastResult": _sanitize_json(item.last_result or {}),
        "lastEvaluatedAt": item.last_evaluated_at,
        "createdAt": item.created_at,
        "updatedAt": item.updated_at,
    }


def _evaluate_cache_key(payload: dict[str, Any]) -> str:
    normalized = {
        "weeks": payload.get("weeks"),
        "department": payload.get("department"),
        "includeChildren": bool(payload.get("include_children") or payload.get("includeChildren")),
        "vertical": payload.get("vertical"),
        "visibilityScope": payload.get("visibilityScope"),
        "visibilityToken": payload.get("visibilityToken"),
        "statusKeys": sorted(payload.get("statusKeys") if isinstance(payload.get("statusKeys"), list) else []),
        "projects": payload.get("projects") if isinstance(payload.get("projects"), list) else [],
        "thresholds": payload.get("thresholds") if isinstance(payload.get("thresholds"), dict) else {},
        "useProbabilityWeighting": bool(payload.get("useProbabilityWeighting")),
    }
    raw = json.dumps(normalized, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"forecast:planner:evaluate:{digest}"


def _scenario_storage_error_response(exc: Exception | None = None) -> Response:
    message = "Forecast scenario storage is unavailable. Run database migrations and retry."
    detail = str(exc) if exc is not None else ""
    return Response(
        {
            "detail": message,
            "migrationHint": "python manage.py migrate reports",
            "error": detail[:500],
        },
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


class ForecastPlannerBootstrapView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        parameters=[
            OpenApiParameter(name="weeks", type=int, required=False, description="Weeks horizon (1-52), default 26"),
            OpenApiParameter(name="department", type=int, required=False),
            OpenApiParameter(name="include_children", type=bool, required=False, description="Include descendant departments"),
            OpenApiParameter(name="vertical", type=int, required=False),
            OpenApiParameter(name="visibility_scope", type=str, required=False, description="Visibility scope key for keyword-based project/client exclusion."),
        ],
        responses=inline_serializer(
            name="ForecastPlannerBootstrapResponse",
            fields={
                "departments": serializers.ListField(child=serializers.DictField()),
                "roles": serializers.ListField(child=serializers.DictField()),
                "statusDefinitions": serializers.ListField(child=serializers.DictField()),
                "defaultIncludedStatusKeys": serializers.ListField(child=serializers.CharField()),
                "templates": serializers.ListField(child=serializers.DictField()),
                "baselineEvaluation": serializers.DictField(),
            },
        ),
    )
    def get(self, request):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp

        weeks, department_id, include_children, vertical_id = _parse_scope_from_request(request)
        visibility_scope = resolve_visibility_scope(
            request.query_params.get("visibility_scope"),
            default_scope="report.forecast_planner",
        )
        scope = build_scope(
            weeks=weeks,
            department_id=department_id,
            include_children=include_children,
            vertical_id=vertical_id,
        )
        default_status_keys = get_default_status_keys()
        baseline = evaluate_forecast_planner(
            scope=scope,
            status_keys=default_status_keys,
            projects_payload=[],
            thresholds_payload=None,
            use_probability_weighting=False,
            visibility_scope=visibility_scope,
        )

        departments_qs = Department.objects.filter(is_active=True).order_by("name")
        if vertical_id is not None:
            departments_qs = departments_qs.filter(vertical_id=vertical_id)
        departments = DepartmentSerializer(list(departments_qs), many=True).data

        return Response(
            {
                "departments": departments,
                "roles": _serialize_roles(),
                "statusDefinitions": _serialize_status_definitions(),
                "defaultIncludedStatusKeys": default_status_keys,
                "templates": _serialize_templates(),
                "baselineEvaluation": baseline,
            }
        )


class ForecastPlannerEvaluateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        request=inline_serializer(
            name="ForecastPlannerEvaluateRequest",
            fields={
                "weeks": serializers.IntegerField(required=False),
                "department": serializers.IntegerField(required=False, allow_null=True),
                "include_children": serializers.BooleanField(required=False),
                "vertical": serializers.IntegerField(required=False, allow_null=True),
                "statusKeys": serializers.ListField(child=serializers.CharField(), required=False),
                "projects": serializers.ListField(child=serializers.DictField(), required=False),
                "thresholds": serializers.DictField(required=False),
                "useProbabilityWeighting": serializers.BooleanField(required=False),
            },
        ),
        responses=inline_serializer(name="ForecastPlannerEvaluateResponse", fields={"result": serializers.DictField()}),
    )
    def post(self, request):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp

        started_at = perf_counter()
        payload = request.data if isinstance(request.data, dict) else {}
        weeks = clamp_weeks(payload.get("weeks"), 26)
        department_id = parse_int(payload.get("department"), None)
        include_children = bool(payload.get("include_children") or payload.get("includeChildren") or False)
        vertical_id = parse_int(payload.get("vertical"), None)
        status_keys_raw = payload.get("statusKeys")
        status_keys, invalid_statuses = normalize_status_keys(status_keys_raw if isinstance(status_keys_raw, list) else [])
        if invalid_statuses:
            return Response(
                {"detail": "invalid status keys", "invalidStatusKeys": invalid_statuses},
                status=status.HTTP_400_BAD_REQUEST,
            )

        projects_payload = payload.get("projects") if isinstance(payload.get("projects"), list) else []
        scope = build_scope(
            weeks=weeks,
            department_id=department_id,
            include_children=include_children,
            vertical_id=vertical_id,
        )
        projects_clean = [item for item in projects_payload if isinstance(item, dict)]
        use_probability_weighting = bool(payload.get("useProbabilityWeighting"))
        thresholds_payload = payload.get("thresholds") if isinstance(payload.get("thresholds"), dict) else None
        visibility_scope = "report.forecast_planner"
        visibility_token = visibility_cache_token(visibility_scope)
        use_cache = bool(settings.FEATURES.get("SHORT_TTL_AGGREGATES", False))
        cache_key = _evaluate_cache_key(
            {
                "weeks": weeks,
                "department": department_id,
                "include_children": include_children,
                "vertical": vertical_id,
                "visibilityScope": visibility_scope,
                "visibilityToken": visibility_token,
                "statusKeys": status_keys,
                "projects": projects_clean,
                "thresholds": thresholds_payload or {},
                "useProbabilityWeighting": use_probability_weighting,
            }
        )
        result: dict[str, Any] | None = cache.get(cache_key) if use_cache else None
        from_cache = result is not None
        if result is None:
            result = evaluate_forecast_planner(
                scope=scope,
                status_keys=status_keys,
                projects_payload=projects_clean,
                thresholds_payload=thresholds_payload,
                use_probability_weighting=use_probability_weighting,
                visibility_scope=visibility_scope,
            )
            if use_cache:
                cache.set(cache_key, result, timeout=120)
        elapsed_ms = int((perf_counter() - started_at) * 1000)
        payload_size = len(json.dumps(result, default=str))
        logger.info(
            "forecast_planner.evaluate duration_ms=%s payload_bytes=%s weeks=%s status_count=%s projects=%s cached=%s",
            elapsed_ms,
            payload_size,
            weeks,
            len(status_keys),
            len(projects_clean),
            from_cache,
        )
        return Response({"result": result})


class ForecastScenarioListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(responses=inline_serializer(name="ForecastScenarioListResponse", fields={"results": serializers.ListField(child=serializers.DictField())}))
    def get(self, request):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp
        try:
            query = ForecastScenario.objects.filter(owner=request.user).order_by("-updated_at")
            rows: list[dict[str, Any]] = []
            for item in query:
                try:
                    rows.append(_scenario_response_payload(item))
                except Exception:
                    logger.exception("forecast_planner.scenario_serialize_failed scenario_id=%s", getattr(item, "id", None))
            return Response({"results": rows})
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        except Exception as exc:
            logger.exception("forecast_planner.scenario_list_failed")
            return Response({"detail": f"Failed to list forecast scenarios: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        request=inline_serializer(
            name="ForecastScenarioCreateRequest",
            fields={
                "name": serializers.CharField(),
                "description": serializers.CharField(required=False),
                "scenarioConfig": serializers.DictField(required=False),
                "lastResult": serializers.DictField(required=False),
                "isShared": serializers.BooleanField(required=False),
            },
        ),
        responses=inline_serializer(name="ForecastScenarioCreateResponse", fields={"scenario": serializers.DictField()}),
    )
    def post(self, request):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp
        payload = request.data if isinstance(request.data, dict) else {}
        name = str(payload.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item = ForecastScenario.objects.create(
                owner=request.user,
                name=name,
                description=str(payload.get("description") or "").strip(),
                is_shared=bool(payload.get("isShared")),
                scenario_config=payload.get("scenarioConfig") if isinstance(payload.get("scenarioConfig"), dict) else {},
                last_result=payload.get("lastResult") if isinstance(payload.get("lastResult"), dict) else {},
                last_evaluated_at=timezone.now(),
            )
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        try:
            return Response({"scenario": _scenario_response_payload(item)}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            logger.exception("forecast_planner.scenario_create_serialize_failed scenario_id=%s", getattr(item, "id", None))
            return Response({"detail": f"Scenario created but response serialization failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ForecastScenarioDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def _get_owned(self, request, scenario_id: int) -> ForecastScenario | None:
        try:
            return ForecastScenario.objects.filter(id=scenario_id, owner=request.user).first()
        except (ProgrammingError, OperationalError):
            return None

    @extend_schema(responses=inline_serializer(name="ForecastScenarioDetailResponse", fields={"scenario": serializers.DictField()}))
    def get(self, request, scenario_id: int):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp
        try:
            item = self._get_owned(request, scenario_id)
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        if not item:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response({"scenario": _scenario_response_payload(item)})
        except Exception as exc:
            logger.exception("forecast_planner.scenario_detail_serialize_failed scenario_id=%s", scenario_id)
            return Response({"detail": f"Failed to load scenario payload: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        request=inline_serializer(
            name="ForecastScenarioPatchRequest",
            fields={
                "name": serializers.CharField(required=False),
                "description": serializers.CharField(required=False),
                "scenarioConfig": serializers.DictField(required=False),
                "lastResult": serializers.DictField(required=False),
                "isShared": serializers.BooleanField(required=False),
            },
        ),
        responses=inline_serializer(name="ForecastScenarioPatchResponse", fields={"scenario": serializers.DictField()}),
    )
    def patch(self, request, scenario_id: int):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp
        try:
            item = self._get_owned(request, scenario_id)
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        if not item:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        payload = request.data if isinstance(request.data, dict) else {}
        if "name" in payload:
            name = str(payload.get("name") or "").strip()
            if not name:
                return Response({"detail": "name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            item.name = name
        if "description" in payload:
            item.description = str(payload.get("description") or "").strip()
        if "isShared" in payload:
            item.is_shared = bool(payload.get("isShared"))
        if "scenarioConfig" in payload and isinstance(payload.get("scenarioConfig"), dict):
            item.scenario_config = payload.get("scenarioConfig") or {}
        if "lastResult" in payload and isinstance(payload.get("lastResult"), dict):
            item.last_result = payload.get("lastResult") or {}
            item.last_evaluated_at = timezone.now()
        try:
            item.save()
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        try:
            return Response({"scenario": _scenario_response_payload(item)})
        except Exception as exc:
            logger.exception("forecast_planner.scenario_patch_serialize_failed scenario_id=%s", scenario_id)
            return Response({"detail": f"Scenario saved but response serialization failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(responses=inline_serializer(name="ForecastScenarioDeleteResponse", fields={"detail": serializers.CharField()}))
    def delete(self, request, scenario_id: int):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp
        try:
            item = self._get_owned(request, scenario_id)
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        if not item:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            item.delete()
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        return Response({"detail": "deleted"})


class ForecastScenarioSharedView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=inline_serializer(name="ForecastScenarioSharedResponse", fields={"scenario": serializers.DictField()}))
    def get(self, request, token: str):
        feature_resp = _feature_flag_guard()
        if feature_resp is not None:
            return feature_resp

        try:
            item = ForecastScenario.objects.filter(shared_token=token).first()
        except (ProgrammingError, OperationalError) as exc:
            return _scenario_storage_error_response(exc)
        if not item:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        if not item.is_shared and item.owner_id != request.user.id and not is_admin_or_manager(request.user):
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        try:
            return Response({"scenario": _scenario_response_payload(item)})
        except Exception as exc:
            logger.exception("forecast_planner.scenario_shared_serialize_failed token=%s", token)
            return Response({"detail": f"Failed to load shared scenario payload: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
