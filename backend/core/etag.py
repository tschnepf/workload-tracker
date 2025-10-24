from django.utils.http import http_date
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponseNotModified
import hashlib


class ETagConditionalMixin:
    """Adds ETag on detail GET and optional If-Match handling on mutations.

    - Detail GET (retrieve): returns ETag (and Last-Modified if available). Honors If-None-Match with 304.
    - Mutations (update/partial_update/destroy): when If-Match is present and does not match current ETag, returns 412.
      When If-Match is absent, proceeds (frontend can adopt conditionals progressively).
    """

    def _compute_etag_from_instance(self, instance) -> str:
        # Prefer updated_at if available; else fallback to id-based hash
        try:
            lm = getattr(instance, 'updated_at', None)
            if lm:
                payload = lm.isoformat()
            else:
                payload = f"{getattr(instance, 'id', '')}"
        except Exception:
            payload = f"{getattr(instance, 'id', '')}"
        return hashlib.md5(payload.encode()).hexdigest()

    def _attach_etag_headers(self, response: Response, instance):
        try:
            etag = self._compute_etag_from_instance(instance)
            response['ETag'] = f'"{etag}"'
            lm = getattr(instance, 'updated_at', None)
            if lm:
                response['Last-Modified'] = http_date(lm.timestamp())
        except Exception:
            pass

    # Detail GET
    def retrieve(self, request, *args, **kwargs):  # type: ignore[override]
        instance = self.get_object()
        current_etag = self._compute_etag_from_instance(instance)
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == current_etag:
            resp = HttpResponseNotModified()
            resp['ETag'] = f'"{current_etag}"'
            lm = getattr(instance, 'updated_at', None)
            if lm:
                resp['Last-Modified'] = http_date(lm.timestamp())
            return resp
        response: Response = super().retrieve(request, *args, **kwargs)  # type: ignore
        self._attach_etag_headers(response, instance)
        return response

    # Conditional helper for mutations
    def _precondition_check(self, request, instance):
        if_match = request.META.get('HTTP_IF_MATCH')
        if if_match:
            current_etag = self._compute_etag_from_instance(instance)
            if if_match.strip('"') != current_etag:
                return Response({'detail': 'Precondition failed'}, status=status.HTTP_412_PRECONDITION_FAILED)
        return None

    def update(self, request, *args, **kwargs):  # type: ignore[override]
        instance = self.get_object()
        pc = self._precondition_check(request, instance)
        if pc is not None:
            return pc
        response: Response = super().update(request, *args, **kwargs)  # type: ignore
        try:
            # Avoid a second get_object() which may 404 if queryset filters changed
            instance.refresh_from_db()
            self._attach_etag_headers(response, instance)
        except Exception:
            # Best-effort header attachment only; never fail the response here
            pass
        return response

    def partial_update(self, request, *args, **kwargs):  # type: ignore[override]
        instance = self.get_object()
        pc = self._precondition_check(request, instance)
        if pc is not None:
            return pc
        response: Response = super().partial_update(request, *args, **kwargs)  # type: ignore
        try:
            instance.refresh_from_db()
            self._attach_etag_headers(response, instance)
        except Exception:
            pass
        return response

    def destroy(self, request, *args, **kwargs):  # type: ignore[override]
        instance = self.get_object()
        pc = self._precondition_check(request, instance)
        if pc is not None:
            return pc
        return super().destroy(request, *args, **kwargs)  # type: ignore
