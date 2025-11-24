from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0008_drop_company_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='integrationconnection',
            name='utc_offset_minutes',
            field=models.SmallIntegerField(
                default=0,
                help_text='Timezone offset in minutes for APIs requiring X-UTC-OFFSET headers.',
                validators=[
                    django.core.validators.MinValueValidator(-720),
                    django.core.validators.MaxValueValidator(840),
                ],
            ),
        ),
    ]
