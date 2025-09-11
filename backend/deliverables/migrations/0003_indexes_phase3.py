from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0002_deliverableassignment'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='deliverable',
            index=models.Index(fields=['project', 'date', 'is_completed'], name='deliv_proj_date_done_idx'),
        ),
        migrations.AddIndex(
            model_name='deliverable',
            index=models.Index(fields=['updated_at'], name='deliv_updated_idx'),
        ),
    ]

