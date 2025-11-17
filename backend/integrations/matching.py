from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from integrations.models import (
    IntegrationConnection,
    IntegrationExternalLink,
    IntegrationRule,
)
from integrations.providers.bqe.projects_client import BQEProjectsClient
from integrations.registry import get_registry
from projects.models import Project


@dataclass
class ProjectMatchSuggestion:
    external_id: str
    external_name: str
    external_number: Optional[str]
    external_client: Optional[str]
    status: str
    match_reason: Optional[str]
    matched_project: Optional[Project]
    candidates: List[Project]


def _normalize(value: Any) -> str:
    if not value:
        return ''
    return ' '.join(str(value).strip().lower().split())


def _coerce_project_number(payload: Dict[str, Any]) -> str:
    number = payload.get('projectNumber') or payload.get('number')
    if number is None and payload.get('projectId') is not None:
        number = str(payload.get('projectId'))
    return _normalize(number)


def _build_local_indexes(projects: Iterable[Project]):
    by_number = defaultdict(list)
    by_name_client = defaultdict(list)
    for project in projects:
        number = _normalize(project.project_number)
        if number:
            by_number[number].append(project)
        key = (_normalize(project.name), _normalize(project.client))
        by_name_client[key].append(project)
    return by_number, by_name_client


def fetch_bqe_parent_projects(connection: IntegrationConnection) -> List[Dict[str, Any]]:
    provider = get_registry().get_provider(connection.provider.key)
    if not provider:
        return []
    client = BQEProjectsClient(connection, provider)
    rows: List[Dict[str, Any]] = []
    for batch in client.fetch_parent_projects():
        rows.extend(batch)
    return rows


def suggest_project_matches(connection: IntegrationConnection) -> Dict[str, Any]:
    remote_rows = fetch_bqe_parent_projects(connection)
    projects = Project.objects.all().only('id', 'name', 'client', 'project_number')
    by_number, by_name_client = _build_local_indexes(projects)
    existing_links = {
        link.external_id: link
        for link in IntegrationExternalLink.objects.filter(
            provider=connection.provider,
            connection=connection,
            object_type='projects',
        )
    }
    results: List[Dict[str, Any]] = []
    stats = {'total': 0, 'matched': 0, 'conflicts': 0, 'unmatched': 0, 'linked': 0}

    for row in remote_rows:
        stats['total'] += 1
        external_id = str(row.get('projectId') or '').strip()
        suggestion = {
            'externalId': external_id,
            'externalName': row.get('name'),
            'externalNumber': row.get('projectNumber') or row.get('number'),
            'externalClient': row.get('clientName'),
            'status': 'unmatched',
            'matchReason': None,
            'matchedProject': None,
            'candidates': [],
        }
        if external_id in existing_links:
            link = existing_links[external_id]
            project = link.local_object if isinstance(link.local_object, Project) else None
            suggestion['status'] = 'linked'
            if project:
                suggestion['matchedProject'] = _project_payload(project)
            stats['linked'] += 1
            results.append(suggestion)
            continue

        number_key = _coerce_project_number(row)
        name_client_key = (_normalize(row.get('name')), _normalize(row.get('clientName')))

        matched = None
        candidates: List[Project] = []
        reason = None

        if number_key and by_number.get(number_key):
            bucket = by_number[number_key]
            if len(bucket) == 1:
                matched = bucket[0]
                reason = 'project_number'
            else:
                candidates = bucket
                suggestion['status'] = 'conflict'
                stats['conflicts'] += 1
        elif name_client_key != ('', '') and by_name_client.get(name_client_key):
            bucket = by_name_client[name_client_key]
            if len(bucket) == 1:
                matched = bucket[0]
                reason = 'name_client'
            else:
                candidates = bucket
                suggestion['status'] = 'conflict'
                stats['conflicts'] += 1

        if matched:
            suggestion['status'] = 'matched'
            suggestion['matchedProject'] = _project_payload(matched)
            stats['matched'] += 1
        elif suggestion['status'] != 'conflict':
            stats['unmatched'] += 1

        suggestion['matchReason'] = reason
        suggestion['candidates'] = [_project_payload(project) for project in candidates]
        results.append(suggestion)

    return {
        'items': results,
        'summary': stats,
        'localProjects': [_project_payload(project) for project in projects],
    }


def confirm_project_matches(connection: IntegrationConnection, matches: List[Dict[str, Any]], *, enable_rule: bool) -> Dict[str, int]:
    seen_external: set[str] = set()
    seen_project: set[int] = set()
    content_type = ContentType.objects.get_for_model(Project)
    updated = 0
    skipped = 0

    with transaction.atomic():
        for entry in matches:
            external_id = str(entry.get('externalId') or '').strip()
            project_id = entry.get('projectId')
            if not external_id or not project_id:
                skipped += 1
                continue
            if external_id in seen_external or project_id in seen_project:
                raise ValueError('Duplicate mappings detected')
            project = Project.objects.filter(id=project_id).first()
            if not project:
                skipped += 1
                continue
            IntegrationExternalLink.objects.update_or_create(
                provider=connection.provider,
                connection=connection,
                object_type='projects',
                external_id=external_id,
                defaults={
                    'content_type': content_type,
                    'object_id': project.id,
                },
            )
            seen_external.add(external_id)
            seen_project.add(project_id)
            updated += 1

        if enable_rule:
            IntegrationRule.objects.filter(connection=connection, object_key='projects').update(is_enabled=True)

    return {'updated': updated, 'skipped': skipped}


def _project_payload(project: Project) -> Dict[str, Any]:
    return {
        'id': project.id,
        'name': project.name,
        'client': project.client,
        'projectNumber': project.project_number,
    }
