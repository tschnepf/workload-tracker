from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0012_role_capacity_jsonb_index'),
    ]

    operations = [
        # Drop legacy indexes that are no longer present on the models
        migrations.RemoveIndex(
            model_name='assignment',
            name='idx_assignment_department',
        ),
        migrations.RemoveIndex(
            model_name='assignment',
            name='idx_assignment_role_fk',
        ),
        migrations.RemoveIndex(
            model_name='weeklyassignmentsnapshot',
            name='idx_was_role_week',
        ),

        # Align field definitions with current models
        migrations.AlterField(
            model_name='assignmentmembershipevent',
            name='hours_before',
            field=models.FloatField(default=0.0, validators=[django.core.validators.MinValueValidator(0.0)]),
        ),
        migrations.AlterField(
            model_name='assignmentmembershipevent',
            name='hours_after',
            field=models.FloatField(default=0.0, validators=[django.core.validators.MinValueValidator(0.0)]),
        ),
        migrations.AlterField(
            model_name='weeklyassignmentsnapshot',
            name='hours',
            field=models.FloatField(validators=[django.core.validators.MinValueValidator(0.0)]),
        ),

        # Migrate AutoField to BigAutoField for consistency with DEFAULT_AUTO_FIELD
        migrations.AlterField(
            model_name='assignmentmembershipevent',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='weeklyassignmentsnapshot',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
    ]

