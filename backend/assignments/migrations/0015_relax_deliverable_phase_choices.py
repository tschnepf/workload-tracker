from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('assignments', '0014_add_ifc_phase'),
    ]

    operations = [
        migrations.AlterField(
            model_name='assignmentmembershipevent',
            name='deliverable_phase',
            field=models.CharField(default='other', max_length=20),
        ),
        migrations.AlterField(
            model_name='weeklyassignmentsnapshot',
            name='deliverable_phase',
            field=models.CharField(default='other', max_length=20),
        ),
    ]
