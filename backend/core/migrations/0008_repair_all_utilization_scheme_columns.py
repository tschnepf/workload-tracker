from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_harden_scheme_mode_column'),
    ]

    operations = [
        migrations.RunSQL(
            sql=r'''
DO $$
BEGIN
    -- Ensure all expected columns exist with safe defaults, then enforce NOT NULL
    -- blue_min
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'blue_min'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN blue_min integer;
        UPDATE core_utilizationscheme SET blue_min = 1 WHERE blue_min IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN blue_min SET NOT NULL;
    END IF;

    -- blue_max
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'blue_max'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN blue_max integer;
        UPDATE core_utilizationscheme SET blue_max = 29 WHERE blue_max IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN blue_max SET NOT NULL;
    END IF;

    -- green_min
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'green_min'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN green_min integer;
        UPDATE core_utilizationscheme SET green_min = 30 WHERE green_min IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN green_min SET NOT NULL;
    END IF;

    -- green_max
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'green_max'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN green_max integer;
        UPDATE core_utilizationscheme SET green_max = 36 WHERE green_max IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN green_max SET NOT NULL;
    END IF;

    -- orange_min
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'orange_min'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN orange_min integer;
        UPDATE core_utilizationscheme SET orange_min = 37 WHERE orange_min IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN orange_min SET NOT NULL;
    END IF;

    -- orange_max
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'orange_max'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN orange_max integer;
        UPDATE core_utilizationscheme SET orange_max = 40 WHERE orange_max IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN orange_max SET NOT NULL;
    END IF;

    -- red_min
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'red_min'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN red_min integer;
        UPDATE core_utilizationscheme SET red_min = 41 WHERE red_min IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN red_min SET NOT NULL;
    END IF;

    -- zero_is_blank
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'zero_is_blank'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN zero_is_blank boolean;
        UPDATE core_utilizationscheme SET zero_is_blank = TRUE WHERE zero_is_blank IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN zero_is_blank SET NOT NULL;
    END IF;

    -- version
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'version'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN version integer;
        UPDATE core_utilizationscheme SET version = 1 WHERE version IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN version SET NOT NULL;
    END IF;

    -- updated_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE core_utilizationscheme ADD COLUMN updated_at timestamp with time zone DEFAULT now();
        UPDATE core_utilizationscheme SET updated_at = now() WHERE updated_at IS NULL;
        ALTER TABLE core_utilizationscheme ALTER COLUMN updated_at DROP DEFAULT;
        ALTER TABLE core_utilizationscheme ALTER COLUMN updated_at SET NOT NULL;
    END IF;
END $$;
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]

