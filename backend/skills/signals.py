from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache_scopes import bump_snapshot_scopes
from .models import PersonSkill, SkillTag


def _bump_analytics_cache_version() -> None:
    key = 'analytics_cache_version'
    try:
        cache.incr(key)
    except Exception:
        current = cache.get(key, 1)
        try:
            cache.set(key, int(current) + 1, None)
        except Exception:
            pass


def _collect_department_ids_for_person_skill(instance: PersonSkill) -> list[int]:
    ids: set[int] = set()
    try:
        person_department_id = getattr(getattr(instance, 'person', None), 'department_id', None)
        if person_department_id:
            ids.add(int(person_department_id))
    except Exception:
        pass
    try:
        skill_department_id = getattr(getattr(instance, 'skill_tag', None), 'department_id', None)
        if skill_department_id:
            ids.add(int(skill_department_id))
    except Exception:
        pass
    return sorted(ids)


@receiver([post_save, post_delete], sender=SkillTag)
def invalidate_on_skill_tag_change(sender, instance: SkillTag, **kwargs):
    _bump_analytics_cache_version()
    try:
        department_ids = [int(instance.department_id)] if getattr(instance, 'department_id', None) else []
        bump_snapshot_scopes(department_ids=department_ids)
    except Exception:
        pass


@receiver([post_save, post_delete], sender=PersonSkill)
def invalidate_on_person_skill_change(sender, instance: PersonSkill, **kwargs):
    _bump_analytics_cache_version()
    try:
        bump_snapshot_scopes(department_ids=_collect_department_ids_for_person_skill(instance))
    except Exception:
        pass
    try:
        signal = kwargs.get('signal')
        if signal is post_save:
            from reports.person_report_sync import sync_goal_for_person_skill
            sync_goal_for_person_skill(instance)
        elif signal is post_delete:
            from reports.person_report_sync import close_goal_for_deleted_person_skill
            close_goal_for_deleted_person_skill(instance)
    except Exception:
        # Goal sync is best-effort and should never break skill mutations.
        pass
