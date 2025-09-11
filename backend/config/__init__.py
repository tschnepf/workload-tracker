try:
    # Celery is optional at web start; when unavailable, keep app booting
    from .celery import app as celery_app  # type: ignore
except Exception:  # pragma: no cover - defensive import
    celery_app = None  # type: ignore

__all__ = ("celery_app",)
