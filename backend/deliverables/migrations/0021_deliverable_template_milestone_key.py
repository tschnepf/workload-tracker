from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("deliverables", "0020_remove_deliverableqataskedit_qa_task_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="deliverable",
            name="template_milestone_key",
            field=models.CharField(
                blank=True,
                help_text="Template milestone key used for stable auto-hours matching",
                max_length=50,
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name="deliverable",
            index=models.Index(fields=["project", "template_milestone_key"], name="deliverable_proj_mskey"),
        ),
    ]
