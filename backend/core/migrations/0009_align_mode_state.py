from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_repair_all_utilization_scheme_columns'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='utilizationscheme',
                    name='mode',
                    field=models.CharField(
                        max_length=20,
                        choices=[('absolute_hours', 'Absolute Hours'), ('percent', 'Percent')],
                        default='absolute_hours',
                        db_column='scheme_mode',
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]

