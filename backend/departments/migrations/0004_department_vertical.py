from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('verticals', '0001_initial'),
        ('departments', '0003_department_short_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='vertical',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='departments',
                to='verticals.vertical',
            ),
        ),
    ]
