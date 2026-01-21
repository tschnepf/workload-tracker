from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_risk_attachment_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverablePhaseMappingSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(default='default', max_length=20, unique=True)),
                ('use_description_match', models.BooleanField(default=True)),
                ('desc_sd_tokens', models.JSONField(default=list)),
                ('desc_dd_tokens', models.JSONField(default=list)),
                ('desc_ifp_tokens', models.JSONField(default=list)),
                ('desc_ifc_tokens', models.JSONField(default=list)),
                ('range_sd_min', models.IntegerField(default=1, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('range_sd_max', models.IntegerField(default=40, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('range_dd_min', models.IntegerField(default=41, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('range_dd_max', models.IntegerField(default=89, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('range_ifp_min', models.IntegerField(default=90, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('range_ifp_max', models.IntegerField(default=99, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('range_ifc_exact', models.IntegerField(default=100, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
                'verbose_name': 'Deliverable Phase Mapping Settings',
            },
        ),
    ]
