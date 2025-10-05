from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_fix_utilization_scheme_key'),
    ]

    operations = [
        migrations.RunSQL(
            sql=r'''
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme'
          AND column_name = 'mode'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme'
          AND column_name = 'scheme_mode'
    ) THEN
        ALTER TABLE core_utilizationscheme RENAME COLUMN mode TO scheme_mode;
    END IF;
END $$;
            ''',
            reverse_sql=r'''
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme'
          AND column_name = 'scheme_mode'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme'
          AND column_name = 'mode'
    ) THEN
        ALTER TABLE core_utilizationscheme RENAME COLUMN scheme_mode TO mode;
    END IF;
END $$;
            ''',
        ),
    ]

