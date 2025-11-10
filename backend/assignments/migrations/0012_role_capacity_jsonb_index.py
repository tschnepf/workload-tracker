from django.db import migrations, connection


def create_jsonb_gin_index(apps, schema_editor):
    if connection.vendor != 'postgresql':
        return
    # Use a raw cursor to create index concurrently and safely ignore if exists
    with connection.cursor() as cur:
        # Note: CONCURRENTLY cannot run inside a function; use standard creation with IF NOT EXISTS
        cur.execute(
            "CREATE INDEX IF NOT EXISTS ix_asn_weekly_hours_gin ON assignments_assignment USING GIN (weekly_hours jsonb_ops)"
        )


def drop_jsonb_gin_index(apps, schema_editor):
    if connection.vendor != 'postgresql':
        return
    with connection.cursor() as cur:
        cur.execute("DROP INDEX IF EXISTS ix_asn_weekly_hours_gin")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('assignments', '0011_add_person_flags_to_snapshots'),
    ]

    operations = [
        migrations.RunPython(create_jsonb_gin_index, reverse_code=drop_jsonb_gin_index),
    ]
