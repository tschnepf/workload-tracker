from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('people', '0001_initial'),
        ('projects', '0011_migrate_roles_from_core_mapping'),
        ('assignments', '0009_backfill_role_fk_and_enforce_trigger'),
    ]

    operations = [
        migrations.CreateModel(
            name='WeeklyAssignmentSnapshot',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_start', models.DateField(help_text='Sunday ISO date key (UTC)')),
                ('role_on_project_id', models.IntegerField(blank=True, null=True)),
                ('department_id', models.IntegerField(blank=True, null=True)),
                ('project_status', models.CharField(blank=True, max_length=20, null=True)),
                ('deliverable_phase', models.CharField(choices=[('sd', 'SD'), ('dd', 'DD'), ('ifp', 'IFP'), ('masterplan', 'Masterplan'), ('bulletins', 'Bulletins'), ('ca', 'CA'), ('other', 'Other')], default='other', max_length=20)),
                ('hours', models.FloatField()),
                ('source', models.CharField(choices=[('assigned', 'Assigned'), ('assigned_backfill', 'Assigned Backfill')], default='assigned', max_length=20)),
                ('person_name', models.CharField(blank=True, default='', max_length=200)),
                ('project_name', models.CharField(blank=True, default='', max_length=200)),
                ('client', models.CharField(blank=True, default='', max_length=100)),
                ('captured_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('person', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='weekly_snapshots', to='people.person')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='weekly_snapshots', to='projects.project')),
            ],
            options={
                'ordering': ['-week_start', 'person_id', 'project_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='weeklyassignmentsnapshot',
            constraint=models.UniqueConstraint(fields=('person', 'project', 'role_on_project_id', 'week_start', 'source'), name='uniq_weekly_snapshot_identity'),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['week_start'], name='idx_was_week_start'),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['department_id', 'week_start'], name='idx_was_dept_week'),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['client', 'week_start'], name='idx_was_client_week'),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['person', 'week_start'], name='idx_was_person_week'),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['project', 'role_on_project_id', 'week_start'], name='idx_was_project_role_week'),
        ),
        migrations.AddIndex(
            model_name='weeklyassignmentsnapshot',
            index=models.Index(fields=['client', 'person'], name='idx_was_client_person'),
        ),

        migrations.CreateModel(
            name='AssignmentMembershipEvent',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_start', models.DateField(help_text='Sunday ISO date key (UTC)')),
                ('role_on_project_id', models.IntegerField(blank=True, null=True)),
                ('event_type', models.CharField(choices=[('joined', 'Joined'), ('left', 'Left')], max_length=20)),
                ('deliverable_phase', models.CharField(choices=[('sd', 'SD'), ('dd', 'DD'), ('ifp', 'IFP'), ('masterplan', 'Masterplan'), ('bulletins', 'Bulletins'), ('ca', 'CA'), ('other', 'Other')], default='other', max_length=20)),
                ('hours_before', models.FloatField(default=0.0)),
                ('hours_after', models.FloatField(default=0.0)),
                ('person_name', models.CharField(blank=True, default='', max_length=200)),
                ('project_name', models.CharField(blank=True, default='', max_length=200)),
                ('client', models.CharField(blank=True, default='', max_length=100)),
                ('captured_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('person', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignment_membership_events', to='people.person')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignment_membership_events', to='projects.project')),
            ],
            options={
                'ordering': ['-week_start', 'person_id', 'project_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='assignmentmembershipevent',
            constraint=models.UniqueConstraint(fields=('person', 'project', 'role_on_project_id', 'event_type', 'week_start'), name='uniq_membership_event_identity'),
        ),
        migrations.AddIndex(
            model_name='assignmentmembershipevent',
            index=models.Index(fields=['person', 'project', 'week_start'], name='idx_ame_person_project_week'),
        ),
        migrations.AddIndex(
            model_name='assignmentmembershipevent',
            index=models.Index(fields=['client', 'week_start'], name='idx_ame_client_week'),
        ),
    ]

