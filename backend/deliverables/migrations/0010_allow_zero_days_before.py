from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0009_predeliverableitem_indexes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='predeliverabletype',
            name='default_days_before',
            field=models.IntegerField(validators=[django.core.validators.MinValueValidator(0)]),
        ),
    ]

