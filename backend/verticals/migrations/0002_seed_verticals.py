from django.db import migrations


def seed_verticals_and_projects(apps, schema_editor):
    Vertical = apps.get_model('verticals', 'Vertical')
    Project = apps.get_model('projects', 'Project')

    design, _ = Vertical.objects.get_or_create(name='Design', defaults={'short_name': ''})
    Vertical.objects.get_or_create(name='VDC', defaults={'short_name': ''})

    # Set all existing projects to Design on initial rollout.
    Project.objects.all().update(vertical_id=design.id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('verticals', '0001_initial'),
        ('projects', '0024_project_vertical'),
    ]

    operations = [
        migrations.RunPython(seed_verticals_and_projects, noop),
    ]
