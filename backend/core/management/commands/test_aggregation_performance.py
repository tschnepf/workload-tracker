import json
import time
from typing import Any, Dict

from django.core.management.base import BaseCommand, CommandParser
from django.conf import settings
from django.test import Client
from django.db import connections


class Command(BaseCommand):
    help = "Benchmark aggregation endpoints and (optionally) report query counts (DEBUG only)."

    def add_arguments(self, parser: CommandParser) -> None:  # type: ignore[override]
        parser.add_argument('--endpoint', choices=[
            'grid_snapshot', 'capacity_heatmap', 'find_available', 'skill_match', 'project_availability', 'all'
        ], default='all')
        parser.add_argument('--weeks', type=int, default=12)
        parser.add_argument('--department', type=int)
        parser.add_argument('--include-children', type=int, choices=[0, 1], default=0)
        parser.add_argument('--skills', type=str, help='Comma-separated skill names for skill_match/find_available')
        parser.add_argument('--project', type=int, help='Project ID for project_availability')
        parser.add_argument('--bearer', type=str, help='Optional Bearer token for authenticated endpoints')
        parser.add_argument('--explain', action='store_true', help='Include EXPLAIN (ANALYZE, BUFFERS) for representative ORM queries (DEBUG only)')

    def _measure(self, client: Client, method: str, path: str) -> Dict[str, Any]:
        # Clear per-connection query log (DEBUG only)
        for alias in connections:
            try:
                connections[alias].queries_log.clear()  # type: ignore[attr-defined]
            except Exception:
                pass
        t0 = time.perf_counter()
        extra = {'HTTP_HOST': 'localhost'}
        bearer = getattr(self, '_bearer', None)
        if bearer:
            extra['HTTP_AUTHORIZATION'] = f'Bearer {bearer}'
        resp = client.get(path, **extra) if method.upper() == 'GET' else client.patch(path, **extra)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        try:
            data = resp.json()
        except Exception:
            data = None
        queries = None
        if settings.DEBUG:
            # Sum queries across connections
            total = 0
            for alias in connections:
                try:
                    total += len(connections[alias].queries)
                except Exception:
                    pass
            queries = total
        return {
            'status': resp.status_code,
            'duration_ms': round(dt_ms, 2),
            'queries': queries,
            'content_preview': (str(data)[:200] if data is not None else None),
        }

    def handle(self, *args, **options):  # type: ignore[override]
        client = Client()
        weeks = int(options['weeks'])
        dept = options.get('department')
        inc = int(options.get('include_children') or 0)
        skills = options.get('skills') or ''
        endpoint = options['endpoint']
        project_id = options.get('project')
        self._bearer = options.get('bearer')

        results: Dict[str, Any] = {}
        base_params = []
        if weeks:
            base_params.append(f"weeks={weeks}")
        if dept is not None:
            base_params.append(f"department={dept}")
            base_params.append(f"include_children={inc}")
        qs = ('?' + '&'.join(base_params)) if base_params else ''

        def add(name: str, info: Dict[str, Any]):
            results[name] = info

        if endpoint in ('grid_snapshot', 'all'):
            add('grid_snapshot', self._measure(client, 'GET', f"/api/assignments/grid_snapshot/{qs}"))

        if endpoint in ('capacity_heatmap', 'all'):
            add('capacity_heatmap', self._measure(client, 'GET', f"/api/people/capacity_heatmap/{qs}"))

        if endpoint in ('find_available', 'all'):
            params = [f"week="]  # week is optional; backend normalizes current Monday when omitted
            if skills:
                params.append(f"skills={skills}")
            if dept is not None:
                params.append(f"department={dept}")
                params.append(f"include_children={inc}")
            add('find_available', self._measure(client, 'GET', f"/api/people/find_available/?{'&'.join([p for p in params if p])}"))

        if endpoint in ('skill_match', 'all'):
            params = []
            if skills:
                params.append(f"skills={skills}")
            if dept is not None:
                params.append(f"department={dept}")
                params.append(f"include_children={inc}")
            add('skill_match', self._measure(client, 'GET', f"/api/people/skill_match/?{'&'.join(params)}"))

        if endpoint in ('project_availability', 'all') and project_id:
            params = []
            if dept is not None:
                params.append(f"department={dept}")
                params.append(f"include_children={inc}")
            add('project_availability', self._measure(client, 'GET', f"/api/projects/{project_id}/availability/?{'&'.join(params)}"))

        # Optional EXPLAIN (DEBUG-gated)
        try:
            from django.db import connection
            allow_explain = bool(settings.DEBUG) or (str(__import__('os').getenv('ALLOW_EXPLAIN', 'false')).lower() == 'true')
        except Exception:
            allow_explain = False
        if options.get('explain') and allow_explain:
            try:
                explains: Dict[str, Any] = {}
                # Import models lazily
                from skills.models import SkillTag, PersonSkill  # type: ignore
                from people.models import Person  # type: ignore
                from assignments.models import Assignment  # type: ignore

                # Representative queries to show index usage
                explains['grid_people'] = Person.objects.filter(is_active=True).select_related('department').explain(analyze=True, buffers=True)
                explains['skilltag_lower'] = SkillTag.objects.filter(name__icontains=(skills.split(',')[0] if skills else 'a')).explain(analyze=True, buffers=True)
                explains['personskill_by_person'] = PersonSkill.objects.select_related('person').filter(person__is_active=True).explain(analyze=True, buffers=True)
                explains['assignments_active'] = Assignment.objects.filter(is_active=True).only('person_id').explain(analyze=True, buffers=True)
                results['_explain'] = explains
            except Exception as e:
                results['_explain_error'] = f"{e.__class__.__name__}: {e}"

        self.stdout.write(json.dumps(results, indent=2))
