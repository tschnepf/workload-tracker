from __future__ import annotations

import os
from typing import Any

from django.conf import settings
from django.core import signing

from core.backup_config import resolve_backups_dir

TOKEN_SALT = 'core.restore.job.token'


def is_restore_mode_active() -> bool:
    lock_path = os.path.join(resolve_backups_dir(), '.restore.lock')
    return os.path.exists(lock_path)


def _restore_session_value() -> str | None:
    lock_path = os.path.join(resolve_backups_dir(), '.restore.lock')
    if not os.path.exists(lock_path):
        return None
    try:
        with open(lock_path, 'r', encoding='utf-8') as f:
            value = (f.read() or '').strip()
        if value:
            return value
    except Exception:  # nosec B110
        pass
    try:
        return str(int(os.path.getmtime(lock_path)))
    except Exception:  # nosec B110
        return None


def _token_secret() -> str:
    return str(getattr(settings, 'RESTORE_JOB_TOKEN_SECRET', '') or '')


def _token_ttl_seconds() -> int:
    return int(getattr(settings, 'RESTORE_JOB_TOKEN_TTL_SECONDS', 300))


def issue_restore_job_token(*, job_id: str, allow_without_session: bool = False) -> str:
    session_value = _restore_session_value()
    if not session_value and not allow_without_session:
        raise ValueError('Restore mode is not active')
    payload = {
        'job_id': str(job_id),
        'session': session_value or '',
    }
    return signing.dumps(payload, key=_token_secret(), salt=TOKEN_SALT)


def extract_restore_token(request: Any) -> str:
    token = ''
    try:
        token = (request.query_params.get('rt') or '').strip()
    except Exception:  # nosec B110
        token = ''
    if token:
        return token
    try:
        return (request.headers.get('X-Restore-Job-Token') or '').strip()
    except Exception:  # nosec B110
        return ''


def validate_restore_job_token(*, token: str, job_id: str) -> bool:
    if not token:
        return False
    if not is_restore_mode_active():
        return False
    session_value = _restore_session_value() or ''
    try:
        payload = signing.loads(
            token,
            key=_token_secret(),
            salt=TOKEN_SALT,
            max_age=_token_ttl_seconds(),
        )
    except Exception:
        return False
    if str(payload.get('job_id') or '') != str(job_id):
        return False
    token_session = str(payload.get('session') or '')
    if token_session:
        return token_session == session_value
    return True
