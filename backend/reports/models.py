from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models


def _generate_shared_token() -> str:
    return secrets.token_urlsafe(24)


class ForecastScenario(models.Model):
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="forecast_scenarios",
    )
    is_shared = models.BooleanField(default=False)
    shared_token = models.CharField(max_length=64, unique=True, db_index=True, default=_generate_shared_token)
    scenario_config = models.JSONField(default=dict, blank=True)
    last_result = models.JSONField(default=dict, blank=True)
    last_evaluated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["owner", "updated_at"], name="fcst_scn_owner_upd_idx"),
            models.Index(fields=["is_shared"], name="fcst_scn_shared_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"ForecastScenario({self.id}, {self.name})"
