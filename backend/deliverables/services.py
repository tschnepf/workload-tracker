from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Dict, Any, Tuple, Optional

from django.db import transaction
from django.db.models import Prefetch, Q

from core.week_utils import working_days_before
from core.models import PreDeliverableGlobalSettings
from .models import (
    Deliverable,
    DeliverableAssignment,
    PreDeliverableType,
    PreDeliverableItem,
)


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

        created: List[PreDeliverableItem] = []
        for t in PreDeliverableType.objects.filter(is_active=True).order_by('sort_order', 'name'):
            eff = PreDeliverableGlobalSettings.get_effective_settings(deliverable.project, t.id)
            if not eff or not eff.get('is_enabled', True):
                continue
            days_before = int(eff.get('days_before') or 0)
            gen_date = working_days_before(deliverable.date, days_before)

            # Avoid duplicates
            existing = PreDeliverableItem.objects.filter(
                deliverable=deliverable, pre_deliverable_type=t
            ).first()
            if existing:
                continue
            item = PreDeliverableItem.objects.create(
                deliverable=deliverable,
                pre_deliverable_type=t,
                generated_date=gen_date,
                days_before=days_before,
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
        prev = {it.pre_deliverable_type_id: (it.is_completed, it.completed_date) for it in deliverable.pre_items.all()}
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

