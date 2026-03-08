from __future__ import annotations

import secrets
from datetime import date

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


class PersonReportGoal(models.Model):
    class GoalType(models.TextChoices):
        SKILL = "skill", "Skill"
        FREEFORM = "freeform", "Freeform"

    class GoalStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        ACHIEVED = "achieved", "Achieved"
        NOT_ACHIEVED = "not_achieved", "Not Achieved"
        CANCELLED = "cancelled", "Cancelled"

    person = models.ForeignKey(
        "people.Person",
        on_delete=models.CASCADE,
        related_name="report_goals",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    goal_type = models.CharField(max_length=20, choices=GoalType.choices, default=GoalType.FREEFORM)
    skill_tag = models.ForeignKey(
        "skills.SkillTag",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="person_report_goals",
    )
    linked_person_skill = models.OneToOneField(
        "skills.PersonSkill",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="person_report_goal",
    )
    status = models.CharField(max_length=20, choices=GoalStatus.choices, default=GoalStatus.ACTIVE)
    target_date = models.DateField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="person_report_goals_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="person_report_goals_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["person", "status"], name="pr_goal_person_status_idx"),
            models.Index(fields=["person", "target_date"], name="pr_goal_person_target_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"PersonReportGoal({self.id}, person={self.person_id}, {self.title})"


class PersonReportCheckin(models.Model):
    person = models.ForeignKey(
        "people.Person",
        on_delete=models.CASCADE,
        related_name="report_checkins",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    checkin_date = models.DateField(default=date.today)
    summary = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="person_report_checkins_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-checkin_date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["person", "period_start", "period_end"],
                name="uniq_person_checkin_period",
            )
        ]
        indexes = [
            models.Index(fields=["person", "checkin_date"], name="pr_checkin_person_date_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"PersonReportCheckin({self.id}, person={self.person_id}, {self.period_start}..{self.period_end})"


class PersonReportCheckinGoalSnapshot(models.Model):
    class Outcome(models.TextChoices):
        ACHIEVED = "achieved", "Achieved"
        NOT_ACHIEVED = "not_achieved", "Not Achieved"
        CARRY_FORWARD = "carry_forward", "Carry Forward"

    checkin = models.ForeignKey(
        PersonReportCheckin,
        on_delete=models.CASCADE,
        related_name="goal_snapshots",
    )
    goal = models.ForeignKey(
        PersonReportGoal,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkin_snapshots",
    )
    title_snapshot = models.CharField(max_length=200)
    goal_type_snapshot = models.CharField(max_length=20, choices=PersonReportGoal.GoalType.choices)
    skill_tag_snapshot = models.CharField(max_length=100, blank=True, default="")
    outcome = models.CharField(max_length=20, choices=Outcome.choices, default=Outcome.CARRY_FORWARD)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["checkin"], name="pr_checkin_goal_checkin_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"PersonReportCheckinGoalSnapshot({self.id}, checkin={self.checkin_id}, goal={self.goal_id})"
