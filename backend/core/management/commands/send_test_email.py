from django.core.management.base import BaseCommand, CommandError
from django.core.mail import send_mail
from django.conf import settings


class Command(BaseCommand):
    help = "Send a test email using current Django email settings."

    def add_arguments(self, parser):
        parser.add_argument('to', help='Recipient email address')
        parser.add_argument('--subject', default='Workload Tracker Test Email')
        parser.add_argument('--body', default='This is a test email confirming SMTP configuration.')

    def handle(self, *args, **options):
        to = options['to']
        subject = options['subject']
        body = options['body']

        backend = getattr(settings, 'EMAIL_BACKEND', '')
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)

        if not backend or ('console' in backend and not settings.DEBUG):
            self.stdout.write(self.style.WARNING(
                f"EMAIL_BACKEND is '{backend}'. In production, set SMTP env vars to actually send."
            ))

        try:
            sent = send_mail(subject, body, from_email, [to], fail_silently=False)
        except Exception as e:
            raise CommandError(f"Failed to send email: {e}")

        if sent:
            self.stdout.write(self.style.SUCCESS(
                f"Sent test email to {to} using backend {backend} from {from_email or 'default'}"
            ))
        else:
            raise CommandError("send_mail returned 0; email not sent")

