from django.db import migrations, models


DEFAULT_MILESTONE_KEYS = ["sd", "dd", "ifp", "ifc"]
DEFAULT_WEEKS_COUNT = 6
MAX_WEEKS_COUNT = 18


def _normalize_key(value):
    return str(value or "").strip().lower()


def _coerce_weeks_count(value):
    try:
        parsed = int(value)
    except Exception:
        parsed = DEFAULT_WEEKS_COUNT
    return max(0, min(MAX_WEEKS_COUNT, parsed))


def _build_default_milestones(label_by_key):
    milestones = []
    for idx, key in enumerate(DEFAULT_MILESTONE_KEYS):
        milestones.append(
            {
                "key": key,
                "label": str(label_by_key.get(key) or key.upper()),
                "weeksCount": DEFAULT_WEEKS_COUNT,
                "sortOrder": idx,
                "sourceType": "global",
                "globalPhaseKey": key,
            }
        )
    return milestones


def forwards(apps, schema_editor):
    Template = apps.get_model("core", "AutoHoursTemplate")
    Phase = apps.get_model("core", "DeliverablePhaseDefinition")

    phase_rows = list(Phase.objects.order_by("sort_order", "id").values("key", "label"))
    global_keys = {_normalize_key(row.get("key")) for row in phase_rows if _normalize_key(row.get("key"))}
    label_by_key = {
        _normalize_key(row.get("key")): str(row.get("label") or "").strip()
        for row in phase_rows
        if _normalize_key(row.get("key"))
    }

    for template in Template.objects.all().iterator():
        phase_keys_raw = template.phase_keys if isinstance(template.phase_keys, list) else []
        weeks_by_phase_raw = template.weeks_by_phase if isinstance(template.weeks_by_phase, dict) else {}

        phase_keys = []
        for raw in phase_keys_raw:
            key = _normalize_key(raw)
            if key and key not in phase_keys:
                phase_keys.append(key)

        if not phase_keys:
            milestones = _build_default_milestones(label_by_key)
        else:
            milestones = []
            for idx, key in enumerate(phase_keys):
                source_type = "global" if (not global_keys or key in global_keys) else "template_local"
                row = {
                    "key": key,
                    "label": str(label_by_key.get(key) or key.upper()),
                    "weeksCount": _coerce_weeks_count(weeks_by_phase_raw.get(key)),
                    "sortOrder": idx,
                    "sourceType": source_type,
                }
                if source_type == "global":
                    row["globalPhaseKey"] = key
                milestones.append(row)
        template.milestones = milestones
        template.save(update_fields=["milestones"])


def backwards(apps, schema_editor):
    # Compatibility fields already remain on the model; nothing required on rollback.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0057_merge_20260309_0001"),
    ]

    operations = [
        migrations.AddField(
            model_name="autohourstemplate",
            name="milestones",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(forwards, backwards),
    ]
