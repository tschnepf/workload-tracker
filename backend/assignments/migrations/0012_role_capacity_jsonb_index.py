from django.db import migrations, connection


def create_jsonb_gin_index(apps, schema_editor):
    if connection.vendor != 'postgresql':
        return
    # Use a raw cursor to create index concurrently and safely ignore if exists
    with connection.cursor() as cur:
        cur.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = 'ix_asn_weekly_hours_gin'
                ) THEN
                    EXECUTE 'CREATE INDEX CONCURRENTLY ix_asn_weekly_hours_gin ON assignments_assignment USING GIN (weekly_hours jsonb_ops)';
                END IF;
            END$$;
            """
        )


def drop_jsonb_gin_index(apps, schema_editor):
    if connection.vendor != 'postgresql':
        return
    with connection.cursor() as cur:
        cur.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = 'ix_asn_weekly_hours_gin'
                ) THEN
                    EXECUTE 'DROP INDEX CONCURRENTLY ix_asn_weekly_hours_gin';
                END IF;
            END$$;
            """
        )


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('assignments', '0011_add_person_flags_to_snapshots'),
    ]

    operations = [
        migrations.RunPython(create_jsonb_gin_index, reverse_code=drop_jsonb_gin_index),
    ]

