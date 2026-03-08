from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


SCOPE_KEYS = [
    'report.network_graph',
    'report.person_report',
    'report.role_capacity',
    'report.team_forecast',
    'report.forecast_planner',
    'dashboard.executive',
    'dashboard.manager',
    'dashboard.heatmap',
    'analytics.by_client',
    'analytics.client_projects',
    'analytics.status_timeline',
    'analytics.deliverable_timeline',
    'analytics.role_capacity',
]


def _normalize_token(value):
    token = ' '.join(str(value or '').strip().lower().split())
    return token


def _default_config():
    config = {
        key: {
            'projectKeywords': [],
            'clientKeywords': [],
        }
        for key in SCOPE_KEYS
    }
    for key in ('report.network_graph', 'report.person_report'):
        config[key]['projectKeywords'] = ['overhead']
        config[key]['clientKeywords'] = ['smc']
    return config


def _normalize_config(raw):
    config = _default_config()
    if not isinstance(raw, dict):
        return config
    for scope_key, scope_value in raw.items():
        if scope_key not in config or not isinstance(scope_value, dict):
            continue
        project_keywords = []
        client_keywords = []
        for item in scope_value.get('projectKeywords', scope_value.get('project_keywords', [])) or []:
            token = _normalize_token(item)
            if token and token not in project_keywords:
                project_keywords.append(token)
        for item in scope_value.get('clientKeywords', scope_value.get('client_keywords', [])) or []:
            token = _normalize_token(item)
            if token and token not in client_keywords:
                client_keywords.append(token)
        config[scope_key] = {
            'projectKeywords': project_keywords,
            'clientKeywords': client_keywords,
        }
    return config


def seed_project_visibility_settings(apps, schema_editor):
    ProjectVisibilitySettings = apps.get_model('core', 'ProjectVisibilitySettings')
    NetworkGraphSettings = apps.get_model('core', 'NetworkGraphSettings')
    Project = apps.get_model('projects', 'Project')

    defaults = {'config_json': _default_config()}
    obj, created = ProjectVisibilitySettings.objects.get_or_create(key='default', defaults=defaults)

    config = _normalize_config(getattr(obj, 'config_json', None))

    # Ensure seeded defaults for network + person report.
    for scope_key in ('report.network_graph', 'report.person_report'):
        project_keywords = config[scope_key].setdefault('projectKeywords', [])
        client_keywords = config[scope_key].setdefault('clientKeywords', [])
        if 'overhead' not in project_keywords:
            project_keywords.append('overhead')
        if 'smc' not in client_keywords:
            client_keywords.append('smc')

    # Fold legacy network omitted project IDs into keyword list by project name.
    network_settings = NetworkGraphSettings.objects.filter(key='default').first()
    omitted_ids = []
    if network_settings is not None:
        raw_ids = getattr(network_settings, 'omitted_project_ids', None) or []
        for value in raw_ids:
            try:
                pid = int(value)
            except Exception:
                continue
            if pid > 0 and pid not in omitted_ids:
                omitted_ids.append(pid)

    if omitted_ids:
        names = list(Project.objects.filter(id__in=omitted_ids).values_list('name', flat=True))
        network_keywords = config['report.network_graph'].setdefault('projectKeywords', [])
        for name in names:
            token = _normalize_token(name)
            if token and token not in network_keywords:
                network_keywords.append(token)

    obj.config_json = config
    obj.save(update_fields=['config_json', 'updated_at'])


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0029_projecttask_completion_mode_and_more'),
        ('core', '0055_backupautomationsettings'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectVisibilitySettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('config_json', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='project_visibility_settings_updates', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Project Visibility Settings',
                'ordering': ['key'],
            },
        ),
        migrations.RunPython(seed_project_visibility_settings, noop_reverse),
    ]
