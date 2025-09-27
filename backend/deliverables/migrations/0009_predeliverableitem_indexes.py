from django.db import migrations, models
import django.db.models


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0008_predeliverableitem'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='predeliverableitem',
            index=models.Index(fields=['generated_date'], name='pdi_gen_date_idx'),
        ),
        migrations.AddIndex(
            model_name='predeliverableitem',
            index=models.Index(fields=['generated_date'], name='pdi_gen_date_active_idx', condition=models.Q(('is_active', True))),
        ),
    ]

