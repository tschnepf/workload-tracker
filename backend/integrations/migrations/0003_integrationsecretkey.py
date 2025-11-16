from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0002_integrationrule_schedule_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='IntegrationSecretKey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='default', max_length=50, unique=True)),
                ('encrypted_value', models.BinaryField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
    ]
