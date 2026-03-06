from __future__ import annotations

import os
import time
from typing import Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo

from django.http import FileResponse
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework import status, serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.throttling import ScopedRateThrottle
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiResponse, OpenApiTypes

from django.conf import settings
from django.utils import timezone

from .backup_config import set_runtime_backups_dir
from .backup_schedule import next_scheduled_run
from .backup_service import BackupService
from .job_access import JobAccessRegistrationError, enqueue_user_facing_task
from .models import BackupAutomationSettings
from .restore_tokens import issue_restore_job_token


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
        'lastAutomaticBackupAt': serializers.CharField(allow_null=True, required=False),
        'nextAutomaticBackupAt': serializers.CharField(allow_null=True, required=False),
        'automaticBackupsEnabled': serializers.BooleanField(required=False),
        'backupsDir': serializers.CharField(required=False),
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


class BackupAutomationSettingsSerializer(serializers.ModelSerializer):
    enabled = serializers.BooleanField()
    scheduleType = serializers.ChoiceField(
        source='schedule_type',
        choices=[choice[0] for choice in BackupAutomationSettings.SCHEDULE_CHOICES],
    )
    scheduleDayOfWeek = serializers.IntegerField(source='schedule_day_of_week', min_value=0, max_value=6, required=False)
    scheduleDayOfMonth = serializers.IntegerField(source='schedule_day_of_month', min_value=1, max_value=31, required=False)
    scheduleHour = serializers.IntegerField(source='schedule_hour', min_value=0, max_value=23)
    scheduleMinute = serializers.IntegerField(source='schedule_minute', min_value=0, max_value=59)
    scheduleTimezone = serializers.CharField(source='schedule_timezone')
    backupsDir = serializers.CharField(source='backups_dir')
    retentionDaily = serializers.IntegerField(source='retention_daily', min_value=1, max_value=365)
    retentionWeekly = serializers.IntegerField(source='retention_weekly', min_value=1, max_value=104)
    retentionMonthly = serializers.IntegerField(source='retention_monthly', min_value=1, max_value=240)
    lastAutomaticBackupAt = serializers.DateTimeField(source='last_automatic_backup_at', allow_null=True, required=False, read_only=True)
    lastAutomaticBackupFilename = serializers.CharField(source='last_automatic_backup_filename', read_only=True)
    nextAutomaticBackupAt = serializers.SerializerMethodField(read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = BackupAutomationSettings
        fields = [
            'enabled',
            'scheduleType',
            'scheduleDayOfWeek',
            'scheduleDayOfMonth',
            'scheduleHour',
            'scheduleMinute',
            'scheduleTimezone',
            'backupsDir',
            'retentionDaily',
            'retentionWeekly',
            'retentionMonthly',
            'lastAutomaticBackupAt',
            'lastAutomaticBackupFilename',
            'nextAutomaticBackupAt',
            'updatedAt',
        ]

    def get_nextAutomaticBackupAt(self, obj):
        if not bool(getattr(obj, 'enabled', True)):
            return None
        return next_scheduled_run(obj, now_utc=timezone.now())

    def validate_scheduleTimezone(self, value):
        tz_name = str(value or '').strip()
        if not tz_name:
            raise serializers.ValidationError('Timezone is required.')
        try:
            ZoneInfo(tz_name)
        except Exception:
            raise serializers.ValidationError('Invalid timezone.')
        return tz_name

    def validate_backupsDir(self, value):
        path = os.path.abspath(str(value or '').strip())
        if not path:
            raise serializers.ValidationError('Backup location is required.')
        if not os.path.isabs(path):
            raise serializers.ValidationError('Backup location must be an absolute path.')
        try:
            os.makedirs(path, exist_ok=True)
        except Exception:
            raise serializers.ValidationError('Backup location could not be created.')
        if not (os.access(path, os.W_OK) and os.access(path, os.X_OK)):
            raise serializers.ValidationError('Backup location must be writable by the backend service.')
        return path

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


def _build_status_url(request, job_id: str, *, include_restore_token: bool = False) -> str:
    status_url = request.build_absolute_uri(f"/api/jobs/{job_id}/")
    if not include_restore_token:
        return status_url
    token = None
    # The restore lock file may appear shortly after enqueue; wait briefly to
    # maximize session-bound token issuance.
    for _ in range(10):
        try:
            token = issue_restore_job_token(job_id=job_id)
            break
        except Exception:
            time.sleep(0.2)
    if token is None:
        try:
            token = issue_restore_job_token(job_id=job_id, allow_without_session=True)
        except Exception:
            token = None
    if token:
        return f"{status_url}?rt={quote(token, safe='')}"
    return status_url


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
        try:
            task = enqueue_user_facing_task(
                create_backup_task,
                user=request.user,
                is_admin_only=True,
                purpose='backup_create',
                kwargs={'description': description},
            )
        except JobAccessRegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
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
        status_url = _build_status_url(request, str(task.id))
        return Response({"jobId": task.id, "statusUrl": status_url}, status=status.HTTP_202_ACCEPTED)


class BackupStatusView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'backup_status'

    @extend_schema(responses=BackupStatusSerializer)
    def get(self, request):
        svc = BackupService()
        return Response(svc.get_status())


class BackupAutomationSettingsView(GenericAPIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'backup_status'

    @extend_schema(responses=BackupAutomationSettingsSerializer)
    def get(self, request):
        obj = BackupAutomationSettings.get_active()
        if obj.backups_dir:
            set_runtime_backups_dir(obj.backups_dir)
        return Response(BackupAutomationSettingsSerializer(obj).data)

    @extend_schema(request=BackupAutomationSettingsSerializer, responses=BackupAutomationSettingsSerializer)
    def put(self, request):
        obj = BackupAutomationSettings.get_active()
        ser = BackupAutomationSettingsSerializer(instance=obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()

        if obj.backups_dir:
            set_runtime_backups_dir(obj.backups_dir)
        obj.next_automatic_backup_at = next_scheduled_run(obj, now_utc=timezone.now())
        obj.save(update_fields=['next_automatic_backup_at', 'updated_at'])

        try:
            from accounts.models import AdminAuditLog  # type: ignore

            AdminAuditLog.objects.create(
                actor=getattr(request, 'user', None),
                action='backup_automation_settings_update',
                detail={
                    'enabled': bool(obj.enabled),
                    'scheduleType': obj.schedule_type,
                    'backupsDir': obj.backups_dir,
                    'retention': {
                        'daily': int(obj.retention_daily),
                        'weekly': int(obj.retention_weekly),
                        'monthly': int(obj.retention_monthly),
                    },
                },
            )
        except Exception:  # nosec B110
            pass

        return Response(BackupAutomationSettingsSerializer(obj).data)


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

        try:
            task = enqueue_user_facing_task(
                restore_backup_task,
                user=request.user,
                is_admin_only=True,
                purpose='backup_restore',
                kwargs={'path': path, 'jobs': jobs_i, 'confirm': confirm, 'migrate': migrate},
            )
        except JobAccessRegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
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
        status_url = _build_status_url(request, str(task.id), include_restore_token=True)
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

        try:
            task = enqueue_user_facing_task(
                restore_backup_task,
                user=request.user,
                is_admin_only=True,
                purpose='backup_upload_restore',
                kwargs={'path': final_path, 'jobs': jobs_i, 'confirm': confirm, 'migrate': migrate},
            )
        except JobAccessRegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
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
        status_url = _build_status_url(request, str(task.id), include_restore_token=True)
        return Response({"jobId": task.id, "statusUrl": status_url}, status=status.HTTP_202_ACCEPTED)
