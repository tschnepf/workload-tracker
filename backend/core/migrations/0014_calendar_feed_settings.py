from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_backfill_pre_deliverable_global_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='CalendarFeedSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('deliverables_token', models.CharField(max_length=128, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
            },
        ),
    ]

