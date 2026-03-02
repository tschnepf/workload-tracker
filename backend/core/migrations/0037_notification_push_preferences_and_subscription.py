from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_autohoursrolesetting_people_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationpreference',
            name='push_assignment_changes',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='push_daily_digest',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='push_pre_deliverable_reminders',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='web_push_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='WebPushSubscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('endpoint', models.TextField(unique=True)),
                ('p256dh', models.TextField()),
                ('auth', models.TextField()),
                ('expiration_time', models.BigIntegerField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('last_seen_at', models.DateTimeField(auto_now=True)),
                ('last_success_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='web_push_subscriptions', to='auth.user')),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
                'indexes': [
                    models.Index(fields=['user', 'is_active'], name='idx_push_sub_user_active'),
                    models.Index(fields=['is_active', 'updated_at'], name='idx_push_sub_active_updated'),
                ],
            },
        ),
    ]
