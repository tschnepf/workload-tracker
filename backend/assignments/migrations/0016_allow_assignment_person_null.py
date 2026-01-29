from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0015_relax_deliverable_phase_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='assignment',
            name='person',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='people.person'),
        ),
    ]
