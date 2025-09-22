from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0007_seed_predeliverabletype'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='PreDeliverableItem',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('generated_date', models.DateField()),
                ('days_before', models.PositiveIntegerField()),
                ('is_completed', models.BooleanField(default=False)),
                ('completed_date', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('completed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='completed_pre_items', to='auth.user')),
                ('deliverable', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pre_items', to='deliverables.deliverable')),
                ('pre_deliverable_type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='deliverables.predeliverabletype')),
            ],
            options={
                'verbose_name': 'Pre-Deliverable Item',
                'verbose_name_plural': 'Pre-Deliverable Items',
                'ordering': ['generated_date', 'deliverable__date'],
                'unique_together': {('deliverable', 'pre_deliverable_type')},
            },
        ),
    ]

