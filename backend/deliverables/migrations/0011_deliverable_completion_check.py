from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0010_allow_zero_days_before'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='deliverable',
            constraint=models.CheckConstraint(
                name='deliverable_completed_implies_date',
                check=(models.Q(is_completed=False) | models.Q(completed_date__isnull=False)),
            ),
        ),
    ]

