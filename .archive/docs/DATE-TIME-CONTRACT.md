Date/Time Contract
==================

Overview
- Backend emits ISO-8601 timestamps in UTC.
- Frontend displays dates in the user’s local timezone and locale.

Backend (Django)
- TIME_ZONE = 'UTC'
- USE_TZ = True
- Serialize datetimes as ISO-8601 (e.g., 2025-09-12T14:05:00Z).
- Date-only fields may be serialized as YYYY-MM-DD.

Frontend Rules
- Never manually offset or guess timezones.
- Use the shared helper to format UTC to local for display.

Helper
- Path: frontend/src/utils/dates.ts
- API: formatUtcToLocal(iso: string, opts?: Intl.DateTimeFormatOptions): string
  - Default uses { dateStyle: 'medium' }.
  - Returns '' on invalid input.

Examples
- formatUtcToLocal('2025-09-12T14:05:00Z') -> locale-specific date like "Sep 12, 2025" (and time if opts include timeStyle).
- formatUtcToLocal('2025-09-12', { dateStyle: 'long' }) -> locale-specific long date.

Usage
- Dashboard recent assignments: formats created timestamp.
- Roles list: formats createdAt.
- Deliverables: formats date if present.

