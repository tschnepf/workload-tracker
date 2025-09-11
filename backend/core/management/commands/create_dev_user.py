from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction


class Command(BaseCommand):
    help = "Create or update a development user (username/password) with optional staff/superuser flags."

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True, help='Username for the dev user')
        parser.add_argument('--password', required=True, help='Password for the dev user')
        parser.add_argument('--email', default='', help='Optional email address')
        parser.add_argument('--staff', action='store_true', help='Mark user as staff')
        parser.add_argument('--superuser', action='store_true', help='Mark user as superuser')

    @transaction.atomic
    def handle(self, *args, **options):
        username = options['username']
        password = options['password']
        email = options.get('email') or ''
        is_staff = bool(options.get('staff'))
        is_superuser = bool(options.get('superuser'))

        User = get_user_model()
        user, created = User.objects.get_or_create(username=username, defaults={'email': email})
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created user '{username}'"))
        else:
            # Update email if provided
            if email and user.email != email:
                user.email = email
                self.stdout.write(self.style.WARNING(f"Updated email for '{username}'"))

        if is_staff and not user.is_staff:
            user.is_staff = True
        if is_superuser and not user.is_superuser:
            user.is_superuser = True

        user.set_password(password)
        user.save()

        self.stdout.write(self.style.SUCCESS(
            f"Dev user ready: username='{username}', staff={user.is_staff}, superuser={user.is_superuser}"
        ))

