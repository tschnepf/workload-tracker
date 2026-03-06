from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0041_task_progress_color_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='WebPushGlobalSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('enabled', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Web Push Global Settings',
                'ordering': ['key'],
            },
        ),
    ]
