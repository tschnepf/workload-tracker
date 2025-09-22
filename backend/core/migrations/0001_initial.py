from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('deliverables', '0006_predeliverabletype'),
    ]

    operations = [
        migrations.CreateModel(
            name='PreDeliverableGlobalSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('default_days_before', models.PositiveIntegerField()),
                ('is_enabled_by_default', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('pre_deliverable_type', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='global_settings', to='deliverables.predeliverabletype')),
            ],
            options={
                'verbose_name': 'Global Pre-Deliverable Setting',
                'ordering': ['pre_deliverable_type__sort_order'],
            },
        ),
    ]

