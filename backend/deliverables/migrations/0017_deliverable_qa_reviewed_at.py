from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deliverables', '0016_deliverable_qa_tasks'),
    ]

    operations = [
        migrations.AddField(
            model_name='deliverableqatask',
            name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='deliverableqatask',
            name='qa_status',
            field=models.CharField(choices=[('not_reviewed', 'Not Reviewed'), ('reviewed', 'Reviewed')], default='not_reviewed', max_length=30),
        ),
    ]
