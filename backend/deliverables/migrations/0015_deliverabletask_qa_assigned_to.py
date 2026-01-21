from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0014_deliverable_tasks'),
        ('people', '0009_deactivationaudit'),
    ]

    operations = [
        migrations.AddField(
            model_name='deliverabletask',
            name='qa_assigned_to',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='qa_deliverable_tasks', to='people.person'),
        ),
    ]
