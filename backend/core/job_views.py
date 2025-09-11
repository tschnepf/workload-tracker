from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.http import FileResponse, Http404
from django.conf import settings
from django.core.files.storage import default_storage

# Celery may not be installed or running in some environments; guard import
try:  # pragma: no cover - defensive import
    from celery.result import AsyncResult  # type: ignore
except Exception:  # pragma: no cover
    AsyncResult = None  # type: ignore


class JobStatusView(APIView):
    permission_classes = [IsAuthenticated]

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
        except Exception:
            pass

        if state == 'SUCCESS':
            try:
                res = result.get(propagate=False)
                if isinstance(res, dict) and res.get('type') == 'file' and res.get('path'):
                    download_ready = True
                else:
                    payload_result = res
            except Exception:
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


class JobDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id: str):
        """Stream the file produced by a completed job (if any)."""
        if AsyncResult is None:
            return Response({'detail': 'Async jobs not available'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

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
