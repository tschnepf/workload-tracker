from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0006_integrationclient'),
    ]

    operations = [
        migrations.CreateModel(
            name='IntegrationProviderCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('client_id', models.CharField(max_length=255)),
                ('redirect_uri', models.CharField(max_length=500)),
                ('encrypted_client_secret', models.BinaryField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('provider', models.OneToOneField(on_delete=models.deletion.CASCADE, related_name='credentials', to='integrations.integrationprovider')),
            ],
            options={'ordering': ['provider']},
        ),
    ]

