from datetime import date, timedelta

from django.core.management import call_command
from django.test import TestCase

from assignments.models import Assignment, AssignmentWeekHour
from assignments.week_hours_service import parity_for_assignment, sync_assignment_week_hours
from people.models import Person
from projects.models import Project


def _current_sunday() -> str:
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    return (today - timedelta(days=days_since_sunday)).isoformat()


class AssignmentWeekHoursServiceTests(TestCase):
    def setUp(self):
        self.person = Person.objects.create(name="Week Hours Person")
        self.project = Project.objects.create(name="Week Hours Project")
        self.assignment = Assignment.objects.create(
            person=self.person,
            project=self.project,
            weekly_hours={_current_sunday(): 8.0},
            is_active=True,
        )

    def test_sync_and_parity(self):
        sync_assignment_week_hours(self.assignment, self.assignment.weekly_hours, clear_missing=True)
        self.assertEqual(AssignmentWeekHour.objects.filter(assignment_id=self.assignment.id).count(), 1)
        parity = parity_for_assignment(self.assignment)
        self.assertTrue(parity.matches)

    def test_sync_removes_missing_rows(self):
        base = _current_sunday()
        next_week = (date.fromisoformat(base) + timedelta(days=7)).isoformat()
        self.assignment.weekly_hours = {base: 4.0, next_week: 3.0}
        self.assignment.save(update_fields=["weekly_hours", "updated_at"])
        sync_assignment_week_hours(self.assignment, self.assignment.weekly_hours, clear_missing=True)
        self.assertEqual(AssignmentWeekHour.objects.filter(assignment_id=self.assignment.id).count(), 2)

        self.assignment.weekly_hours = {base: 6.0}
        self.assignment.save(update_fields=["weekly_hours", "updated_at"])
        sync_assignment_week_hours(self.assignment, self.assignment.weekly_hours, clear_missing=True)
        rows = AssignmentWeekHour.objects.filter(assignment_id=self.assignment.id)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().week_start.isoformat(), base)

    def test_commands_sync_and_verify(self):
        call_command("sync_assignment_week_hours", "--full")
        call_command("verify_assignment_hours_parity", "--fail-on-mismatch")
