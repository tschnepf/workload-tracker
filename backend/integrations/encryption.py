import json
import os
import uuid
from functools import lru_cache

from cryptography.fernet import Fernet, MultiFernet
from django.apps import apps
from django.core.exceptions import ImproperlyConfigured


def _split_keys(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [k.strip() for k in raw.split(',') if k.strip()]


@lru_cache(maxsize=1)
def _raw_keys() -> tuple[str, ...]:
    env_keys = _split_keys(os.getenv('INTEGRATIONS_SECRET_KEY'))
    if env_keys:
        return tuple(env_keys)
    persisted = _load_persisted_key()
    db_keys = _split_keys(persisted)
    if db_keys:
        return tuple(db_keys)
    raise ImproperlyConfigured('INTEGRATIONS_SECRET_KEY is not configured')


def _load_persisted_key() -> str | None:
    try:
        model = apps.get_model('integrations', 'IntegrationSecretKey')
    except Exception:
        return None
    if not model:
        return None
    try:
        return model.load_active_key()
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_keyring() -> MultiFernet:
    keys = [Fernet(k.encode('utf-8')) for k in _raw_keys()]
    if not keys:
        raise ImproperlyConfigured('INTEGRATIONS_SECRET_KEY must contain at least one value')
    return MultiFernet(keys)


def reset_key_cache():
    _raw_keys.cache_clear()
    get_keyring.cache_clear()


def get_primary_key_id() -> str:
    # Derive a deterministic key id from the first key so we can rotate safely.
    raw = _raw_keys()[0]
    return uuid.uuid5(uuid.NAMESPACE_URL, raw).hex


def encrypt_secret(payload: dict) -> bytes:
    data = json.dumps(payload).encode('utf-8')
    return get_keyring().encrypt(data)


def decrypt_secret(cipher_text: bytes) -> dict:
    data = get_keyring().decrypt(cipher_text)
    return json.loads(data.decode('utf-8'))
