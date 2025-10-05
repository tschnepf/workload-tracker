from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_rename_mode_column'),
    ]

    operations = [
        migrations.RunSQL(
            sql=r'''
DO $$
BEGIN
    -- Ensure scheme_mode exists; if legacy column "mode" exists, rename; otherwise add with default
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'core_utilizationscheme' AND column_name = 'scheme_mode'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'core_utilizationscheme' AND column_name = 'mode'
        ) THEN
            ALTER TABLE core_utilizationscheme RENAME COLUMN "mode" TO scheme_mode;
        ELSE
            ALTER TABLE core_utilizationscheme ADD COLUMN scheme_mode varchar(20);
            UPDATE core_utilizationscheme SET scheme_mode = 'absolute_hours' WHERE scheme_mode IS NULL;
            ALTER TABLE core_utilizationscheme ALTER COLUMN scheme_mode SET NOT NULL;
        END IF;
    END IF;
END $$;
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]

