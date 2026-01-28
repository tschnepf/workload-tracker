from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('deliverables', '0018_deliverable_qa_task_edits'),
    ]

    operations = [
        migrations.AlterField(
            model_name='deliverabletasktemplate',
            name='phase',
            field=models.CharField(max_length=20),
        ),
    ]
