from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0014_project_bqe_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='project',
            name='status',
            field=models.CharField(choices=[('planning', 'Planning'), ('active', 'Active'), ('active_ca', 'Active CA'), ('on_hold', 'On Hold'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('inactive', 'Inactive')], default='active', max_length=20),
        ),
    ]
