from django.conf import settings
from django.db import migrations


def backfill_user_profiles(apps, schema_editor):
    user_model_label = settings.AUTH_USER_MODEL
    app_label, model_name = user_model_label.split('.')
    User = apps.get_model(app_label, model_name)
    UserProfile = apps.get_model('accounts', 'UserProfile')

    # Iterate through all users and ensure a profile exists
    for user in User.objects.all().only('pk'):
        UserProfile.objects.get_or_create(user_id=user.pk)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill_user_profiles, migrations.RunPython.noop),
    ]

