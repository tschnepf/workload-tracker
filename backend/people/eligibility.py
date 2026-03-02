from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q


def is_hired_on_date(hire_date: date | None, as_of_date: date) -> bool:
    """Return True when the person should be considered active on a specific date."""
    if hire_date is None:
        return True
    return hire_date <= as_of_date


def is_hired_in_week(hire_date: date | None, week_start_date: date) -> bool:
    """Return True when the hire date is within or before the target week.

    Week eligibility includes the hire week even when hire_date is mid-week.
    """
    week_end_date = week_start_date + timedelta(days=6)
    return is_hired_on_date(hire_date, week_end_date)


def active_people_on_or_before(queryset, as_of_date: date):
    """Filter a Person queryset to rows eligible on a specific date."""
    return queryset.filter(Q(hire_date__isnull=True) | Q(hire_date__lte=as_of_date))


def first_eligible_week_start(hire_date: date | None) -> date | None:
    """Return the week start date for a person's hire week.

    Returns None when hire_date is unset (eligible immediately).
    """
    if hire_date is None:
        return None
    from core.week_utils import sunday_of_week

    return sunday_of_week(hire_date)
