import hashlib
import json
import os
import random
import sys
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import UserProfile
from assignments.models import Assignment
from departments.models import Department
from people.models import Person
from projects.models import Project
from roles.models import Role


def _sunday_week_keys(weeks: int) -> list[str]:
    today = date.today()
    offset = (today.weekday() + 1) % 7
    first_sunday = today - timedelta(days=offset)
    return [(first_sunday + timedelta(days=(7 * idx))).isoformat() for idx in range(weeks)]


def _rand_hours(rng: random.Random, week_keys: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for key in week_keys:
        if rng.random() < 0.35:
            out[key] = round(rng.uniform(2.0, 18.0), 2)
    return out


class Command(BaseCommand):
    help = (
        "Seed deterministic throwaway load-test data (users, people, projects, assignments) "
        "tagged with LT_<run_id>_ prefix."
    )

    def add_arguments(self, parser):
        parser.add_argument("--run-id", required=True, help="Run identifier used in LT_<run_id>_ prefix.")
        parser.add_argument("--manager-count", type=int, default=48)
        parser.add_argument("--user-count", type=int, default=72)
        parser.add_argument("--project-count", type=int, default=200)
        parser.add_argument("--person-count", type=int, default=600)
        parser.add_argument("--assignment-count", type=int, default=4000)
        parser.add_argument("--week-count", type=int, default=12)
        parser.add_argument("--hot-assignment-count", type=int, default=120)
        parser.add_argument("--password", default="LoadTest123!")
        parser.add_argument(
            "--purge-existing",
            action="store_true",
            default=False,
            help="Delete any existing LT_<run_id>_ records before seeding.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            default=False,
            help="Emit a single JSON object to stdout (no extra text).",
        )
        parser.add_argument(
            "--hard-exit",
            action="store_true",
            default=False,
            help="Force process exit immediately after successful transaction commit.",
        )

    def _cleanup_prefix(self, prefix: str) -> None:
        Assignment.objects.filter(project__name__startswith=prefix).delete()
        Project.objects.filter(name__startswith=prefix).delete()
        UserProfile.objects.filter(user__username__startswith=prefix.lower()).delete()
        User = get_user_model()
        User.objects.filter(username__startswith=prefix.lower()).delete()
        Person.objects.filter(name__startswith=prefix).delete()

    def _pick(self, rng: random.Random, items: list):
        return items[rng.randrange(len(items))] if items else None

    @transaction.atomic
    def handle(self, *args, **options):
        run_id = str(options["run_id"]).strip()
        if not run_id:
            raise CommandError("--run-id is required")
        if any(int(options[k]) <= 0 for k in ("manager_count", "user_count", "project_count", "person_count", "assignment_count", "week_count")):
            raise CommandError("All count options must be > 0")

        prefix = f"LT_{run_id}_"
        lower_prefix = prefix.lower()
        seed = int(hashlib.sha256(run_id.encode("utf-8")).hexdigest()[:16], 16)
        rng = random.Random(seed)

        if options["purge_existing"]:
            self._cleanup_prefix(prefix)

        manager_group, _ = Group.objects.get_or_create(name="Manager")
        user_group, _ = Group.objects.get_or_create(name="User")

        departments = list(Department.objects.all().order_by("id"))
        roles = list(Role.objects.filter(is_active=True).order_by("id"))
        week_keys = _sunday_week_keys(int(options["week_count"]))

        User = get_user_model()

        manager_people: list[Person] = []
        manager_users: list[dict] = []
        for idx in range(1, int(options["manager_count"]) + 1):
            uname = f"{lower_prefix}mgr_{idx:03d}"
            person = Person.objects.create(
                name=f"{prefix}Manager Person {idx:03d}",
                weekly_capacity=40,
                department=self._pick(rng, departments),
                role=self._pick(rng, roles),
                is_active=True,
            )
            user, _ = User.objects.get_or_create(
                username=uname,
                defaults={"email": f"{uname}@load.test", "is_staff": False, "is_superuser": False},
            )
            user.set_password(options["password"])
            user.is_staff = False
            user.is_superuser = False
            user.save(update_fields=["password", "is_staff", "is_superuser"])
            user.groups.clear()
            user.groups.add(manager_group)
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.person = person
            profile.save(update_fields=["person", "updated_at"])

            manager_people.append(person)
            manager_users.append({"username": uname, "password": options["password"], "role": "manager", "personId": person.id})

        read_people: list[Person] = []
        user_users: list[dict] = []
        for idx in range(1, int(options["user_count"]) + 1):
            uname = f"{lower_prefix}usr_{idx:03d}"
            person = Person.objects.create(
                name=f"{prefix}User Person {idx:03d}",
                weekly_capacity=36,
                department=self._pick(rng, departments),
                role=self._pick(rng, roles),
                is_active=True,
            )
            user, _ = User.objects.get_or_create(
                username=uname,
                defaults={"email": f"{uname}@load.test", "is_staff": False, "is_superuser": False},
            )
            user.set_password(options["password"])
            user.is_staff = False
            user.is_superuser = False
            user.save(update_fields=["password", "is_staff", "is_superuser"])
            user.groups.clear()
            user.groups.add(user_group)
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.person = person
            profile.save(update_fields=["person", "updated_at"])

            read_people.append(person)
            user_users.append({"username": uname, "password": options["password"], "role": "user", "personId": person.id})

        projects: list[Project] = []
        statuses = ["planning", "active", "active_ca", "on_hold"]
        for idx in range(1, int(options["project_count"]) + 1):
            projects.append(
                Project(
                    name=f"{prefix}Project {idx:04d}",
                    client=f"{prefix}Client {((idx - 1) % 25) + 1:03d}",
                    status=statuses[idx % len(statuses)],
                    project_number=f"{lower_prefix}{idx:06d}",
                    is_active=True,
                    description="Load-test seeded project",
                )
            )
        Project.objects.bulk_create(projects, batch_size=250)
        projects = list(Project.objects.filter(name__startswith=prefix).order_by("id"))

        seeded_people_target = int(options["person_count"])
        account_linked_people = len(manager_people) + len(read_people)
        extra_people_count = max(seeded_people_target - account_linked_people, 0)
        extra_people: list[Person] = []
        for idx in range(1, extra_people_count + 1):
            extra_people.append(
                Person(
                    name=f"{prefix}Extra Person {idx:04d}",
                    weekly_capacity=36,
                    department=self._pick(rng, departments),
                    role=self._pick(rng, roles),
                    is_active=True,
                )
            )
        if extra_people:
            Person.objects.bulk_create(extra_people, batch_size=500)
            extra_people = list(Person.objects.filter(name__startswith=f"{prefix}Extra Person ").order_by("id"))

        all_people = manager_people + read_people + extra_people
        if not all_people:
            raise CommandError("No people available to seed assignments.")
        if not projects:
            raise CommandError("No projects available to seed assignments.")

        assignments_to_create: list[Assignment] = []
        for _ in range(int(options["assignment_count"])):
            person = self._pick(rng, all_people)
            project = self._pick(rng, projects)
            if person is None or project is None:
                continue
            assignments_to_create.append(
                Assignment(
                    person=person,
                    project=project,
                    project_name=project.name,
                    department=person.department,
                    weekly_hours=_rand_hours(rng, week_keys),
                    is_active=True,
                )
            )
        Assignment.objects.bulk_create(assignments_to_create, batch_size=500)

        seeded_assignments = list(
            Assignment.objects.filter(project__name__startswith=prefix, is_active=True).order_by("id").values_list("id", flat=True)
        )
        hot_count = min(int(options["hot_assignment_count"]), len(seeded_assignments))
        hot_assignment_ids = rng.sample(seeded_assignments, hot_count) if hot_count > 0 else []

        manifest = {
            "runId": run_id,
            "prefix": prefix,
            "generatedAt": timezone.now().isoformat(),
            "seed": seed,
            "weekKeys": week_keys,
            "managerUsers": manager_users,
            "userUsers": user_users,
            "ids": {
                "projectIds": [p.id for p in projects],
                "personIds": [p.id for p in all_people],
                "assignmentIds": seeded_assignments,
                "hotAssignmentIds": hot_assignment_ids,
                "departmentIds": [d.id for d in departments],
                "roleIds": [r.id for r in roles],
            },
            "counts": {
                "managerUsers": len(manager_users),
                "userUsers": len(user_users),
                "projects": len(projects),
                "people": len(all_people),
                "assignments": len(seeded_assignments),
            },
        }

        manifest_json = json.dumps(manifest)

        if options["json"]:
            if options["hard_exit"]:
                def _emit_and_exit() -> None:
                    sys.stdout.write(manifest_json)
                    sys.stdout.flush()
                    os._exit(0)

                transaction.on_commit(_emit_and_exit)
                return

            self.stdout.write(manifest_json)
            return

        self.stdout.write(self.style.SUCCESS(f"Seeded load-test data for {prefix}"))
        self.stdout.write(json.dumps(manifest, indent=2))
