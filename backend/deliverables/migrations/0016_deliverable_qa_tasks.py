from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0015_deliverabletask_qa_assigned_to'),
        ('departments', '0003_department_short_name'),
        ('people', '0009_deactivationaudit'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverableQATask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qa_status', models.CharField(choices=[('not_reviewed', 'Not Reviewed'), ('in_review', 'In Review'), ('approved', 'Approved'), ('changes_required', 'Changes Required')], default='not_reviewed', max_length=30)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deliverable', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='qa_tasks', to='deliverables.deliverable')),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='deliverable_qa_tasks', to='departments.department')),
                ('qa_assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='qa_deliverable_checklist', to='people.person')),
            ],
            options={
                'verbose_name': 'Deliverable QA Task',
                'verbose_name_plural': 'Deliverable QA Tasks',
                'ordering': ['deliverable_id', 'department_id', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='deliverableqatask',
            constraint=models.UniqueConstraint(fields=('deliverable', 'department'), name='uniq_deliverable_qa_department'),
        ),
        migrations.AddIndex(
            model_name='deliverableqatask',
            index=models.Index(fields=['deliverable', 'department'], name='idx_deliv_qa_dept'),
        ),
    ]
