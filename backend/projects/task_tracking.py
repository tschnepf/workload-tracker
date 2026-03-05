from __future__ import annotations

from typing import Iterable

from django.db import transaction

from deliverables.models import Deliverable
from projects.models import Project, ProjectTask, ProjectTaskScope, ProjectTaskTemplate


def project_task_tracking_enabled(project: Project | None) -> bool:
    if not project:
        return False
    vertical = getattr(project, 'vertical', None)
    return bool(vertical and getattr(vertical, 'task_tracking_enabled', False))


def _active_templates(vertical_id: int, scope: str) -> Iterable[ProjectTaskTemplate]:
    return (
        ProjectTaskTemplate.objects
        .filter(vertical_id=vertical_id, scope=scope, is_active=True)
        .select_related('department')
        .order_by('sort_order', 'id')
    )


@transaction.atomic
def ensure_project_scope_tasks(project: Project) -> int:
    if not project_task_tracking_enabled(project):
        return 0
    if not project.vertical_id:
        return 0
    created = 0
    for template in _active_templates(project.vertical_id, ProjectTaskScope.PROJECT):
        exists = ProjectTask.objects.filter(
            project_id=project.id,
            scope=ProjectTaskScope.PROJECT,
            deliverable__isnull=True,
            template_id=template.id,
        ).exists()
        if exists:
            continue
        ProjectTask.objects.create(
            project=project,
            template=template,
            scope=ProjectTaskScope.PROJECT,
            department=template.department,
            name=template.name,
            description=template.description,
            completion_percent=0,
        )
        created += 1
    return created


@transaction.atomic
def ensure_deliverable_scope_tasks(deliverable: Deliverable) -> int:
    project = getattr(deliverable, 'project', None)
    if project is None:
        deliverable = Deliverable.objects.select_related('project').get(pk=deliverable.pk)
        project = deliverable.project
    if not project_task_tracking_enabled(project):
        return 0
    if not project.vertical_id:
        return 0
    created = 0
    for template in _active_templates(project.vertical_id, ProjectTaskScope.DELIVERABLE):
        exists = ProjectTask.objects.filter(
            project_id=project.id,
            deliverable_id=deliverable.id,
            scope=ProjectTaskScope.DELIVERABLE,
            template_id=template.id,
        ).exists()
        if exists:
            continue
        ProjectTask.objects.create(
            project=project,
            deliverable=deliverable,
            template=template,
            scope=ProjectTaskScope.DELIVERABLE,
            department=template.department,
            name=template.name,
            description=template.description,
            completion_percent=0,
        )
        created += 1
    return created


@transaction.atomic
def sync_project_tasks(project: Project) -> dict:
    if not project_task_tracking_enabled(project):
        return {
            'projectCreated': 0,
            'deliverableCreated': 0,
            'processedDeliverables': 0,
        }
    project_created = ensure_project_scope_tasks(project)
    deliverable_created = 0
    processed_deliverables = 0
    for deliverable in Deliverable.objects.filter(project_id=project.id).iterator():
        processed_deliverables += 1
        deliverable_created += ensure_deliverable_scope_tasks(deliverable)
    return {
        'projectCreated': project_created,
        'deliverableCreated': deliverable_created,
        'processedDeliverables': processed_deliverables,
    }
