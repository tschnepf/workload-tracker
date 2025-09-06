from django.db import migrations
from django.contrib.auth.models import Group


def create_default_groups(apps, schema_editor):
    # Using ORM directly; safe in simple migrations
    for name in ("Admin", "Manager", "User"):
        Group.objects.get_or_create(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_backfill_user_profiles'),
    ]

    operations = [
        migrations.RunPython(create_default_groups, migrations.RunPython.noop),
    ]

