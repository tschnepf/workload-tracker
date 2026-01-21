"""
Centralized shared enumerations and controlled vocabularies.

These TextChoices are reused across models/serializers to ensure a single
source of truth for statuses, phases, and event/source types while avoiding
import cycles between apps.
"""
from django.db import models


class ProjectStatus(models.TextChoices):
    PLANNING = "planning", "Planning"
    ACTIVE = "active", "Active"
    ACTIVE_CA = "active_ca", "Active CA"
    ON_HOLD = "on_hold", "On Hold"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class DeliverablePhase(models.TextChoices):
    SD = "sd", "SD"
    DD = "dd", "DD"
    IFP = "ifp", "IFP"
    IFC = "ifc", "IFC"
    MASTERPLAN = "masterplan", "Masterplan"
    BULLETINS = "bulletins", "Bulletins"
    CA = "ca", "CA"
    OTHER = "other", "Other"


class DeliverableTaskCompletionStatus(models.TextChoices):
    NOT_STARTED = "not_started", "Not Started"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETE = "complete", "Complete"


class DeliverableTaskQaStatus(models.TextChoices):
    NOT_REVIEWED = "not_reviewed", "Not Reviewed"
    IN_REVIEW = "in_review", "In Review"
    APPROVED = "approved", "Approved"
    CHANGES_REQUIRED = "changes_required", "Changes Required"


class DeliverableQAReviewStatus(models.TextChoices):
    NOT_REVIEWED = "not_reviewed", "Not Reviewed"
    REVIEWED = "reviewed", "Reviewed"


class SnapshotSource(models.TextChoices):
    ASSIGNED = "assigned", "Assigned"
    ASSIGNED_BACKFILL = "assigned_backfill", "Assigned Backfill"


class MembershipEventType(models.TextChoices):
    JOINED = "joined", "Joined"
    LEFT = "left", "Left"
