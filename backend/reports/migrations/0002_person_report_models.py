import datetime
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_person_report_goals(apps, schema_editor):
    PersonReportGoal = apps.get_model('reports', 'PersonReportGoal')
    PersonSkill = apps.get_model('skills', 'PersonSkill')

    auth_app_label, auth_model_name = settings.AUTH_USER_MODEL.split('.')
    UserModel = apps.get_model(auth_app_label, auth_model_name)

    actor = None
    try:
        actor = UserModel.objects.filter(is_staff=True).order_by('id').first()
    except Exception:
        actor = UserModel.objects.order_by('id').first()

    actor_id = getattr(actor, 'id', None)
    existing_links = set(
        PersonReportGoal.objects.exclude(linked_person_skill_id__isnull=True).values_list(
            'linked_person_skill_id', flat=True
        )
    )

    to_create = []
    for row in PersonSkill.objects.filter(skill_type='goals').values(
        'id',
        'person_id',
        'skill_tag_id',
        'skill_tag__name',
    ):
        person_skill_id = row['id']
        if person_skill_id in existing_links:
            continue
        title = (row.get('skill_tag__name') or '').strip() or f'Skill Goal {person_skill_id}'
        to_create.append(
            PersonReportGoal(
                person_id=row['person_id'],
                title=title,
                description='',
                goal_type='skill',
                skill_tag_id=row.get('skill_tag_id'),
                linked_person_skill_id=person_skill_id,
                status='active',
                target_date=None,
                closed_at=None,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
        )

    if to_create:
        PersonReportGoal.objects.bulk_create(to_create, ignore_conflicts=True)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('skills', '0006_rename_personskill_types'),
        ('reports', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PersonReportCheckin',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_start', models.DateField()),
                ('period_end', models.DateField()),
                ('checkin_date', models.DateField(default=datetime.date.today)),
                ('summary', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='person_report_checkins_created', to=settings.AUTH_USER_MODEL)),
                ('person', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='report_checkins', to='people.person')),
            ],
            options={
                'ordering': ['-checkin_date', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PersonReportGoal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('goal_type', models.CharField(choices=[('skill', 'Skill'), ('freeform', 'Freeform')], default='freeform', max_length=20)),
                ('status', models.CharField(choices=[('active', 'Active'), ('achieved', 'Achieved'), ('not_achieved', 'Not Achieved'), ('cancelled', 'Cancelled')], default='active', max_length=20)),
                ('target_date', models.DateField(blank=True, null=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='person_report_goals_created', to=settings.AUTH_USER_MODEL)),
                ('linked_person_skill', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='person_report_goal', to='skills.personskill')),
                ('person', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='report_goals', to='people.person')),
                ('skill_tag', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='person_report_goals', to='skills.skilltag')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='person_report_goals_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PersonReportCheckinGoalSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title_snapshot', models.CharField(max_length=200)),
                ('goal_type_snapshot', models.CharField(choices=[('skill', 'Skill'), ('freeform', 'Freeform')], max_length=20)),
                ('skill_tag_snapshot', models.CharField(blank=True, default='', max_length=100)),
                ('outcome', models.CharField(choices=[('achieved', 'Achieved'), ('not_achieved', 'Not Achieved'), ('carry_forward', 'Carry Forward')], default='carry_forward', max_length=20)),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('checkin', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='goal_snapshots', to='reports.personreportcheckin')),
                ('goal', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='checkin_snapshots', to='reports.personreportgoal')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddConstraint(
            model_name='personreportcheckin',
            constraint=models.UniqueConstraint(fields=('person', 'period_start', 'period_end'), name='uniq_person_checkin_period'),
        ),
        migrations.AddIndex(
            model_name='personreportcheckin',
            index=models.Index(fields=['person', 'checkin_date'], name='pr_checkin_person_date_idx'),
        ),
        migrations.AddIndex(
            model_name='personreportgoal',
            index=models.Index(fields=['person', 'status'], name='pr_goal_person_status_idx'),
        ),
        migrations.AddIndex(
            model_name='personreportgoal',
            index=models.Index(fields=['person', 'target_date'], name='pr_goal_person_target_idx'),
        ),
        migrations.AddIndex(
            model_name='personreportcheckingoalsnapshot',
            index=models.Index(fields=['checkin'], name='pr_checkin_goal_checkin_idx'),
        ),
        migrations.RunPython(seed_person_report_goals, noop_reverse),
    ]
