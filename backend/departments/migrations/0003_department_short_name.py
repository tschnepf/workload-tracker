from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('departments', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='short_name',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
    ]
