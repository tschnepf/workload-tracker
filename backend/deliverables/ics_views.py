from django.http import HttpResponse
from django.utils.timezone import now
from datetime import date, timedelta
from django.db.models import Q
from .models import Deliverable
from core.models import CalendarFeedSettings


def _fmt_date(d: date) -> str:
    # All-day event date in basic format
    return d.strftime('%Y%m%d')


def deliverables_ics(request):
    """Public read-only iCalendar feed for project deliverables (no pre-deliverables).

    Access is gated by a token provided as ?key=...
    """
    token = request.GET.get('key') or ''
    cfg = CalendarFeedSettings.get_active()
    if not token or token != cfg.deliverables_token:
        return HttpResponse('Forbidden', status=403)

    # Window parameters
    try:
        start_param = request.GET.get('start')
        end_param = request.GET.get('end')
        start = date.fromisoformat(start_param) if start_param else now().date()
        # default window: +18 months
        default_end = (start + timedelta(days=548))
        end = date.fromisoformat(end_param) if end_param else default_end
    except Exception:
        start = now().date()
        end = start + timedelta(days=548)

    qs = (
        Deliverable.objects
        .select_related('project')
        .filter(date__isnull=False)
        .filter(date__gte=start, date__lte=end)
        .order_by('date', 'project__name')
    )
    # Optionally exclude completed (default true)
    if (request.GET.get('include_completed') or '0') in ('0', 'false', 'False', None):
        qs = qs.filter(Q(is_completed=False) | Q(is_completed__isnull=True))

    # Build ICS
    lines: list[str] = []
    lines.append('BEGIN:VCALENDAR')
    lines.append('VERSION:2.0')
    lines.append('PRODID:-//Workload Tracker//Deliverables//EN')
    lines.append('CALSCALE:GREGORIAN')
    lines.append('X-WR-CALNAME:Project Deliverables')
    lines.append('X-WR-TIMEZONE:UTC')
    stamp = now().strftime('%Y%m%dT%H%M%SZ')
    for d in qs:
        dt = d.date  # type: ignore[assignment]
        if not dt:
            continue
        proj = getattr(d, 'project', None)
        proj_name = getattr(proj, 'name', '') or ''
        client = getattr(proj, 'client', '') or ''
        title_parts = []
        if proj_name:
            title_parts.append(proj_name)
        if d.description:
            title_parts.append(str(d.description))
        elif d.percentage is not None:
            title_parts.append(f"{int(d.percentage)}%")
        summary = ' — '.join(title_parts) if title_parts else 'Deliverable'
        uid = f"deliverable-{d.id}@workload-tracker"
        desc_parts = []
        if client:
            desc_parts.append(f"Client: {client}")
        # Simple project URL hint if behind a proxy
        try:
            origin = f"{request.scheme}://{request.get_host()}"
            if proj and getattr(proj, 'id', None):
                desc_parts.append(f"Project: {proj_name} ({origin}/projects/{proj.id})")
        except Exception:
            pass
        lines.append('BEGIN:VEVENT')
        lines.append(f'UID:{uid}')
        lines.append(f'DTSTAMP:{stamp}')
        lines.append(f'DTSTART;VALUE=DATE:{_fmt_date(dt)}')
        lines.append(f'SUMMARY:{summary}')
        if desc_parts:
            # Fold long lines per iCal spec (optional here)
            desc = '\n'.join(desc_parts)
            lines.append(f'DESCRIPTION:{desc}')
        lines.append('END:VEVENT')

    lines.append('END:VCALENDAR')
    ics = '\r\n'.join(lines) + '\r\n'
    return HttpResponse(ics, content_type='text/calendar; charset=utf-8')

