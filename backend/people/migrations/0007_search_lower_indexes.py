from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ('people', '0006_indexes_phase3'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='person',
            index=models.Index(Lower('name'), name='person_name_lower_idx'),
        ),
        migrations.AddIndex(
            model_name='person',
            index=models.Index(Lower('email'), name='person_email_lower_idx'),
        ),
    ]

