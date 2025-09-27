from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0005_indexes_phase3'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['person', 'is_active'], name='asn_person_active_idx'),
        ),
    ]

