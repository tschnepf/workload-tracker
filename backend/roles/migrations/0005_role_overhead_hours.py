from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('roles', '0004_remove_role_idx_role_sort_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='overhead_hours_per_week',
            field=models.FloatField(default=0, help_text='Default overhead hours per week for people in this role', validators=[django.core.validators.MinValueValidator(0.0)]),
        ),
    ]
