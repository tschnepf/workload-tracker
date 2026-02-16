from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

from django.conf import settings
from django.db import IntegrityError

from .models import JobAccessRecord


def _feature_flag(name: str, default: bool = False) -> bool:
    return bool(getattr(settings, 'FEATURES', {}).get(name, default))


def is_job_authz_enforced() -> bool:
    return _feature_flag('JOB_AUTHZ_ENFORCED', False)


def is_job_authz_write_required() -> bool:
    return _feature_flag('JOB_AUTHZ_WRITE_REQUIRED', False)


def is_admin_user(user: Any) -> bool:
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and (getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False))
    )


@dataclass(frozen=True)
class JobAccessRegistrationError(RuntimeError):
    message: str

    def __str__(self) -> str:
        return self.message


def register_job_access(
    *,
    job_id: str,
    user: Any = None,
    is_admin_only: bool = False,
    purpose: str = '',
) -> JobAccessRecord:
    owner = user if getattr(user, 'is_authenticated', False) else None
    try:
        return JobAccessRecord.objects.create(
            job_id=str(job_id),
            created_by=owner,
            is_admin_only=bool(is_admin_only),
            purpose=(purpose or '')[:100],
        )
    except IntegrityError as exc:
        raise JobAccessRegistrationError('Job ownership metadata already exists for this job ID') from exc
    except Exception as exc:
        raise JobAccessRegistrationError('Unable to persist job ownership metadata') from exc


def enqueue_user_facing_task(
    task: Any,
    *,
    user: Any = None,
    is_admin_only: bool = False,
    purpose: str = '',
    args: Iterable[Any] | None = None,
    kwargs: Mapping[str, Any] | None = None,
) -> Any:
    task_id = str(uuid.uuid4())
    task_args = tuple(args or ())
    task_kwargs = dict(kwargs or {})

    record_written = False
    try:
        register_job_access(job_id=task_id, user=user, is_admin_only=is_admin_only, purpose=purpose)
        record_written = True
    except JobAccessRegistrationError:
        if is_job_authz_write_required():
            raise

    apply_async = getattr(task, 'apply_async', None)
    if not callable(apply_async):
        raise RuntimeError('Task object does not support apply_async')

    try:
        result = apply_async(args=task_args, kwargs=task_kwargs, task_id=task_id)
    except Exception:
        if record_written:
            try:
                JobAccessRecord.objects.filter(job_id=task_id).delete()
            except Exception:  # nosec B110
                pass
        raise

    result_id = getattr(result, 'id', None)
    if not isinstance(result_id, str) or not result_id or result_id != task_id:
        try:
            setattr(result, 'id', task_id)
        except Exception:
            class _Result:
                id = task_id

            return _Result()
    return result


def can_user_access_job(*, user: Any, job_id: str) -> tuple[bool, bool]:
    """Return (is_allowed, is_record_missing)."""
    if is_admin_user(user):
        return True, False

    try:
        record = JobAccessRecord.objects.only('created_by_id', 'is_admin_only').get(job_id=str(job_id))
    except JobAccessRecord.DoesNotExist:
        if is_job_authz_enforced():
            return False, True
        return bool(getattr(user, 'is_authenticated', False)), True

    if record.is_admin_only:
        return False, False

    if not getattr(user, 'is_authenticated', False):
        return False, False
    return record.created_by_id == getattr(user, 'id', None), False
