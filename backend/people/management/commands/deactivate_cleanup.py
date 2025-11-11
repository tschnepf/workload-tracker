from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

from people.models import Person
from people.services import deactivate_person_cleanup


class Command(BaseCommand):
    help = 'Retroactively clean up assignments and links for a deactivated person.'

    def add_arguments(self, parser):
        parser.add_argument('person_id', type=int, help='ID of the person to clean up')
        parser.add_argument('--mode', choices=['all', 'future'], default='all', help='Zero-out mode for weekly hours')
        parser.add_argument('--actor', type=int, default=None, help='Actor user id for audit (optional)')

    def handle(self, *args, **options):
        pid = options['person_id']
        mode = options['mode']
        actor = options.get('actor')

        try:
            person = Person.objects.get(id=pid)
        except Person.DoesNotExist:
            raise CommandError(f'Person {pid} does not exist')

        result = deactivate_person_cleanup(person_id=person.id, zero_mode=mode, actor_user_id=actor)
        self.stdout.write(self.style.SUCCESS(f"Cleanup complete for person {person.id} - {result}"))

