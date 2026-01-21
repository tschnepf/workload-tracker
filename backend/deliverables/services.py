from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Dict, Any, Tuple, Optional
import re

from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone

from core.week_utils import working_days_before
from core.models import PreDeliverableGlobalSettings
from projects.models import ProjectPreDeliverableSettings
from assignments.models import Assignment
from .models import (
    Deliverable,
    DeliverableAssignment,
    PreDeliverableType,
    PreDeliverableItem,
    DeliverableTaskTemplate,
    DeliverableTask,
)
from core.choices import DeliverablePhase, DeliverableTaskCompletionStatus, DeliverableTaskQaStatus, DeliverableQAReviewStatus
from core.deliverable_phase import classify_deliverable_phase


@dataclass
class RegenerateSummary:
    created: int
    deleted: int
    preserved_completed: int


class PreDeliverableService:
    @staticmethod
    @transaction.atomic
    def generate_pre_deliverables(deliverable: Deliverable) -> List[PreDeliverableItem]:
        """Create items per effective settings; skip duplicates. Returns created items.

        - If deliverable has no date, returns empty list.
        - Uses global + project overrides with fallbacks on type defaults.
        """
        if deliverable is None:
            raise ValueError("deliverable is required")
        if not getattr(deliverable, 'project', None):
            deliverable = Deliverable.objects.select_related('project').get(id=deliverable.id)
        if deliverable.date is None:
            return []

        # Batch load active types
        types = list(PreDeliverableType.objects.filter(is_active=True).order_by('sort_order', 'name'))
        if not types:
            return []
        type_ids = [t.id for t in types]

        # Preload existing items for this deliverable to avoid duplicates
        existing_type_ids = set(
            PreDeliverableItem.objects
            .filter(deliverable=deliverable, pre_deliverable_type_id__in=type_ids)
            .values_list('pre_deliverable_type_id', flat=True)
        )

        # Batch-resolve effective settings
        # 1) Project-specific overrides
        proj_map = ProjectPreDeliverableSettings.get_project_settings(deliverable.project)
        # 2) Global defaults for all types
        glob_qs = PreDeliverableGlobalSettings.objects.filter(pre_deliverable_type_id__in=type_ids)
        glob_map = {g.pre_deliverable_type_id: g for g in glob_qs}

        created: List[PreDeliverableItem] = []
        for t in types:
            # Resolve effective settings without extra queries per type
            if t.id in proj_map:
                eff_days = int(proj_map[t.id]['days_before'])
                eff_enabled = bool(proj_map[t.id]['is_enabled'])
            elif t.id in glob_map:
                g = glob_map[t.id]
                eff_days = int(getattr(g, 'default_days_before') or 0)
                eff_enabled = bool(getattr(g, 'is_enabled_by_default', True))
            else:
                eff_days = int(getattr(t, 'default_days_before') or 0)
                eff_enabled = bool(getattr(t, 'is_active', True))

            if not eff_enabled:
                continue
            if t.id in existing_type_ids:
                continue

            gen_date = working_days_before(deliverable.date, eff_days)
            item = PreDeliverableItem.objects.create(
                deliverable=deliverable,
                pre_deliverable_type=t,
                generated_date=gen_date,
                days_before=eff_days,
            )
            created.append(item)
        return created

    @staticmethod
    @transaction.atomic
    def update_pre_deliverables(deliverable: Deliverable, old_date: date, new_date: Optional[date]) -> int:
        """Recalculate generated_date for all related items or delete if date cleared.

        Returns count of items updated or deleted.
        """
        if deliverable is None:
            raise ValueError("deliverable is required")
        qs = PreDeliverableItem.objects.filter(deliverable=deliverable)
        if new_date is None:
            deleted, _ = qs.delete()
            return int(deleted)
        updated = 0
        for item in qs:
            nd = working_days_before(new_date, int(item.days_before or 0))
            if item.generated_date != nd:
                item.generated_date = nd
                item.save(update_fields=['generated_date', 'updated_at'])
                updated += 1
        return updated

    @staticmethod
    @transaction.atomic
    def delete_pre_deliverables(deliverable: Deliverable) -> int:
        """Remove all related PreDeliverableItem records. Returns count deleted."""
        qs = PreDeliverableItem.objects.filter(deliverable=deliverable)
        deleted, _ = qs.delete()
        return int(deleted)

    @staticmethod
    @transaction.atomic
    def regenerate_pre_deliverables(deliverable: Deliverable) -> RegenerateSummary:
        """Delete existing and regenerate according to current settings.

        Attempts to preserve completion flags when the type matches.
        """
        # Lock current items for this deliverable to avoid concurrent races
        items_qs = PreDeliverableItem.objects.select_for_update().filter(deliverable=deliverable)
        prev = {it.pre_deliverable_type_id: (it.is_completed, it.completed_date) for it in items_qs}
        deleted = PreDeliverableService.delete_pre_deliverables(deliverable)
        created = PreDeliverableService.generate_pre_deliverables(deliverable)
        preserved = 0
        for it in created:
            prev_state = prev.get(it.pre_deliverable_type_id)
            if prev_state and prev_state[0]:
                it.is_completed = True
                it.completed_date = prev_state[1]
                it.save(update_fields=['is_completed', 'completed_date', 'updated_at'])
                preserved += 1
        return RegenerateSummary(created=len(created), deleted=deleted, preserved_completed=preserved)

    @staticmethod
    def get_upcoming_for_user(user, days_ahead: int = 14):
        """Return upcoming pre-deliverable items for items assigned to the user's Person.

        - Filters items by generated_date within `days_ahead` days from today.
        - Only items whose parent deliverable has a DeliverableAssignment to the Person.
        """
        from datetime import date as _date
        from accounts.models import UserProfile

        if not user or not getattr(user, 'is_authenticated', False):
            return PreDeliverableItem.objects.none()
        person = None
        try:
            prof = UserProfile.objects.select_related('person').get(user=user)
            person = prof.person
        except UserProfile.DoesNotExist:
            person = None
        if not person:
            return PreDeliverableItem.objects.none()

        start = _date.today()
        end = start + timedelta(days=max(0, int(days_ahead or 0)))
        return (
            PreDeliverableItem.objects.filter(
                generated_date__gte=start,
                generated_date__lte=end,
                is_active=True,
            )
            .filter(deliverable__assignments__person_id=person.id, deliverable__assignments__is_active=True)
            .select_related('deliverable', 'deliverable__project', 'pre_deliverable_type')
            .order_by('generated_date', 'deliverable__project__name')
            .distinct()
        )

    # Optional utility for migrate command preview
    @staticmethod
    def preview_generate(deliverable: Deliverable) -> List[Dict[str, Any]]:
        if deliverable.date is None:
            return []
        out = []
        for t in PreDeliverableType.objects.filter(is_active=True).order_by('sort_order', 'name'):
            eff = PreDeliverableGlobalSettings.get_effective_settings(deliverable.project, t.id)
            if not eff or not eff.get('is_enabled', True):
                continue
            days_before = int(eff.get('days_before') or 0)
            gen_date = working_days_before(deliverable.date, days_before)
            out.append({'type': t.name, 'date': gen_date.isoformat(), 'days_before': days_before})
        return out


def _is_qa_role_name(name: Optional[str]) -> bool:
    if not name:
        return False
    tokens = [t for t in re.split(r'[^a-z0-9]+', name.strip().lower()) if t]
    if 'qa' in tokens:
        return True
    return 'quality' in tokens and 'assurance' in tokens


def _default_qa_by_department(project_id: int, on_date: Optional[date] = None) -> Dict[int, int]:
    today = on_date or timezone.now().date()
    candidates: Dict[int, Dict[int, str]] = {}
    qs = (
        Assignment.objects.filter(
            project_id=project_id,
            is_active=True,
            person__is_active=True,
        )
        .filter(Q(start_date__isnull=True) | Q(start_date__lte=today))
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=today))
        .select_related('person', 'role_on_project_ref', 'department', 'person__department')
    )
    for assignment in qs:
        role_name = None
        try:
            role_name = assignment.role_on_project_ref.name
        except Exception:  # nosec B110
            role_name = assignment.role_on_project or None
        if not _is_qa_role_name(role_name):
            continue
        dept_id = assignment.department_id or getattr(assignment.person, 'department_id', None)
        if not dept_id:
            continue
        person_id = assignment.person_id
        person_name = assignment.person.name if getattr(assignment, 'person', None) else ''
        if dept_id not in candidates:
            candidates[dept_id] = {}
        candidates[dept_id][person_id] = person_name or ''
    defaults: Dict[int, int] = {}
    for dept_id, people in candidates.items():
        if not people:
            continue
        sorted_people = sorted(people.items(), key=lambda item: (item[1].lower(), item[0]))
        defaults[dept_id] = sorted_people[0][0]
    return defaults


def _current_project_department_ids(project_id: int, on_date: Optional[date] = None) -> List[int]:
    d = on_date or timezone.now().date()
    qs = (
        Assignment.objects.filter(
            project_id=project_id,
            is_active=True,
            person__is_active=True,
        )
        .filter(Q(start_date__isnull=True) | Q(start_date__lte=d))
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=d))
        .select_related('person', 'department', 'person__department')
    )
    dept_ids: set[int] = set()
    for assignment in qs:
        dept_id = assignment.department_id or getattr(assignment.person, 'department_id', None)
        if dept_id:
            dept_ids.add(int(dept_id))
    return sorted(dept_ids)


class DeliverableTaskService:
    @staticmethod
    @transaction.atomic
    def generate_for_deliverable(deliverable: Deliverable) -> List[DeliverableTask]:
        """Generate deliverable tasks from templates for the deliverable's phase."""
        if deliverable is None:
            raise ValueError("deliverable is required")
        if not getattr(deliverable, 'project', None):
            deliverable = Deliverable.objects.select_related('project').get(id=deliverable.id)

        phase = classify_deliverable_phase(deliverable.description, deliverable.percentage)
        if phase not in (DeliverablePhase.SD, DeliverablePhase.DD, DeliverablePhase.IFP, DeliverablePhase.IFC):
            return []

        templates = list(
            DeliverableTaskTemplate.objects.filter(phase=phase.value, is_active=True)
            .select_related('department')
            .order_by('sort_order', 'id')
        )
        if not templates:
            return []

        existing_template_ids = set(
            DeliverableTask.objects.filter(deliverable=deliverable, template_id__in=[t.id for t in templates])
            .values_list('template_id', flat=True)
        )

        default_qa_by_dept = _default_qa_by_department(deliverable.project_id, on_date=deliverable.date or None)
        created: List[DeliverableTask] = []
        for t in templates:
            if t.id in existing_template_ids:
                continue
            task = DeliverableTask.objects.create(
                deliverable=deliverable,
                template=t,
                department=t.department,
                sheet_number=t.sheet_number,
                sheet_name=t.sheet_name,
                scope_description=t.scope_description,
                completion_status=t.default_completion_status,
                qa_status=t.default_qa_status,
                qa_assigned_to_id=default_qa_by_dept.get(t.department_id),
            )
            created.append(task)
        return created

    @staticmethod
    def unassign_incomplete_tasks(project_id: int, person_id: int) -> int:
        """Unassign incomplete tasks for a person on a project, preserving completed tasks."""
        qs = DeliverableTask.objects.filter(
            deliverable__project_id=project_id,
            assigned_to_id=person_id,
        ).exclude(completion_status=DeliverableTaskCompletionStatus.COMPLETE)
        return qs.update(assigned_to=None)


class DeliverableQATaskService:
    @staticmethod
    @transaction.atomic
    def ensure_for_deliverable(deliverable: Deliverable, on_date: Optional[date] = None) -> int:
        """Ensure QA tasks exist for each department currently on the project.

        Returns the number of tasks created.
        """
        if deliverable is None:
            raise ValueError("deliverable is required")
        if not getattr(deliverable, 'project', None):
            deliverable = Deliverable.objects.select_related('project').get(id=deliverable.id)

        if not deliverable.date:
            return 0
        today = timezone.now().date()
        if deliverable.date < today:
            return 0

        dept_ids = _current_project_department_ids(deliverable.project_id, on_date=deliverable.date or on_date)
        if not dept_ids:
            from .models import DeliverableQATask
            DeliverableQATask.objects.filter(deliverable=deliverable).delete()
            return 0

        from .models import DeliverableQATask

        existing_qs = DeliverableQATask.objects.filter(deliverable=deliverable)
        existing = set(existing_qs.values_list('department_id', flat=True))
        existing_qs.exclude(department_id__in=dept_ids).delete()
        default_qa_by_dept = _default_qa_by_department(deliverable.project_id, on_date=deliverable.date or on_date)
        created = 0
        for dept_id in dept_ids:
            if dept_id in existing:
                continue
            DeliverableQATask.objects.create(
                deliverable=deliverable,
                department_id=dept_id,
                qa_status=DeliverableQAReviewStatus.NOT_REVIEWED,
                qa_assigned_to_id=default_qa_by_dept.get(dept_id),
            )
            created += 1
        return created

    @staticmethod
    @transaction.atomic
    def ensure_for_project_future_deliverables(project_id: int) -> int:
        """Ensure QA tasks for all future-dated deliverables in a project."""
        today = timezone.now().date()
        total_created = 0
        for deliverable in Deliverable.objects.filter(project_id=project_id, date__gte=today).select_related('project'):
            total_created += DeliverableQATaskService.ensure_for_deliverable(deliverable)
        return total_created
