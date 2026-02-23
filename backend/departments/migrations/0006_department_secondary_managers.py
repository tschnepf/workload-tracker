from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('departments', '0005_department_vertical_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='secondary_managers',
            field=models.ManyToManyField(
                blank=True,
                related_name='secondary_managed_departments',
                to='people.person',
            ),
        ),
    ]
