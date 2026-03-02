from datetime import date, timedelta

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from assignments.models import Assignment
from core.models import AutoHoursTemplate, AutoHoursTemplateRoleSetting
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectStatusDefinition, ProjectRole
from roles.models import Role
from verticals.models import Vertical


class ForecastPlannerApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.admin = User.objects.create_user(username="planner_admin", password="pw", is_staff=True)
        self.manager = User.objects.create_user(username="planner_manager", password="pw", is_staff=False)
        self.user = User.objects.create_user(username="planner_user", password="pw", is_staff=False)
        manager_group, _ = Group.objects.get_or_create(name="Manager")
        self.manager.groups.add(manager_group)

        self.vertical = Vertical.objects.create(name="Forecast Vertical")
        self.department = Department.objects.create(name="Planner Dept", vertical=self.vertical, is_active=True)

        self.people_role = Role.objects.create(name="Planner People Role", is_active=True, sort_order=1)
        self.person = Person.objects.create(
            name="Planner Person",
            department=self.department,
            role=self.people_role,
            weekly_capacity=40,
            is_active=True,
        )

        self.project_role = ProjectRole.objects.create(
            name="Planner Project Role",
            normalized_name="planner project role",
            department=self.department,
            is_active=True,
        )
        self.template = AutoHoursTemplate.objects.create(
            name="Planner Template",
            is_active=True,
            phase_keys=["sd"],
            weeks_by_phase={"sd": 2},
        )
        template_setting = AutoHoursTemplateRoleSetting.objects.create(
            template=self.template,
            role=self.project_role,
            ramp_percent_by_phase={"sd": {"0": 50, "1": 50}},
            role_count_by_phase={"sd": 1},
        )
        template_setting.people_roles.set([self.people_role.id])

        for key, include, ca in [
            ("active", True, False),
            ("active_ca", True, True),
            ("on_hold", False, False),
        ]:
            ProjectStatusDefinition.objects.update_or_create(
                key=key,
                defaults={
                    "label": key.replace("_", " ").title(),
                    "include_in_analytics": include,
                    "treat_as_ca_when_no_deliverable": ca,
                    "is_active": True,
                    "is_system": True,
                },
            )

        self.active_project = Project.objects.create(
            name="Planner Active Project",
            status="active",
            vertical=self.vertical,
            is_active=True,
        )
        self.on_hold_project = Project.objects.create(
            name="Planner On Hold Project",
            status="on_hold",
            vertical=self.vertical,
            is_active=True,
        )

        sunday = date.today() - timedelta(days=(date.today().weekday() + 1) % 7)
        week_key = sunday.isoformat()
        Assignment.objects.create(
            person=self.person,
            project=self.active_project,
            weekly_hours={week_key: 20},
            is_active=True,
        )
        Assignment.objects.create(
            person=self.person,
            project=self.on_hold_project,
            weekly_hours={week_key: 10},
            is_active=True,
        )

    def test_planner_bootstrap_allows_manager_and_returns_defaults(self):
        self.client.force_authenticate(self.manager)
        resp = self.client.get("/api/reports/forecast/planner-bootstrap/?weeks=8")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        self.assertIn("defaultIncludedStatusKeys", payload)
        self.assertEqual(sorted(payload["defaultIncludedStatusKeys"]), ["active", "active_ca"])
        self.assertIn("statusDefinitions", payload)
        self.assertIn("templates", payload)
        self.assertIn("baselineEvaluation", payload)

    def test_evaluate_rejects_invalid_status_keys(self):
        self.client.force_authenticate(self.manager)
        resp = self.client.post(
            "/api/reports/forecast/evaluate/",
            {
                "weeks": 8,
                "statusKeys": ["active", "bogus_status"],
                "projects": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertIn("invalidStatusKeys", resp.json())

    def test_evaluate_status_filter_changes_baseline(self):
        self.client.force_authenticate(self.manager)
        active_only = self.client.post(
            "/api/reports/forecast/evaluate/",
            {"weeks": 8, "statusKeys": ["active"], "projects": []},
            format="json",
        )
        self.assertEqual(active_only.status_code, status.HTTP_200_OK, active_only.content)
        active_plus_on_hold = self.client.post(
            "/api/reports/forecast/evaluate/",
            {"weeks": 8, "statusKeys": ["active", "on_hold"], "projects": []},
            format="json",
        )
        self.assertEqual(active_plus_on_hold.status_code, status.HTTP_200_OK, active_plus_on_hold.content)
        active_total = active_only.json()["result"]["totals"]["baselineDemand"][0]
        with_on_hold_total = active_plus_on_hold.json()["result"]["totals"]["baselineDemand"][0]
        self.assertGreater(with_on_hold_total, active_total)

    def test_scenario_crud_and_shared_access(self):
        self.client.force_authenticate(self.manager)
        create = self.client.post(
            "/api/reports/forecast/scenarios/",
            {
                "name": "Q2 Pursuit Pack",
                "isShared": True,
                "scenarioConfig": {
                    "weeks": 26,
                    "statusKeys": ["active", "active_ca"],
                    "projects": [
                        {
                            "templateId": self.template.id,
                            "name": "Proposed A",
                            "startDate": date.today().isoformat(),
                            "probabilityPct": 80,
                            "quantity": 1,
                        }
                    ],
                },
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.content)
        scenario = create.json()["scenario"]
        scenario_id = scenario["id"]
        token = scenario["sharedToken"]
        self.assertTrue(token)

        listing = self.client.get("/api/reports/forecast/scenarios/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.content)
        self.assertEqual(len(listing.json()["results"]), 1)

        self.client.force_authenticate(self.user)
        shared = self.client.get(f"/api/reports/forecast/scenarios/shared/{token}/")
        self.assertEqual(shared.status_code, status.HTTP_200_OK, shared.content)

        self.client.force_authenticate(self.manager)
        patch = self.client.patch(
            f"/api/reports/forecast/scenarios/{scenario_id}/",
            {"isShared": False},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK, patch.content)

        self.client.force_authenticate(self.user)
        shared_forbidden = self.client.get(f"/api/reports/forecast/scenarios/shared/{token}/")
        self.assertEqual(shared_forbidden.status_code, status.HTTP_403_FORBIDDEN, shared_forbidden.content)
