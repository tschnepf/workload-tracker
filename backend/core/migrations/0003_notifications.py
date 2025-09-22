from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_seed_global_settings'),
        ('auth', '0012_alter_user_first_name_max_length'),
        ('deliverables', '0008_predeliverableitem'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationPreference',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email_pre_deliverable_reminders', models.BooleanField(default=True)),
                ('reminder_days_before', models.PositiveIntegerField(default=1)),
                ('daily_digest', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='notification_preferences', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='NotificationLog',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(max_length=20)),
                ('sent_at', models.DateTimeField()),
                ('email_subject', models.CharField(max_length=200)),
                ('success', models.BooleanField(default=True)),
                ('pre_deliverable_item', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='deliverables.predeliverableitem')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.user')),
            ],
            options={'ordering': ['-sent_at']},
        ),
    ]

