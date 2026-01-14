from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

from projects.storage import RiskAttachmentStorage
from projects.models import risk_attachment_upload_to


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0015_project_status_inactive_choice'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('departments', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectRisk',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('attachment', models.FileField(blank=True, null=True, storage=RiskAttachmentStorage(), upload_to=risk_attachment_upload_to)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_project_risks', to=settings.AUTH_USER_MODEL)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='risks', to='projects.project')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_project_risks', to=settings.AUTH_USER_MODEL)),
                ('departments', models.ManyToManyField(blank=True, related_name='risk_entries', to='departments.department')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='projectrisk',
            index=models.Index(fields=['project', 'created_at'], name='idx_prisk_proj_created'),
        ),
    ]
