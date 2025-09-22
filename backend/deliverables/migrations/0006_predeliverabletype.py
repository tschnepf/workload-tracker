from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0005_reallocationaudit'),
    ]

    operations = [
        migrations.CreateModel(
            name='PreDeliverableType',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('description', models.TextField(blank=True)),
                ('default_days_before', models.IntegerField(validators=[django.core.validators.MinValueValidator(1)])),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Pre-Deliverable Type',
                'verbose_name_plural': 'Pre-Deliverable Types',
                'ordering': ['sort_order', 'name'],
            },
        ),
    ]

