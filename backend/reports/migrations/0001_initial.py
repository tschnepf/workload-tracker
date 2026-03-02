from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import reports.models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ForecastScenario",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=160)),
                ("description", models.TextField(blank=True, default="")),
                ("is_shared", models.BooleanField(default=False)),
                ("shared_token", models.CharField(db_index=True, default=reports.models._generate_shared_token, max_length=64, unique=True)),
                ("scenario_config", models.JSONField(blank=True, default=dict)),
                ("last_result", models.JSONField(blank=True, default=dict)),
                ("last_evaluated_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="forecast_scenarios", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-updated_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="forecastscenario",
            index=models.Index(fields=["owner", "updated_at"], name="fcst_scn_owner_upd_idx"),
        ),
        migrations.AddIndex(
            model_name="forecastscenario",
            index=models.Index(fields=["is_shared"], name="fcst_scn_shared_idx"),
        ),
    ]
