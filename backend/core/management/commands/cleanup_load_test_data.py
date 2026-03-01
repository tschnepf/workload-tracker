from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import UserProfile
from assignments.models import Assignment
from people.models import Person
from projects.models import Project


class Command(BaseCommand):
    help = "Remove load-test entities tagged with LT_<run_id>_ prefix."

    def add_arguments(self, parser):
        parser.add_argument("--run-id", required=True, help="Run identifier used in LT_<run_id>_ prefix.")

    @transaction.atomic
    def handle(self, *args, **options):
        run_id = str(options["run_id"]).strip()
        if not run_id:
            raise CommandError("--run-id is required")

        prefix = f"LT_{run_id}_"
        lower_prefix = prefix.lower()

        assignments_qs = Assignment.objects.filter(project__name__startswith=prefix)
        projects_qs = Project.objects.filter(name__startswith=prefix)
        profiles_qs = UserProfile.objects.filter(user__username__startswith=lower_prefix)
        people_qs = Person.objects.filter(name__startswith=prefix)

        assignment_deleted = assignments_qs.count()
        project_deleted = projects_qs.count()
        profile_deleted = profiles_qs.count()
        people_deleted = people_qs.count()

        assignments_qs.delete()
        projects_qs.delete()
        profiles_qs.delete()
        User = get_user_model()
        users_qs = User.objects.filter(username__startswith=lower_prefix)
        user_deleted = users_qs.count()
        users_qs.delete()
        people_qs.delete()

        summary = {
            "prefix": prefix,
            "deleted": {
                "assignments": assignment_deleted,
                "projects": project_deleted,
                "profiles": profile_deleted,
                "users": user_deleted,
                "people": people_deleted,
            },
        }
        self.stdout.write(self.style.SUCCESS(str(summary)))
