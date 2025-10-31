from datetime import date, timedelta
from django.test import TestCase
from assignments.models import Assignment, WeeklyAssignmentSnapshot, AssignmentMembershipEvent
from projects.models import Project
from people.models import Person
from departments.models import Department
from deliverables.models import Deliverable
from assignments.snapshot_service import write_weekly_assignment_snapshots
from core.week_utils import sunday_of_week


class WeeklySnapshotsWriterTests(TestCase):
    def setUp(self):
        self.dept = Department.objects.create(name='Engineering')
        self.person = Person.objects.create(name='Alice', weekly_capacity=40, department=self.dept)
        self.project = Project.objects.create(name='ProjA', status='active', client='Acme')

    def test_write_snapshot_and_idempotency(self):
        # Create deliverables: next week is DD
        d1 = Deliverable.objects.create(project=self.project, percentage=20, description='SD', date=date.today())
        d2 = Deliverable.objects.create(project=self.project, percentage=60, description='DD', date=date.today() + timedelta(days=14))
        # Assignment with hours this week
        a = Assignment.objects.create(person=self.person, project=self.project, weekly_hours={})
        wk = sunday_of_week(date.today())
        a.weekly_hours[wk.strftime('%Y-%m-%d')] = 10
        a.save()

        res1 = write_weekly_assignment_snapshots(wk)
        self.assertTrue(res1.get('lock_acquired'))
        # One snapshot row with phase SD or DD depending on dates (forward selection)
        qs = WeeklyAssignmentSnapshot.objects.filter(person=self.person, project=self.project, week_start=wk)
        self.assertEqual(qs.count(), 1)
        snap = qs.first()
        self.assertGreater(snap.hours, 0)
        # Idempotent rerun updates, not duplicate
        res2 = write_weekly_assignment_snapshots(wk)
        self.assertTrue(res2.get('lock_acquired'))
        self.assertEqual(WeeklyAssignmentSnapshot.objects.filter(person=self.person, project=self.project, week_start=wk).count(), 1)

    def test_emit_join_event_first_run(self):
        a = Assignment.objects.create(person=self.person, project=self.project, weekly_hours={})
        wk = sunday_of_week(date.today())
        prev = wk - timedelta(days=7)
        # Current has hours; prior none
        a.weekly_hours[wk.strftime('%Y-%m-%d')] = 5
        a.save()
        res = write_weekly_assignment_snapshots(wk)
        self.assertTrue(res.get('lock_acquired'))
        # Expect a joined event for current week
        ev = AssignmentMembershipEvent.objects.filter(person=self.person, project=self.project, week_start=wk, event_type='joined')
        self.assertEqual(ev.count(), 1)

