from datetime import date, timedelta
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from assignments.models import Assignment
from core.models import AutoHoursRoleSetting, AutoHoursTemplate, AutoHoursTemplateRoleSetting, DeliverablePhaseDefinition
from core.week_utils import sunday_of_week
from departments.models import Department
from deliverables.models import Deliverable
from people.models import Person
from projects.models import Project, ProjectRole


class ProjectCreateAutoHoursSeedTests(TestCase):
    def setUp(self):
        suffix = uuid4().hex[:8]
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username=f"project_seed_admin_{suffix}",
            password="pw",
            is_staff=True,
        )
        self.client.force_authenticate(self.admin)

        self.department = Department.objects.create(name=f"Seed Dept {suffix}")
        self.project_role = ProjectRole.objects.create(
            name=f"Seed Role {suffix}",
            normalized_name=f"seed role {suffix}",
            department=self.department,
            is_active=True,
            sort_order=1,
        )
        DeliverablePhaseDefinition.objects.get_or_create(
            key="sd",
            defaults={
                "label": "SD",
                "description_tokens": ["sd"],
                "range_min": 1,
                "range_max": 100,
                "sort_order": 1,
            },
        )

    def test_create_project_with_template_start_date_seeds_placeholders(self):
        template = AutoHoursTemplate.objects.create(
            name=f"Seed Template {uuid4().hex[:8]}",
            phase_keys=["sd"],
            weeks_by_phase={"sd": 3},
            is_active=True,
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=template,
            role=self.project_role,
            ramp_percent_by_phase={"sd": {"0": 50, "1": 25, "2": 0}},
            role_count_by_phase={"sd": 2},
        )

        start_date = date(2026, 3, 18)
        resp = self.client.post(
            "/api/projects/",
            {
                "name": f"Seeded Template Project {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
                "startDate": start_date.isoformat(),
                "autoHoursTemplateId": template.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        project_id = int(resp.json()["id"])

        placeholders = list(
            Assignment.objects.filter(
                project_id=project_id,
                person_id__isnull=True,
                role_on_project_ref_id=self.project_role.id,
                is_active=True,
            ).order_by("id")
        )
        self.assertEqual(len(placeholders), 2)

        week0 = sunday_of_week(start_date + timedelta(weeks=2)).isoformat()
        week1 = sunday_of_week(start_date + timedelta(weeks=1)).isoformat()
        for placeholder in placeholders:
            self.assertEqual(set((placeholder.weekly_hours or {}).keys()), {week0, week1})
            self.assertAlmostEqual(float(placeholder.weekly_hours[week0]), 18.0, places=2)
            self.assertAlmostEqual(float(placeholder.weekly_hours[week1]), 9.0, places=2)

        sd = Deliverable.objects.filter(project_id=project_id, description__iexact="SD").first()
        self.assertIsNotNone(sd)
        assert sd is not None
        self.assertEqual(sd.date, sunday_of_week(start_date + timedelta(weeks=2)) + timedelta(days=6))
        self.assertIn("placeholder", (sd.notes or "").lower())

    def test_create_project_without_template_uses_global_defaults(self):
        AutoHoursRoleSetting.objects.create(
            role=self.project_role,
            standard_percent_of_capacity=0,
            ramp_percent_by_week={},
            ramp_percent_by_phase={"sd": {"0": 40}},
            role_count_by_phase={"sd": 1},
        )

        start_date = date(2026, 4, 6)
        resp = self.client.post(
            "/api/projects/",
            {
                "name": f"Seeded Global Project {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
                "startDate": start_date.isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        project_id = int(resp.json()["id"])

        placeholders = list(
            Assignment.objects.filter(
                project_id=project_id,
                person_id__isnull=True,
                role_on_project_ref_id=self.project_role.id,
                is_active=True,
            )
        )
        self.assertEqual(len(placeholders), 1)
        week0 = sunday_of_week(start_date + timedelta(weeks=5)).isoformat()
        self.assertEqual(set((placeholders[0].weekly_hours or {}).keys()), {week0})
        self.assertAlmostEqual(float(placeholders[0].weekly_hours[week0]), 14.4, places=2)

    def test_create_project_without_start_date_does_not_seed_placeholders(self):
        template = AutoHoursTemplate.objects.create(
            name=f"No Start Seed Template {uuid4().hex[:8]}",
            phase_keys=["sd"],
            weeks_by_phase={"sd": 3},
            is_active=True,
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=template,
            role=self.project_role,
            ramp_percent_by_phase={"sd": {"0": 75}},
            role_count_by_phase={"sd": 1},
        )

        resp = self.client.post(
            "/api/projects/",
            {
                "name": f"No Start Seed Project {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
                "autoHoursTemplateId": template.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        project_id = int(resp.json()["id"])
        self.assertFalse(Assignment.objects.filter(project_id=project_id, person_id__isnull=True, is_active=True).exists())

    def test_reseed_auto_hours_updates_placeholder_and_staffed_assignments(self):
        template = AutoHoursTemplate.objects.create(
            name=f"Reseed Template {uuid4().hex[:8]}",
            phase_keys=["sd"],
            weeks_by_phase={"sd": 2},
            is_active=True,
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=template,
            role=self.project_role,
            ramp_percent_by_phase={"sd": {"0": 50, "1": 25}},
            role_count_by_phase={"sd": 1},
        )
        start_date = date(2026, 5, 20)
        create_resp = self.client.post(
            "/api/projects/",
            {
                "name": f"Reseeded Project {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
                "startDate": start_date.isoformat(),
                "autoHoursTemplateId": template.id,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        project_id = int(create_resp.json()["id"])

        person = Person.objects.create(name=f"Reseed Person {uuid4().hex[:6]}", weekly_capacity=36, department=self.department)
        staffed = Assignment.objects.create(
            person=person,
            project_id=project_id,
            project_name="Staffed",
            role_on_project_ref=self.project_role,
            role_on_project=self.project_role.name,
            department=self.department,
            weekly_hours={"2026-01-04": 3},
            is_active=True,
        )
        placeholder = Assignment.objects.filter(project_id=project_id, person_id__isnull=True).first()
        self.assertIsNotNone(placeholder)
        assert placeholder is not None
        placeholder.weekly_hours = {"2026-01-11": 2}
        placeholder.save(update_fields=["weekly_hours", "updated_at"])

        reseed_resp = self.client.post(f"/api/projects/{project_id}/reseed-auto-hours/", {}, format="json")
        self.assertEqual(reseed_resp.status_code, status.HTTP_200_OK, reseed_resp.content)
        summary = reseed_resp.json()
        self.assertEqual(int(summary.get("updatedAssignments", 0)), 2)
        self.assertEqual(int(summary.get("updatedPlaceholderAssignments", 0)), 1)
        self.assertEqual(int(summary.get("updatedStaffedAssignments", 0)), 1)
        self.assertEqual(int(summary.get("createdAssignments", 0)), 0)

        week0 = sunday_of_week(start_date + timedelta(weeks=1)).isoformat()
        week1 = sunday_of_week(start_date).isoformat()
        placeholder.refresh_from_db()
        staffed.refresh_from_db()
        for row in (placeholder, staffed):
            self.assertEqual(set((row.weekly_hours or {}).keys()), {week0, week1})
            self.assertAlmostEqual(float(row.weekly_hours[week0]), 18.0, places=2)
            self.assertAlmostEqual(float(row.weekly_hours[week1]), 9.0, places=2)

    def test_reseed_auto_hours_requires_project_start_date(self):
        create_resp = self.client.post(
            "/api/projects/",
            {
                "name": f"Reseed No Start {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        project_id = int(create_resp.json()["id"])

        reseed_resp = self.client.post(f"/api/projects/{project_id}/reseed-auto-hours/", {}, format="json")
        self.assertEqual(reseed_resp.status_code, status.HTTP_400_BAD_REQUEST, reseed_resp.content)
        self.assertIn("start date", str(reseed_resp.json().get("error", "")).lower())

    def test_reseed_auto_hours_backfills_missing_template_roles(self):
        role_b = ProjectRole.objects.create(
            name=f"Seed Role B {uuid4().hex[:6]}",
            normalized_name=f"seed role b {uuid4().hex[:6]}",
            department=self.department,
            is_active=True,
            sort_order=2,
        )
        template = AutoHoursTemplate.objects.create(
            name=f"Backfill Template {uuid4().hex[:8]}",
            phase_keys=["sd"],
            weeks_by_phase={"sd": 2},
            is_active=True,
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=template,
            role=self.project_role,
            ramp_percent_by_phase={"sd": {"0": 50, "1": 25}},
            role_count_by_phase={"sd": 2},
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=template,
            role=role_b,
            ramp_percent_by_phase={"sd": {"0": 40, "1": 20}},
            role_count_by_phase={"sd": 1},
        )

        create_resp = self.client.post(
            "/api/projects/",
            {
                "name": f"Backfill Role Project {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
                "autoHoursTemplateId": template.id,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        project_id = int(create_resp.json()["id"])
        project = Project.objects.get(id=project_id)
        project.start_date = date(2026, 6, 8)
        project.save(update_fields=["start_date", "updated_at"])

        person = Person.objects.create(name=f"Backfill Staffed {uuid4().hex[:6]}", weekly_capacity=36, department=self.department)
        Assignment.objects.create(
            person=person,
            project=project,
            project_name=project.name,
            role_on_project_ref=self.project_role,
            role_on_project=self.project_role.name,
            department=self.department,
            weekly_hours={"2026-01-04": 2},
            is_active=True,
        )

        reseed_resp = self.client.post(f"/api/projects/{project_id}/reseed-auto-hours/", {}, format="json")
        self.assertEqual(reseed_resp.status_code, status.HTTP_200_OK, reseed_resp.content)
        summary = reseed_resp.json()
        self.assertEqual(int(summary.get("createdAssignments", 0)), 2)
        self.assertEqual(int(summary.get("createdPlaceholderAssignments", 0)), 2)

        role_a_count = Assignment.objects.filter(project_id=project_id, is_active=True, role_on_project_ref_id=self.project_role.id).count()
        role_b_count = Assignment.objects.filter(project_id=project_id, is_active=True, role_on_project_ref_id=role_b.id).count()
        self.assertEqual(role_a_count, 2)
        self.assertEqual(role_b_count, 1)

        week0 = sunday_of_week(project.start_date + timedelta(weeks=1)).isoformat()
        week1 = sunday_of_week(project.start_date).isoformat()
        rows = Assignment.objects.filter(
            project_id=project_id,
            is_active=True,
            role_on_project_ref_id__in=[self.project_role.id, role_b.id],
        )
        for row in rows:
            self.assertEqual(set((row.weekly_hours or {}).keys()), {week0, week1})

    def test_sequential_phase_windows_assign_hours_and_update_placeholder_deliverables(self):
        DeliverablePhaseDefinition.objects.get_or_create(
            key="dd",
            defaults={
                "label": "DD",
                "description_tokens": ["dd"],
                "range_min": 41,
                "range_max": 89,
                "sort_order": 2,
            },
        )
        template = AutoHoursTemplate.objects.create(
            name=f"Sequential Template {uuid4().hex[:8]}",
            phase_keys=["sd", "dd"],
            weeks_by_phase={"sd": 2, "dd": 3},
            is_active=True,
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=template,
            role=self.project_role,
            ramp_percent_by_phase={
                "sd": {"0": 50},
                "dd": {"0": 25},
            },
            role_count_by_phase={"sd": 1, "dd": 1},
        )

        start_date = date(2026, 7, 8)
        resp = self.client.post(
            "/api/projects/",
            {
                "name": f"Sequential Project {uuid4().hex[:8]}",
                "client": "Internal",
                "status": "active",
                "startDate": start_date.isoformat(),
                "autoHoursTemplateId": template.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        project_id = int(resp.json()["id"])

        placeholder = Assignment.objects.filter(
            project_id=project_id,
            person_id__isnull=True,
            role_on_project_ref_id=self.project_role.id,
            is_active=True,
        ).first()
        self.assertIsNotNone(placeholder)
        assert placeholder is not None

        sd_end_week = sunday_of_week(start_date + timedelta(weeks=1)).isoformat()
        dd_end_week = sunday_of_week(start_date + timedelta(weeks=4)).isoformat()
        self.assertEqual(set((placeholder.weekly_hours or {}).keys()), {sd_end_week, dd_end_week})
        self.assertAlmostEqual(float((placeholder.weekly_hours or {})[sd_end_week]), 18.0, places=2)
        self.assertAlmostEqual(float((placeholder.weekly_hours or {})[dd_end_week]), 9.0, places=2)

        sd = Deliverable.objects.filter(project_id=project_id, description__iexact="SD").first()
        dd = Deliverable.objects.filter(project_id=project_id, description__iexact="DD").first()
        self.assertIsNotNone(sd)
        self.assertIsNotNone(dd)
        assert sd is not None
        assert dd is not None
        self.assertEqual(sd.date, sunday_of_week(start_date + timedelta(weeks=1)) + timedelta(days=6))
        self.assertEqual(dd.date, sunday_of_week(start_date + timedelta(weeks=4)) + timedelta(days=6))
        self.assertIn("placeholder", (sd.notes or "").lower())
        self.assertIn("placeholder", (dd.notes or "").lower())
