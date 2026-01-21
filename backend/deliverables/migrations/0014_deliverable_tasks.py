from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0013_add_drawings_due_type'),
        ('departments', '0003_department_short_name'),
        ('people', '0009_deactivationaudit'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverableTaskTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phase', models.CharField(choices=[('sd', 'SD'), ('dd', 'DD'), ('ifp', 'IFP'), ('ifc', 'IFC'), ('masterplan', 'Masterplan'), ('bulletins', 'Bulletins'), ('ca', 'CA'), ('other', 'Other')], max_length=20)),
                ('sheet_number', models.CharField(blank=True, max_length=50, null=True)),
                ('sheet_name', models.CharField(blank=True, max_length=100, null=True)),
                ('scope_description', models.TextField(blank=True)),
                ('default_completion_status', models.CharField(choices=[('not_started', 'Not Started'), ('in_progress', 'In Progress'), ('complete', 'Complete')], default='not_started', max_length=30)),
                ('default_qa_status', models.CharField(choices=[('not_reviewed', 'Not Reviewed'), ('in_review', 'In Review'), ('approved', 'Approved'), ('changes_required', 'Changes Required')], default='not_reviewed', max_length=30)),
                ('sort_order', models.IntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='deliverable_task_templates', to='departments.department')),
            ],
            options={
                'verbose_name': 'Deliverable Task Template',
                'verbose_name_plural': 'Deliverable Task Templates',
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='DeliverableTask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sheet_number', models.CharField(blank=True, max_length=50, null=True)),
                ('sheet_name', models.CharField(blank=True, max_length=100, null=True)),
                ('scope_description', models.TextField(blank=True)),
                ('completion_status', models.CharField(choices=[('not_started', 'Not Started'), ('in_progress', 'In Progress'), ('complete', 'Complete')], default='not_started', max_length=30)),
                ('qa_status', models.CharField(choices=[('not_reviewed', 'Not Reviewed'), ('in_review', 'In Review'), ('approved', 'Approved'), ('changes_required', 'Changes Required')], default='not_reviewed', max_length=30)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='deliverable_tasks', to='people.person')),
                ('completed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='completed_deliverable_tasks', to='people.person')),
                ('deliverable', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='deliverables.deliverable')),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='deliverable_tasks', to='departments.department')),
                ('template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tasks', to='deliverables.deliverabletasktemplate')),
            ],
            options={
                'verbose_name': 'Deliverable Task',
                'verbose_name_plural': 'Deliverable Tasks',
                'ordering': ['deliverable_id', 'department_id', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='deliverabletask',
            constraint=models.UniqueConstraint(fields=('deliverable', 'template'), name='uniq_deliverable_task_template'),
        ),
        migrations.AddIndex(
            model_name='deliverabletask',
            index=models.Index(fields=['deliverable', 'assigned_to'], name='idx_deliv_task_assign'),
        ),
        migrations.AddIndex(
            model_name='deliverabletask',
            index=models.Index(fields=['deliverable', 'completion_status'], name='idx_deliv_task_status'),
        ),
    ]
