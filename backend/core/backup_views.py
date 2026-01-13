from __future__ import annotations

import os
from typing import Optional

from django.http import FileResponse
from django.urls import reverse
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework import status, serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.throttling import ScopedRateThrottle
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiResponse, OpenApiTypes

from django.conf import settings

from .backup_service import BackupService


class BackupInfoSerializer(serializers.Serializer):
    id = serializers.CharField()
    filename = serializers.CharField()
    size = serializers.IntegerField()
    createdAt = serializers.CharField()
    description = serializers.CharField(allow_null=True, required=False)
    sha256 = serializers.CharField(allow_null=True, required=False)
    format = serializers.CharField()


class BackupListResponseSerializer(serializers.Serializer):
    items = BackupInfoSerializer(many=True)

BackupCreateRequestSerializer = inline_serializer(
    name='BackupCreateRequest',
    fields={'description': serializers.CharField(required=False, allow_blank=True)},
)

BackupJobResponseSerializer = inline_serializer(
    name='BackupJobResponse',
    fields={
        'jobId': serializers.CharField(),
        'statusUrl': serializers.CharField(),
    },
)

BackupStatusSerializer = inline_serializer(
    name='BackupStatusResponse',
    fields={
        'lastBackupAt': serializers.CharField(allow_null=True, required=False),
        'lastBackupSize': serializers.IntegerField(allow_null=True, required=False),
        'retentionOk': serializers.BooleanField(),
        'offsiteEnabled': serializers.BooleanField(),
        'offsiteLastSyncAt': serializers.CharField(allow_null=True, required=False),
        'policy': serializers.CharField(),
        'encryptionEnabled': serializers.BooleanField(),
        'encryptionProvider': serializers.CharField(allow_null=True, required=False),
    },
)

BackupRestoreRequestSerializer = inline_serializer(
    name='BackupRestoreRequest',
    fields={
        'confirm': serializers.CharField(),
        'jobs': serializers.IntegerField(required=False),
        'migrate': serializers.BooleanField(required=False),
    },
)

BackupUploadRestoreRequestSerializer = inline_serializer(
    name='BackupUploadRestoreRequest',
    fields={
        'confirm': serializers.CharField(),
        'jobs': serializers.IntegerField(required=False),
        'migrate': serializers.BooleanField(required=False),
        'file': serializers.FileField(),
    },
)

BackupDeleteResponseSerializer = inline_serializer(
    name='BackupDeleteResponse',
    fields={'deleted': serializers.BooleanField()},
)

# Celery availability check
try:  # pragma: no cover - defensive import
    from celery import current_app as celery_app  # type: ignore
    CELERY_AVAILABLE = True
except Exception:  # pragma: no cover
    celery_app = None  # type: ignore
    CELERY_AVAILABLE = False

try:
    from core.backup_tasks import create_backup_task, restore_backup_task  # type: ignore
except Exception:  # pragma: no cover
    create_backup_task = None  # type: ignore
    restore_backup_task = None  # type: ignore


def _celery_has_workers(timeout: float = 1.0) -> bool:
    if not CELERY_AVAILABLE or celery_app is None:
        return False
    try:
        resp = celery_app.control.ping(timeout=timeout) or []
        return len(resp) > 0
    except Exception:
        return False


class BackupListCreateView(GenericAPIView):
    permission_classes = [IsAdminUser]

    # Use ScopedRateThrottle only for POST
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = None  # set per-method

    def get_throttles(self):  # apply scope dynamically
        if self.request.method == 'POST':
            self.throttle_scope = 'backup_create'
        else:
            self.throttle_scope = None
        return super().get_throttles()

    @extend_schema(responses=BackupListResponseSerializer)
    def get(self, request):
        svc = BackupService()
        return Response({"items": svc.list_backups(include_hash=False)})

    @extend_schema(request=BackupCreateRequestSerializer, responses=BackupJobResponseSerializer)
    def post(self, request):
        if not _celery_has_workers():
            return Response({"detail": "Async jobs unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        description: Optional[str] = request.data.get('description') if isinstance(request.data, dict) else None
        if create_backup_task is None:
            return Response({"detail": "Async jobs unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        task = create_backup_task.delay(description=description)
        # Admin audit log
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=getattr(request, 'user', None),
                action='backup_create',
                detail={'description': (description or '').strip()[:200]},
            )
        except Exception:  # nosec B110
            pass
        status_url = request.build_absolute_uri(f"/api/jobs/{task.id}/")
        return Response({"jobId": task.id, "statusUrl": status_url}, status=status.HTTP_202_ACCEPTED)


class BackupStatusView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'backup_status'

    @extend_schema(responses=BackupStatusSerializer)
    def get(self, request):
        svc = BackupService()
        return Response(svc.get_status())


class BackupDownloadView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'backup_download'

    @extend_schema(
        responses=OpenApiResponse(
            response=OpenApiTypes.BINARY,
            description='Backup archive download.',
        )
    )
    def get(self, request, id: str):
        svc = BackupService()
        # id is the filename (validated by service)
        path = os.path.join(svc.backups_dir, os.path.basename(id))
        # Validate path and archive type
        try:
            info = svc.validate_backup(path, verify_checksum=False)
        except Exception:
            return Response({"detail": "Backup not found or invalid"}, status=status.HTTP_404_NOT_FOUND)

        ctype = 'application/octet-stream'
        if info.get('format') == 'plain' or str(path).endswith('.sql.gz'):
            ctype = 'application/gzip'
        f = open(info['path'], 'rb')
        resp = FileResponse(f, content_type=ctype)
        resp['Content-Disposition'] = f"attachment; filename=\"{info['filename']}\""
        # Admin audit log (non-blocking)
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=getattr(request, 'user', None),
                action='backup_download',
                detail={'filename': info['filename']},
            )
        except Exception:  # nosec B110
            pass
        return resp


class BackupDeleteView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'backup_delete'

    @extend_schema(responses=BackupDeleteResponseSerializer)
    def delete(self, request, id: str):
        svc = BackupService()
        filename = os.path.basename(id)
        existed = svc.delete_backup(filename)
        # Admin audit log
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=getattr(request, 'user', None),
                action='backup_delete',
                detail={'filename': filename},
            )
        except Exception:  # nosec B110
            pass
        if not existed:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"deleted": True})


class BackupRestoreView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    # Separate throttle scope to tune restores independently
    throttle_scope = 'backup_restore'

    @extend_schema(request=BackupRestoreRequestSerializer, responses=BackupJobResponseSerializer)
    def post(self, request, id: str):
        if not _celery_has_workers() or restore_backup_task is None:
            return Response({"detail": "Async jobs unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        confirm = (request.data or {}).get('confirm') if isinstance(request.data, dict) else None
        if not isinstance(confirm, str) or confirm.strip() != BackupService.CONFIRM_PHRASE:
            return Response({"detail": "Invalid confirmation phrase"}, status=status.HTTP_400_BAD_REQUEST)

        jobs = (request.data or {}).get('jobs') if isinstance(request.data, dict) else None
        migrate = bool((request.data or {}).get('migrate')) if isinstance(request.data, dict) else False
        try:
            jobs_i = int(jobs) if jobs is not None else 2
        except Exception:
            jobs_i = 2

        svc = BackupService()
        filename = os.path.basename(id)
        path = os.path.join(svc.backups_dir, filename)
        try:
            svc.validate_backup(path, verify_checksum=False)
        except Exception:
            return Response({"detail": "Backup not found or invalid"}, status=status.HTTP_404_NOT_FOUND)

        task = restore_backup_task.delay(path=path, jobs=jobs_i, confirm=confirm, migrate=migrate)
        # Admin audit log
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=getattr(request, 'user', None),
                action='backup_restore',
                detail={'filename': filename, 'jobs': jobs_i, 'migrate': migrate},
            )
        except Exception:  # nosec B110
            pass
        status_url = request.build_absolute_uri(f"/api/jobs/{task.id}/")
        return Response({"jobId": task.id, "statusUrl": status_url}, status=status.HTTP_202_ACCEPTED)


class UploadAndRestoreView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    # Heavier path: allow separate rate control
    throttle_scope = 'backup_upload_restore'

    @extend_schema(request=BackupUploadRestoreRequestSerializer, responses=BackupJobResponseSerializer)
    def post(self, request):
        if not _celery_has_workers() or restore_backup_task is None:
            return Response({"detail": "Async jobs unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        confirm = (request.data or {}).get('confirm') if isinstance(request.data, dict) else None
        if not isinstance(confirm, str) or confirm.strip() != BackupService.CONFIRM_PHRASE:
            return Response({"detail": "Invalid confirmation phrase"}, status=status.HTTP_400_BAD_REQUEST)

        upload = request.FILES.get('file') if hasattr(request, 'FILES') else None
        if upload is None:
            return Response({"detail": "Missing file"}, status=status.HTTP_400_BAD_REQUEST)

        # Basic filename and extension checks before touching disk
        orig_name = getattr(upload, 'name', 'backup')
        base = os.path.basename(orig_name)
        if not (base.endswith('.pgcustom') or base.endswith('.sql.gz')):
            return Response({"detail": "Unsupported file type. Expect .pgcustom or .sql.gz"}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce upload size limits (header or chunked)
        max_bytes = int(getattr(settings, 'BACKUP_UPLOAD_MAX_BYTES', 5 * 1024 * 1024 * 1024))
        size_attr = getattr(upload, 'size', None)
        if isinstance(size_attr, int) and size_attr > max_bytes:
            return Response({"detail": "File too large"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        svc = BackupService()
        # Stream to incoming
        incoming_path = svc.incoming_path(orig_name)
        os.makedirs(os.path.dirname(incoming_path), exist_ok=True)
        try:
            written = 0
            with open(incoming_path, 'wb') as out:
                for chunk in upload.chunks():
                    out.write(chunk)
                    written += len(chunk)
                    if written > max_bytes:
                        raise ValueError('upload_exceeds_limit')
            # Validate and promote
            svc.validate_backup(incoming_path, verify_checksum=False)
            final_path = svc.promote_incoming(incoming_path)
        except Exception as e:
            try:
                if os.path.exists(incoming_path):
                    os.remove(incoming_path)
            except Exception:  # nosec B110
                pass
            if str(e) == 'upload_exceeds_limit':
                return Response({"detail": "File too large"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
            return Response({"detail": f"Invalid backup: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        jobs = (request.data or {}).get('jobs') if isinstance(request.data, dict) else None
        migrate = bool((request.data or {}).get('migrate')) if isinstance(request.data, dict) else False
        try:
            jobs_i = int(jobs) if jobs is not None else 2
        except Exception:
            jobs_i = 2

        task = restore_backup_task.delay(path=final_path, jobs=jobs_i, confirm=confirm, migrate=migrate)
        # Admin audit log
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=getattr(request, 'user', None),
                action='backup_upload_restore',
                detail={'original': base, 'stored': os.path.basename(final_path), 'jobs': jobs_i, 'migrate': migrate},
            )
        except Exception:  # nosec B110
            pass
        status_url = request.build_absolute_uri(f"/api/jobs/{task.id}/")
        return Response({"jobId": task.id, "statusUrl": status_url}, status=status.HTTP_202_ACCEPTED)
