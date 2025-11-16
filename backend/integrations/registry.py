from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

from django.conf import settings
from jsonschema import Draft7Validator

PROVIDERS_DIR = Path(settings.BASE_DIR) / 'integrations' / 'providers'
SCHEMA_PATH = Path(settings.BASE_DIR) / 'integrations' / 'provider.schema.json'


@dataclass(frozen=True)
class ProviderMetadata:
    key: str
    display_name: str
    schema_version: str
    raw: dict

    def objects(self) -> List[dict]:
        return list(self.raw.get('objects', []))

    def field_signature(self, object_key: str) -> str | None:
        import hashlib

        for obj in self.objects():
            if obj.get('key') != object_key:
                continue
            field_keys = sorted(f['key'] for f in obj.get('fields', []))
            joined = '|'.join(field_keys)
            return hashlib.sha256(joined.encode('utf-8')).hexdigest()
        return None


class ProviderRegistry:
    def __init__(self, providers: Dict[str, ProviderMetadata]):
        self.providers = providers

    def list_providers(self) -> List[ProviderMetadata]:
        return sorted(self.providers.values(), key=lambda p: p.display_name)

    def get_provider(self, key: str) -> ProviderMetadata | None:
        return self.providers.get(key)

    def get_object_catalog(self, key: str, object_key: str) -> dict | None:
        provider = self.get_provider(key)
        if not provider:
            return None
        for obj in provider.objects():
            if obj.get('key') == object_key:
                return obj
        return None


def _validator() -> Draft7Validator:
    schema = json.loads(SCHEMA_PATH.read_text())
    return Draft7Validator(schema)


def _load_provider(path: Path, validator: Draft7Validator) -> ProviderMetadata:
    data = json.loads(path.read_text())
    validator.validate(data)
    return ProviderMetadata(
        key=data['key'],
        display_name=data.get('displayName', data['key'].title()),
        schema_version=data.get('providerSchemaVersion', '1.0.0'),
        raw=data,
    )


@lru_cache(maxsize=1)
def get_registry() -> ProviderRegistry:
    validator = _validator()
    providers: Dict[str, ProviderMetadata] = {}
    for provider_dir in PROVIDERS_DIR.iterdir():
        if not provider_dir.is_dir():
            continue
        provider_file = provider_dir / 'provider.json'
        if not provider_file.exists():
            continue
        provider = _load_provider(provider_file, validator)
        providers[provider.key] = provider
    return ProviderRegistry(providers)
