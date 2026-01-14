from __future__ import annotations

from django.conf import settings
from django.core.files.storage import FileSystemStorage, Storage
from django.utils.deconstruct import deconstructible

from core.models import RiskAttachmentSettings


def get_risk_attachments_dir() -> str:
    try:
        obj = RiskAttachmentSettings.get_active()
        if obj.base_path:
            return obj.base_path
    except Exception:
        pass
    return str(getattr(settings, 'RISK_ATTACHMENTS_DIR', '') or '')


@deconstructible
class RiskAttachmentStorage(Storage):
    """Dynamic storage that resolves its base path from RiskAttachmentSettings."""

    def _storage(self) -> FileSystemStorage:
        location = get_risk_attachments_dir()
        return FileSystemStorage(location=location)

    def _open(self, name, mode='rb'):
        return self._storage().open(name, mode)

    def _save(self, name, content):
        return self._storage().save(name, content)

    def delete(self, name):
        return self._storage().delete(name)

    def exists(self, name):
        return self._storage().exists(name)

    def size(self, name):
        return self._storage().size(name)

    def url(self, name):
        # Protected downloads use explicit endpoints; avoid direct URLs.
        return ''

    def path(self, name):
        return self._storage().path(name)
