from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0003_indexes_phase3'),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER TABLE "deliverables_deliverableassignment" DROP COLUMN IF EXISTS "weekly_hours"',
            reverse_sql=migrations.RunSQL.noop
        )
    ]
