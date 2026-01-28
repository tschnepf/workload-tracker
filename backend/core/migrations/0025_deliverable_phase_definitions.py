from django.db import migrations, models


def seed_phase_definitions(apps, schema_editor):
    Settings = apps.get_model('core', 'DeliverablePhaseMappingSettings')
    Phase = apps.get_model('core', 'DeliverablePhaseDefinition')
    try:
        settings = Settings.objects.filter(key='default').first()
    except Exception:
        settings = None
    if Phase.objects.exists():
        return
    defaults = {
        'use_description_match': True,
        'desc_sd_tokens': ['sd', 'schematic'],
        'desc_dd_tokens': ['dd', 'design development'],
        'desc_ifp_tokens': ['ifp'],
        'desc_ifc_tokens': ['ifc'],
        'range_sd_min': 0,
        'range_sd_max': 40,
        'range_dd_min': 41,
        'range_dd_max': 89,
        'range_ifp_min': 90,
        'range_ifp_max': 99,
        'range_ifc_exact': 100,
    }
    data = {
        'desc_sd_tokens': getattr(settings, 'desc_sd_tokens', defaults['desc_sd_tokens']) if settings else defaults['desc_sd_tokens'],
        'desc_dd_tokens': getattr(settings, 'desc_dd_tokens', defaults['desc_dd_tokens']) if settings else defaults['desc_dd_tokens'],
        'desc_ifp_tokens': getattr(settings, 'desc_ifp_tokens', defaults['desc_ifp_tokens']) if settings else defaults['desc_ifp_tokens'],
        'desc_ifc_tokens': getattr(settings, 'desc_ifc_tokens', defaults['desc_ifc_tokens']) if settings else defaults['desc_ifc_tokens'],
        'range_sd_min': getattr(settings, 'range_sd_min', defaults['range_sd_min']) if settings else defaults['range_sd_min'],
        'range_sd_max': getattr(settings, 'range_sd_max', defaults['range_sd_max']) if settings else defaults['range_sd_max'],
        'range_dd_min': getattr(settings, 'range_dd_min', defaults['range_dd_min']) if settings else defaults['range_dd_min'],
        'range_dd_max': getattr(settings, 'range_dd_max', defaults['range_dd_max']) if settings else defaults['range_dd_max'],
        'range_ifp_min': getattr(settings, 'range_ifp_min', defaults['range_ifp_min']) if settings else defaults['range_ifp_min'],
        'range_ifp_max': getattr(settings, 'range_ifp_max', defaults['range_ifp_max']) if settings else defaults['range_ifp_max'],
        'range_ifc_exact': getattr(settings, 'range_ifc_exact', defaults['range_ifc_exact']) if settings else defaults['range_ifc_exact'],
    }

    sd_min = int(data['range_sd_min'])
    if sd_min > 0:
        sd_min = 0

    Phase.objects.bulk_create([
        Phase(key='sd', label='SD', description_tokens=data['desc_sd_tokens'], range_min=sd_min, range_max=int(data['range_sd_max']), sort_order=0),
        Phase(key='dd', label='DD', description_tokens=data['desc_dd_tokens'], range_min=int(data['range_dd_min']), range_max=int(data['range_dd_max']), sort_order=1),
        Phase(key='ifp', label='IFP', description_tokens=data['desc_ifp_tokens'], range_min=int(data['range_ifp_min']), range_max=int(data['range_ifp_max']), sort_order=2),
        Phase(key='ifc', label='IFC', description_tokens=data['desc_ifc_tokens'], range_min=int(data['range_ifc_exact']), range_max=int(data['range_ifc_exact']), sort_order=3),
    ])


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0024_auto_hours_template_phases'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverablePhaseDefinition',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=20, unique=True)),
                ('label', models.CharField(max_length=50)),
                ('description_tokens', models.JSONField(blank=True, default=list)),
                ('range_min', models.IntegerField(blank=True, null=True)),
                ('range_max', models.IntegerField(blank=True, null=True)),
                ('sort_order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['sort_order', 'id'],
                'verbose_name': 'Deliverable Phase Definition',
            },
        ),
        migrations.RunPython(seed_phase_definitions, migrations.RunPython.noop),
    ]
