from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_alter_notificationlog_id_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('name_key', models.CharField(max_length=120, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['name_key']},
        ),
        # Backfill example roles from existing assignments, best effort
        migrations.RunSQL(
            sql=(
                "DO $$ "
                "BEGIN "
                "IF EXISTS ("
                "    SELECT 1 FROM information_schema.tables "
                "    WHERE table_name = 'assignments_assignment' "
                "      AND table_schema = 'public'"
                ") THEN "
                "    INSERT INTO core_projectrole (name, name_key, created_at, updated_at) "
                "    SELECT DISTINCT role_on_project, LOWER(TRIM(role_on_project)), NOW(), NOW() "
                "    FROM assignments_assignment "
                "    WHERE role_on_project IS NOT NULL AND TRIM(role_on_project) <> '' "
                "    ON CONFLICT (name_key) DO NOTHING; "
                "END IF; "
                "END $$;"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
