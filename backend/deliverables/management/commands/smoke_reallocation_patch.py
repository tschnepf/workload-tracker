from __future__ import annotations

import json
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model

from rest_framework.test import APIRequestFactory, force_authenticate

from projects.models import Project
from people.models import Person
from assignments.models import Assignment
from deliverables.models import Deliverable
from deliverables.views import DeliverableViewSet
from core.week_utils import sunday_of_week


class Command(BaseCommand):
    help = "Smoke test: create data, PATCH deliverable date to trigger auto-reallocation, return summary."

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='Output JSON only')

    def handle(self, *args, **options):
        as_json = bool(options.get('json'))
        User = get_user_model()

        # Create minimal objects in a single transaction and clean up afterwards
        with transaction.atomic():
            # Seed
            proj = Project.objects.create(name='Smoke Test Project')
            person = Person.objects.create(name='Smoke Tester', weekly_capacity=40)
            # Set an old date and neighbor deliverables for window
            old_date = date.today() + timedelta(days=7)  # next week
            prev_date = old_date - timedelta(days=21)
            next_date = old_date + timedelta(days=21)
            d_prev = Deliverable.objects.create(project=proj, description='Prev', date=prev_date, sort_order=10)
            d = Deliverable.objects.create(project=proj, description='Target', date=old_date, sort_order=20)
            d_next = Deliverable.objects.create(project=proj, description='Next', date=next_date, sort_order=30)

            # Assignment with weekly hours in/around window
            a = Assignment.objects.create(person=person, project=proj, weekly_hours={})
            s_old = sunday_of_week(old_date)
            s_prev = sunday_of_week(prev_date + timedelta(days=7))
            a.weekly_hours = {
                s_prev.isoformat(): 5,
                s_old.isoformat(): 5,
            }
            a.save(update_fields=['weekly_hours'])

            # Prepare request
            factory = APIRequestFactory()
            new_date = old_date + timedelta(days=14)  # +2 weeks
            req = factory.patch(f'/deliverables/{d.id}/', {'date': new_date.isoformat()}, format='json')

            # Auth user (bypass IsAuthenticated)
            user = User.objects.create(username='smoke_realloc_user', is_staff=True)
            force_authenticate(req, user=user)

            view = DeliverableViewSet.as_view({'patch': 'partial_update'})
            resp = view(req, pk=d.id)

            code = getattr(resp, 'status_code', 500)
            data = getattr(resp, 'data', {}) or {}
            reallocation = data.get('reallocation')

            result = {
                'status': code,
                'reallocation': reallocation,
                'assignment_before_keys': [s_prev.isoformat(), s_old.isoformat()],
            }

            if as_json:
                self.stdout.write(json.dumps(result))
            else:
                self.stdout.write(json.dumps(result, indent=2))

            # Roll back the transaction so DB remains unchanged
            transaction.set_rollback(True)
