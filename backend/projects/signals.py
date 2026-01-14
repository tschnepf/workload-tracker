from __future__ import annotations

import os
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from django.utils.text import slugify

from .models import ProjectRisk


def _marker_filename(project) -> str:
    parts = [
        slugify(getattr(project, 'client', '') or '') or 'client',
        slugify(getattr(project, 'project_number', '') or '') or 'project',
        slugify(getattr(project, 'name', '') or '') or 'project',
    ]
    name = '-'.join([p for p in parts if p]).strip('-') or 'project'
    return f"{name}.txt"


def _create_marker_file(instance: ProjectRisk) -> None:
    if not instance.attachment or not instance.attachment.name:
        return
    storage = instance.attachment.storage
    folder = os.path.dirname(instance.attachment.name)
    marker_name = os.path.join(folder, _marker_filename(instance.project))
    try:
        if storage.exists(marker_name):
            return
        storage.save(marker_name, ContentFile(b''))
    except Exception:
        # Fail silently; attachments should not fail due to marker creation
        return


@receiver(pre_save, sender=ProjectRisk)
def cleanup_replaced_attachment(sender, instance: ProjectRisk, **kwargs):
    if not instance.pk:
        return
    try:
        prev = ProjectRisk.objects.only('attachment').get(pk=instance.pk)
    except ProjectRisk.DoesNotExist:
        return
    prev_name = getattr(prev.attachment, 'name', '') or ''
    next_name = getattr(instance.attachment, 'name', '') or ''
    if prev_name and prev_name != next_name:
        try:
            prev.attachment.storage.delete(prev_name)
        except Exception:
            pass


@receiver(post_delete, sender=ProjectRisk)
def cleanup_deleted_attachment(sender, instance: ProjectRisk, **kwargs):
    name = getattr(instance.attachment, 'name', '') or ''
    if not name:
        return
    try:
        instance.attachment.storage.delete(name)
    except Exception:
        pass


@receiver(post_save, sender=ProjectRisk)
def create_marker_on_first_attachment(sender, instance: ProjectRisk, **kwargs):
    if not instance.attachment or not instance.attachment.name:
        return
    transaction.on_commit(lambda: _create_marker_file(instance))
