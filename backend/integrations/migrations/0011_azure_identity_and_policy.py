from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0010_integration_legacy_ids'),
        ('departments', '0006_department_secondary_managers'),
        ('people', '0010_restore_search_indexes'),
        ('roles', '0005_role_overhead_hours'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AuthMethodPolicy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('azure_sso_enabled', models.BooleanField(default=False)),
                ('azure_sso_enforced', models.BooleanField(default=False)),
                ('password_login_enabled_non_break_glass', models.BooleanField(default=True)),
                ('frontend_complete_path', models.CharField(default='/sso/complete', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('break_glass_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='break_glass_policies', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='AzureDepartmentMapping',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_value', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('connection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='azure_department_mappings', to='integrations.integrationconnection')),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='azure_department_mappings', to='departments.department')),
            ],
        ),
        migrations.CreateModel(
            name='AzureIdentityLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenant_id', models.CharField(max_length=128)),
                ('azure_oid', models.CharField(max_length=128)),
                ('upn_at_link', models.CharField(blank=True, default='', max_length=255)),
                ('email_at_link', models.CharField(blank=True, default='', max_length=255)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('connection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='azure_identity_links', to='integrations.integrationconnection')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='azure_identity_links', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='AzureReconciliationRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('azure_principal_id', models.CharField(max_length=128)),
                ('tenant_id', models.CharField(blank=True, default='', max_length=128)),
                ('upn', models.CharField(blank=True, default='', max_length=255)),
                ('email', models.CharField(blank=True, default='', max_length=255)),
                ('display_name', models.CharField(blank=True, default='', max_length=255)),
                ('department', models.CharField(blank=True, default='', max_length=255)),
                ('job_title', models.CharField(blank=True, default='', max_length=255)),
                ('status', models.CharField(choices=[('proposed', 'Proposed'), ('conflict', 'Conflict'), ('confirmed', 'Confirmed'), ('rejected', 'Rejected'), ('applied', 'Applied'), ('unmatched', 'Unmatched')], default='unmatched', max_length=20)),
                ('confidence', models.FloatField(default=0.0)),
                ('reason_codes', models.JSONField(blank=True, default=list)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('candidate_person', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='azure_reconciliation_candidates', to='people.person')),
                ('candidate_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='azure_reconciliation_candidates', to=settings.AUTH_USER_MODEL)),
                ('connection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='azure_reconciliation_records', to='integrations.integrationconnection')),
                ('resolved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='azure_reconciliations_resolved', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='AzureRoleMapping',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_value', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('connection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='azure_role_mappings', to='integrations.integrationconnection')),
                ('role', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='azure_role_mappings', to='roles.role')),
            ],
        ),
        migrations.AddConstraint(
            model_name='azuredepartmentmapping',
            constraint=models.UniqueConstraint(fields=('connection', 'source_value'), name='uniq_azure_department_mapping'),
        ),
        migrations.AddConstraint(
            model_name='azureidentitylink',
            constraint=models.UniqueConstraint(fields=('tenant_id', 'azure_oid'), name='uniq_azure_identity_tid_oid'),
        ),
        migrations.AddConstraint(
            model_name='azureidentitylink',
            constraint=models.UniqueConstraint(condition=Q(is_active=True), fields=('user',), name='uniq_azure_identity_user_active'),
        ),
        migrations.AddConstraint(
            model_name='azurereconciliationrecord',
            constraint=models.UniqueConstraint(fields=('connection', 'azure_principal_id'), name='uniq_azure_reconciliation_principal'),
        ),
        migrations.AddConstraint(
            model_name='azurerolemapping',
            constraint=models.UniqueConstraint(fields=('connection', 'source_value'), name='uniq_azure_role_mapping'),
        ),
        migrations.AddIndex(
            model_name='azuredepartmentmapping',
            index=models.Index(fields=['connection', 'source_value'], name='idx_azure_dept_map_lookup'),
        ),
        migrations.AddIndex(
            model_name='azureidentitylink',
            index=models.Index(fields=['connection', 'is_active'], name='idx_azure_identity_conn_active'),
        ),
        migrations.AddIndex(
            model_name='azureidentitylink',
            index=models.Index(fields=['user', 'is_active'], name='idx_azure_identity_user_active'),
        ),
        migrations.AddIndex(
            model_name='azurereconciliationrecord',
            index=models.Index(fields=['connection', 'status'], name='idx_azure_recon_conn_status'),
        ),
        migrations.AddIndex(
            model_name='azurereconciliationrecord',
            index=models.Index(fields=['status', 'updated_at'], name='idx_azure_recon_status_updated'),
        ),
        migrations.AddIndex(
            model_name='azurerolemapping',
            index=models.Index(fields=['connection', 'source_value'], name='idx_azure_role_map_lookup'),
        ),
    ]
