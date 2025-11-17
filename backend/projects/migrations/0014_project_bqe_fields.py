from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0013_add_notes_json'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='bqe_client_id',
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name='project',
            name='bqe_client_name',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='project',
            name='client_sync_policy_state',
            field=models.CharField(blank=True, default='preserve_local', max_length=32),
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['bqe_client_id'], name='idx_project_bqe_client_id'),
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['bqe_client_name'], name='idx_project_bqe_client_name'),
        ),
    ]
