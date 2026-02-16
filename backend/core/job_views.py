from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authentication import BaseAuthentication
from rest_framework import status
from django.http import FileResponse, Http404
from django.conf import settings
from django.core.files.storage import default_storage
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiTypes, OpenApiResponse
from core.job_access import can_user_access_job, is_job_authz_enforced
from core.restore_tokens import (
    extract_restore_token,
    is_restore_mode_active,
    validate_restore_job_token,
)

# Celery may not be installed or running in some environments; guard import
try:  # pragma: no cover - defensive import
    from celery.result import AsyncResult  # type: ignore
except Exception:  # pragma: no cover
    AsyncResult = None  # type: ignore


class _BaseJobView(APIView):
    permission_classes = [IsAuthenticated]

    def _restore_token_mode_active(self) -> bool:
        return bool(getattr(settings, 'FEATURES', {}).get('JOB_RESTORE_TOKEN_MODE', True)) and is_restore_mode_active()

    def get_permissions(self):  # type: ignore[override]
        if self._restore_token_mode_active():
            return [AllowAny()]
        return [p() for p in self.permission_classes]

    def get_authenticators(self):  # type: ignore[override]
        # During restore windows, DB-backed authentication may be unavailable.
        # Use signed restore tokens instead.
        if self._restore_token_mode_active():
            return []  # type: list[BaseAuthentication]
        return super().get_authenticators()

    def _authorize_job_access(self, request, job_id: str):
        if self._restore_token_mode_active():
            token = extract_restore_token(request)
            if validate_restore_job_token(token=token, job_id=job_id):
                return None
            return Response({'detail': 'Invalid or expired restore job token'}, status=status.HTTP_403_FORBIDDEN)

        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return Response({'detail': 'Authentication credentials were not provided.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not is_job_authz_enforced():
            return None

        try:
            allowed, missing_record = can_user_access_job(user=user, job_id=job_id)
        except Exception:
            return Response({'detail': 'Job authorization metadata unavailable'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if allowed:
            return None

        if missing_record:
            return Response(
                {'detail': 'Job access denied. Legacy/in-flight pre-cutover job IDs are not supported.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({'detail': 'You do not have permission to access this job.'}, status=status.HTTP_403_FORBIDDEN)


class JobStatusView(_BaseJobView):
    @extend_schema(
        parameters=[
            OpenApiParameter(name='job_id', type=str, location=OpenApiParameter.PATH, description='Background job id'),
            OpenApiParameter(
                name='rt',
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Restore-session token (required during restore mode)',
            ),
        ],
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'id': {'type': 'string'},
                    'state': {'type': 'string', 'enum': ['PENDING','STARTED','PROGRESS','SUCCESS','FAILURE']},
                    'progress': {'type': 'integer'},
                    'message': {'type': 'string', 'nullable': True},
                    'downloadReady': {'type': 'boolean'},
                    'downloadUrl': {'type': 'string', 'nullable': True},
                    'result': {},
                    'error': {'type': 'string', 'nullable': True},
                },
                'required': ['id','state','progress','downloadReady']
            },
            503: {'description': 'Async jobs not available'},
            409: {'description': 'Job not completed'},
        }
    )
    def get(self, request, job_id: str):
        """Return status and metadata for a Celery job.

        Response fields:
        - id: task id
        - state: PENDING|STARTED|PROGRESS|SUCCESS|FAILURE
        - progress: 0-100 if available
        - message: optional status message
        - downloadReady: bool
        - downloadUrl: present when a file is available to download
        - result: task result when not file-based (e.g., import summary)
        - error: error message if failed
        """
        if AsyncResult is None:
            return Response({'detail': 'Async jobs not available'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        authz = self._authorize_job_access(request, job_id)
        if authz is not None:
            return authz

        result = AsyncResult(job_id)
        state = result.state or 'PENDING'
        info = result.info or {}

        # Celery can encode exception in info when FAILURE
        error = None
        if state == 'FAILURE':
            error = str(info) if info else 'Task failed'

        # Progress/meta protocol: use keys 'progress' and 'message'
        progress = 0
        message = None
        download_ready = False
        download_url = None
        payload_result = None

        try:
            if isinstance(info, dict):
                progress = int(info.get('progress', 0))
                message = info.get('message')
                # If the task returns a file descriptor dict, surface download readiness
                if info.get('type') == 'file' and info.get('path'):
                    download_ready = state == 'SUCCESS'
                # Non-file results (e.g., import summary) may be the final result
        except Exception:  # nosec B110
            pass

        if state == 'SUCCESS':
            try:
                res = result.get(propagate=False)
                if isinstance(res, dict) and res.get('type') == 'file' and res.get('path'):
                    download_ready = True
                else:
                    payload_result = res
            except Exception:  # nosec B110
                # If reading result fails, keep defaults
                pass

        if download_ready:
            download_url = request.build_absolute_uri(f"/api/jobs/{job_id}/download/")

        return Response({
            'id': job_id,
            'state': state,
            'progress': progress,
            'message': message,
            'downloadReady': download_ready,
            'downloadUrl': download_url,
            'result': payload_result,
            'error': error,
        })


class JobDownloadView(_BaseJobView):
    @extend_schema(
        parameters=[
            OpenApiParameter(name='job_id', type=str, location=OpenApiParameter.PATH, description='Background job id'),
            OpenApiParameter(
                name='rt',
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Restore-session token (required during restore mode)',
            ),
        ],
        responses={
            200: OpenApiResponse(response=OpenApiTypes.BINARY, description='File content'),
            404: {'description': 'No file associated with this job'},
            409: {'description': 'Job not completed'},
            503: {'description': 'Async jobs not available'},
        }
    )
    def get(self, request, job_id: str):
        """Stream the file produced by a completed job (if any)."""
        if AsyncResult is None:
            return Response({'detail': 'Async jobs not available'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        authz = self._authorize_job_access(request, job_id)
        if authz is not None:
            return authz

        result = AsyncResult(job_id)
        if result.state != 'SUCCESS':
            return Response({'detail': 'Job not completed'}, status=status.HTTP_409_CONFLICT)

        res = result.get(propagate=False)
        if not isinstance(res, dict) or res.get('type') != 'file' or not res.get('path'):
            raise Http404('No file associated with this job')

        file_path = res['path']  # storage key
        filename = res.get('filename', 'download.bin')
        content_type = res.get('content_type', 'application/octet-stream')

        try:
            f = default_storage.open(file_path, 'rb')
        except Exception:
            raise Http404('File not found')

        response = FileResponse(f, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
