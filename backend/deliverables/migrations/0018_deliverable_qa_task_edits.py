from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0017_deliverable_qa_reviewed_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverableQATaskEdit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('reviewed', 'Reviewed'), ('unreviewed', 'Unreviewed')], max_length=20)),
                ('changes', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='deliverable_qa_task_edits', to=settings.AUTH_USER_MODEL)),
                ('qa_task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='edits', to='deliverables.deliverableqatask')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='deliverableqataskedit',
            index=models.Index(fields=['qa_task', 'created_at'], name='idx_dqataskedit_task_created'),
        ),
    ]
